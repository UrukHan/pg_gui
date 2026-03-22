package controllers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"back/database"
	"back/middleware"
	"back/models"
)

func ListExperiments(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	var experiments []models.Experiment

	query := database.DB.Preload("User").Order("id DESC")

	// If user has read_own permission, only show their experiments
	if user.Role != models.RoleAdmin && user.Permission == models.PermReadOwn {
		query = query.Where("user_id = ?", user.ID)
	}

	if err := query.Find(&experiments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, experiments)
}

func GetExperiment(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	user := middleware.GetCurrentUser(c)
	var exp models.Experiment
	if err := database.DB.Preload("User").First(&exp, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "experiment not found"})
		return
	}

	// Check permissions
	if user.Role != models.RoleAdmin && user.Permission == models.PermReadOwn && exp.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}

	c.JSON(http.StatusOK, exp)
}

func GetExperimentData(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	user := middleware.GetCurrentUser(c)
	var exp models.Experiment
	if err := database.DB.First(&exp, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "experiment not found"})
		return
	}

	if user.Role != models.RoleAdmin && user.Permission == models.PermReadOwn && exp.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}

	// Single query for time bounds + total count
	var stats struct {
		TimeMin *time.Time
		TimeMax *time.Time
		Total   int64
	}
	database.DB.Model(&models.Measurement{}).
		Where("experiment_id = ?", id).
		Select("MIN(recorded_at) as time_min, MAX(recorded_at) as time_max, COUNT(*) as total").
		Scan(&stats)

	// Build WHERE conditions for time range filter
	type whereClause struct {
		cond string
		val  interface{}
	}
	var extraWhere []whereClause
	if fromStr := c.Query("from"); fromStr != "" {
		if t, err := time.Parse(time.RFC3339Nano, fromStr); err == nil {
			extraWhere = append(extraWhere, whereClause{"recorded_at >= ?", t})
		}
	}
	if toStr := c.Query("to"); toStr != "" {
		if t, err := time.Parse(time.RFC3339Nano, toStr); err == nil {
			extraWhere = append(extraWhere, whereClause{"recorded_at <= ?", t})
		}
	}

	// Count in filtered range
	filteredCount := stats.Total
	if len(extraWhere) > 0 {
		q := database.DB.Model(&models.Measurement{}).Where("experiment_id = ?", id)
		for _, w := range extraWhere {
			q = q.Where(w.cond, w.val)
		}
		q.Count(&filteredCount)
	}

	// Step (decimation): ?step=N or auto from ?max_points=N
	step := 1
	if s, err := strconv.Atoi(c.Query("step")); err == nil && s > 1 {
		step = s
	}
	if mp, err := strconv.Atoi(c.Query("max_points")); err == nil && mp > 0 && filteredCount > int64(mp) {
		step = int(filteredCount) / mp
		if step < 1 {
			step = 1
		}
	}

	// Pagination: ?page=1&per_page=500
	page := 1
	perPage := 2000
	if p, err := strconv.Atoi(c.Query("page")); err == nil && p > 0 {
		page = p
	}
	if pp, err := strconv.Atoi(c.Query("per_page")); err == nil && pp > 0 && pp <= 50000 {
		perPage = pp
	}

	var measurements []models.Measurement

	if step > 1 {
		// Efficient SQL-based decimation using ROW_NUMBER()
		// Build the inner WHERE clause
		innerWhere := "experiment_id = ?"
		args := []interface{}{id}
		for _, w := range extraWhere {
			innerWhere += " AND " + w.cond
			args = append(args, w.val)
		}

		decimatedTotal := filteredCount / int64(step)
		offset := (page - 1) * perPage

		query := `
			SELECT * FROM (
				SELECT *, ROW_NUMBER() OVER (ORDER BY recorded_at ASC) AS rn
				FROM measurements
				WHERE ` + innerWhere + `
			) sub
			WHERE (sub.rn - 1) % ? = 0
			ORDER BY recorded_at ASC
			LIMIT ? OFFSET ?`
		args = append(args, step, perPage, offset)

		database.DB.Raw(query, args...).Scan(&measurements)
		if measurements == nil {
			measurements = []models.Measurement{}
		}

		c.JSON(http.StatusOK, gin.H{
			"experiment":     exp,
			"measurements":   measurements,
			"total":          stats.Total,
			"filtered_total": decimatedTotal,
			"page":           page,
			"per_page":       perPage,
			"time_min":       stats.TimeMin,
			"time_max":       stats.TimeMax,
		})
		return
	}

	// No decimation — simple pagination
	offset := (page - 1) * perPage
	q := database.DB.Where("experiment_id = ?", id)
	for _, w := range extraWhere {
		q = q.Where(w.cond, w.val)
	}
	if err := q.Order("recorded_at ASC").Offset(offset).Limit(perPage).Find(&measurements).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"experiment":     exp,
		"measurements":   measurements,
		"total":          stats.Total,
		"filtered_total": filteredCount,
		"page":           page,
		"per_page":       perPage,
		"time_min":       stats.TimeMin,
		"time_max":       stats.TimeMax,
	})
}

func DeleteExperiment(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	user := middleware.GetCurrentUser(c)
	var exp models.Experiment
	if err := database.DB.First(&exp, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "experiment not found"})
		return
	}

	// Only admin or owner with write permission can delete
	if user.Role != models.RoleAdmin {
		if user.Permission != models.PermReadWriteAll && exp.UserID != user.ID {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			return
		}
	}

	// Delete measurements first
	database.DB.Where("experiment_id = ?", id).Delete(&models.Measurement{})
	if err := database.DB.Delete(&exp).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
