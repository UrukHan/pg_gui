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

	// Time bounds for the full experiment
	var timeMin, timeMax *time.Time
	database.DB.Model(&models.Measurement{}).
		Where("experiment_id = ?", id).
		Select("MIN(recorded_at)").Row().Scan(&timeMin)
	database.DB.Model(&models.Measurement{}).
		Where("experiment_id = ?", id).
		Select("MAX(recorded_at)").Row().Scan(&timeMax)

	// Total count (unfiltered)
	var totalCount int64
	database.DB.Model(&models.Measurement{}).Where("experiment_id = ?", id).Count(&totalCount)

	// Build filtered query
	q := database.DB.Where("experiment_id = ?", id)

	// Time range filter: ?from=<RFC3339>&to=<RFC3339>
	if fromStr := c.Query("from"); fromStr != "" {
		if t, err := time.Parse(time.RFC3339Nano, fromStr); err == nil {
			q = q.Where("recorded_at >= ?", t)
		}
	}
	if toStr := c.Query("to"); toStr != "" {
		if t, err := time.Parse(time.RFC3339Nano, toStr); err == nil {
			q = q.Where("recorded_at <= ?", t)
		}
	}

	// Count after time filter
	var filteredCount int64
	q.Model(&models.Measurement{}).Count(&filteredCount)

	// Step (decimation): ?step=N  — return every Nth row
	step := 1
	if s, err := strconv.Atoi(c.Query("step")); err == nil && s > 1 {
		step = s
	}

	// Pagination: ?page=1&per_page=500
	page := 1
	perPage := 2000 // default generous limit
	if p, err := strconv.Atoi(c.Query("page")); err == nil && p > 0 {
		page = p
	}
	if pp, err := strconv.Atoi(c.Query("per_page")); err == nil && pp > 0 && pp <= 10000 {
		perPage = pp
	}

	var measurements []models.Measurement
	if step > 1 {
		// Use ROW_NUMBER for decimation (Postgres)
		subQ := database.DB.Model(&models.Measurement{}).
			Where("experiment_id = ?", id)
		if fromStr := c.Query("from"); fromStr != "" {
			if t, err := time.Parse(time.RFC3339Nano, fromStr); err == nil {
				subQ = subQ.Where("recorded_at >= ?", t)
			}
		}
		if toStr := c.Query("to"); toStr != "" {
			if t, err := time.Parse(time.RFC3339Nano, toStr); err == nil {
				subQ = subQ.Where("recorded_at <= ?", t)
			}
		}
		// Simple approach: fetch IDs with step, then load full rows
		var allIDs []uint
		subQ.Order("recorded_at ASC").Pluck("id", &allIDs)

		var decimatedIDs []uint
		for i := 0; i < len(allIDs); i += step {
			decimatedIDs = append(decimatedIDs, allIDs[i])
		}

		decimatedTotal := len(decimatedIDs)
		offset := (page - 1) * perPage
		if offset >= decimatedTotal {
			measurements = []models.Measurement{}
		} else {
			end := offset + perPage
			if end > decimatedTotal {
				end = decimatedTotal
			}
			pageIDs := decimatedIDs[offset:end]
			database.DB.Where("id IN ?", pageIDs).Order("recorded_at ASC").Find(&measurements)
		}

		c.JSON(http.StatusOK, gin.H{
			"experiment":     exp,
			"measurements":   measurements,
			"total":          totalCount,
			"filtered_total": int64(decimatedTotal),
			"page":           page,
			"per_page":       perPage,
			"time_min":       timeMin,
			"time_max":       timeMax,
		})
		return
	}

	// No decimation — simple pagination
	offset := (page - 1) * perPage
	if err := q.Order("recorded_at ASC").Offset(offset).Limit(perPage).Find(&measurements).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"experiment":     exp,
		"measurements":   measurements,
		"total":          totalCount,
		"filtered_total": filteredCount,
		"page":           page,
		"per_page":       perPage,
		"time_min":       timeMin,
		"time_max":       timeMax,
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
