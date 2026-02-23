package controllers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"back/database"
	"back/middleware"
	"back/models"
	"back/scpi"
)

// --- Instrument CRUD (admin) ---

func ListInstruments(c *gin.Context) {
	var instruments []models.Instrument
	if err := database.DB.Order("id").Find(&instruments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, instruments)
}

type InstrumentRequest struct {
	Name   string `json:"name" binding:"required"`
	Host   string `json:"host" binding:"required"`
	Port   int    `json:"port" binding:"required"`
	Active bool   `json:"active"`
}

func CreateInstrument(c *gin.Context) {
	var req InstrumentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	inst := models.Instrument{Name: req.Name, Host: req.Host, Port: req.Port, Active: req.Active}
	if err := database.DB.Create(&inst).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, inst)
}

func UpdateInstrument(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var inst models.Instrument
	if err := database.DB.First(&inst, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req InstrumentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	inst.Name = req.Name
	inst.Host = req.Host
	inst.Port = req.Port
	inst.Active = req.Active
	if err := database.DB.Save(&inst).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, inst)
}

func DeleteInstrument(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := database.DB.Delete(&models.Instrument{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// --- Ping instrument (check SCPI connectivity) ---

func PingInstrument(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var inst models.Instrument
	if err := database.DB.First(&inst, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	idn, err := scpi.Identify(inst.Host, inst.Port)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": fmt.Sprintf("instrument unreachable: %v", err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"idn": idn})
}

// --- Start / Stop experiment ---

type StartExperimentRequest struct {
	Name          string `json:"name" binding:"required"`
	InstrumentIDs string `json:"instrument_ids" binding:"required"` // comma-separated
	Notes         string `json:"notes"`
}

func StartExperiment(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	if !user.InstrumentAccess && user.Role != models.RoleAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "no instrument access"})
		return
	}

	var req StartExperimentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Parse and validate instrument IDs
	idStrs := strings.Split(req.InstrumentIDs, ",")
	var instruments []models.Instrument
	for _, s := range idStrs {
		id, err := strconv.Atoi(strings.TrimSpace(s))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid instrument_ids"})
			return
		}
		var inst models.Instrument
		if err := database.DB.First(&inst, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": fmt.Sprintf("instrument %d not found", id)})
			return
		}
		instruments = append(instruments, inst)
	}

	// Send FUNC:RUN to all instruments
	for _, inst := range instruments {
		if err := scpi.Run(inst.Host, inst.Port); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": fmt.Sprintf("failed to start instrument %d (%s): %v", inst.ID, inst.Name, err)})
			return
		}
	}

	now := time.Now()
	exp := models.Experiment{
		Name:          req.Name,
		UserID:        user.ID,
		Status:        models.StatusRunning,
		StartTime:     &now,
		InstrumentIDs: req.InstrumentIDs,
		Notes:         req.Notes,
	}

	if err := database.DB.Create(&exp).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Start polling goroutine (5 Hz)
	scpi.DefaultRunner.Start(&exp, instruments, 200*time.Millisecond)

	c.JSON(http.StatusOK, gin.H{"experiment": exp})
}

func StopExperiment(c *gin.Context) {
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

	if exp.Status != models.StatusRunning {
		c.JSON(http.StatusBadRequest, gin.H{"error": "experiment is not running"})
		return
	}

	// Check permissions
	if user.Role != models.RoleAdmin && exp.UserID != user.ID {
		c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}

	// Stop polling
	scpi.DefaultRunner.Stop(exp.ID)

	// Stop instruments
	idStrs := strings.Split(exp.InstrumentIDs, ",")
	for _, s := range idStrs {
		instID, _ := strconv.Atoi(strings.TrimSpace(s))
		var inst models.Instrument
		if database.DB.First(&inst, instID).Error == nil {
			scpi.Stop(inst.Host, inst.Port)
		}
	}

	now := time.Now()
	exp.Status = models.StatusCompleted
	exp.EndTime = &now
	database.DB.Save(&exp)

	c.JSON(http.StatusOK, gin.H{"experiment": exp})
}

// ExperimentStatus returns whether an experiment is currently running
func ExperimentStatusCheck(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var exp models.Experiment
	if err := database.DB.First(&exp, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "experiment not found"})
		return
	}

	running := scpi.DefaultRunner.IsRunning(exp.ID)

	// Count measurements
	var count int64
	database.DB.Model(&models.Measurement{}).Where("experiment_id = ?", exp.ID).Count(&count)

	c.JSON(http.StatusOK, gin.H{
		"experiment":        exp,
		"polling_active":    running,
		"measurement_count": count,
	})
}
