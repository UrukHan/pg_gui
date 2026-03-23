package controllers

import (
	"fmt"
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

	innerWhere := "experiment_id = ?"
	args := []interface{}{id}
	for _, w := range extraWhere {
		innerWhere += " AND " + w.cond
		args = append(args, w.val)
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

	// ── Aggregate mode: ?aggregate=minmax&max_points=N ──
	// Returns NTILE-bucketed min/max per instrument for chart rendering
	if c.Query("aggregate") == "minmax" {
		maxPoints := 1500
		if mp, err := strconv.Atoi(c.Query("max_points")); err == nil && mp > 0 {
			maxPoints = mp
		}
		if maxPoints > 10000 {
			maxPoints = 10000
		}

		type AggBucket struct {
			Bucket         int       `json:"bucket"`
			InstrumentID   uint      `json:"instrument_id"`
			RecordedAt     time.Time `json:"recorded_at"`
			RecordedEnd    time.Time `json:"recorded_end"`
			PointCount     int       `json:"point_count"`
			VoltageMin     float64   `json:"voltage_min"`
			VoltageMax     float64   `json:"voltage_max"`
			CurrentMin     float64   `json:"current_min"`
			CurrentMax     float64   `json:"current_max"`
			ChargeMin      float64   `json:"charge_min"`
			ChargeMax      float64   `json:"charge_max"`
			ResistanceMin  float64   `json:"resistance_min"`
			ResistanceMax  float64   `json:"resistance_max"`
			TemperatureMin float64   `json:"temperature_min"`
			TemperatureMax float64   `json:"temperature_max"`
			HumidityMin    float64   `json:"humidity_min"`
			HumidityMax    float64   `json:"humidity_max"`
			SourceMin      float64   `json:"source_min"`
			SourceMax      float64   `json:"source_max"`
			MathValueMin   float64   `json:"math_value_min"`
			MathValueMax   float64   `json:"math_value_max"`
		}

		query := `
			WITH bucketed AS (
				SELECT *, NTILE(?) OVER (PARTITION BY instrument_id ORDER BY recorded_at ASC) AS bucket
				FROM measurements
				WHERE ` + innerWhere + `
			)
			SELECT
				bucket,
				instrument_id,
				MIN(recorded_at) AS recorded_at,
				MAX(recorded_at) AS recorded_end,
				COUNT(*)::int     AS point_count,
				MIN(voltage) AS voltage_min,       MAX(voltage) AS voltage_max,
				MIN(current) AS current_min,       MAX(current) AS current_max,
				MIN(charge) AS charge_min,          MAX(charge) AS charge_max,
				MIN(resistance) AS resistance_min, MAX(resistance) AS resistance_max,
				MIN(temperature) AS temperature_min, MAX(temperature) AS temperature_max,
				MIN(humidity) AS humidity_min,      MAX(humidity) AS humidity_max,
				MIN(source) AS source_min,          MAX(source) AS source_max,
				MIN(math_value) AS math_value_min, MAX(math_value) AS math_value_max
			FROM bucketed
			GROUP BY instrument_id, bucket
			ORDER BY instrument_id, bucket`

		aggArgs := []interface{}{maxPoints}
		aggArgs = append(aggArgs, args...)

		var buckets []AggBucket
		database.DB.Raw(query, aggArgs...).Scan(&buckets)
		if buckets == nil {
			buckets = []AggBucket{}
		}

		c.JSON(http.StatusOK, gin.H{
			"experiment": exp,
			"buckets":    buckets,
			"aggregated": true,
			"total":      stats.Total,
			"max_points": maxPoints,
			"time_min":   stats.TimeMin,
			"time_max":   stats.TimeMax,
		})
		return
	}

	// ── Row-level mode (table view, live view) ──

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
		stepArgs := make([]interface{}, len(args))
		copy(stepArgs, args)
		stepArgs = append(stepArgs, step, perPage, offset)

		database.DB.Raw(query, stepArgs...).Scan(&measurements)
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

func ExportExperimentCSV(c *gin.Context) {
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

	filename := fmt.Sprintf("experiment_%d.csv", id)
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	// BOM for Excel UTF-8 detection
	c.Writer.Write([]byte("\xEF\xBB\xBF"))
	c.Writer.Write([]byte("id,experiment_id,instrument_id,recorded_at,voltage,current,charge,resistance,temperature,humidity,source,math_value,error_code\n"))

	const batchSize = 5000
	var lastID uint = 0
	for {
		var rows []models.Measurement
		database.DB.Where("experiment_id = ? AND id > ?", id, lastID).
			Order("id ASC").Limit(batchSize).Find(&rows)
		if len(rows) == 0 {
			break
		}
		for _, m := range rows {
			line := fmt.Sprintf("%d,%d,%d,%s,%g,%g,%g,%g,%g,%g,%g,%g,%d\n",
				m.ID, m.ExperimentID, m.InstrumentID,
				m.RecordedAt.Format(time.RFC3339Nano),
				m.Voltage, m.Current, m.Charge, m.Resistance,
				m.Temperature, m.Humidity, m.Source, m.MathValue, m.ErrorCode)
			c.Writer.Write([]byte(line))
		}
		c.Writer.Flush()
		lastID = rows[len(rows)-1].ID
	}
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
