package controllers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"back/database"
	"back/middleware"
	"back/models"
	"back/recorder"
	"back/scpi"
)

// --- Instruments (auto-discovered from env, no manual CRUD) ---

func ListInstruments(c *gin.Context) {
	var instruments []models.Instrument
	if err := database.DB.Order("id").Find(&instruments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// Check online status for all instruments
	for i := range instruments {
		_, err := scpi.Identify(instruments[i].Host, instruments[i].Port)
		instruments[i].Online = err == nil
	}
	c.JSON(http.StatusOK, instruments)
}

// ToggleInstrument switches active on/off
func ToggleInstrument(c *gin.Context) {
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
	inst.Active = !inst.Active
	database.DB.Save(&inst)
	c.JSON(http.StatusOK, inst)
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
	info, err := scpi.QueryIDN(inst.Host, inst.Port)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": fmt.Sprintf("instrument unreachable: %v", err)})
		return
	}
	// Update stored model/firmware/serial
	inst.Model = info.Model
	inst.Firmware = info.Firmware
	inst.Serial = info.Serial
	database.DB.Save(&inst)
	c.JSON(http.StatusOK, gin.H{"idn": info.Raw, "model": info.Model, "firmware": info.Firmware, "serial": info.Serial})
}

// --- Probe SCPI commands (diagnostic) ---

func ProbeInstrument(c *gin.Context) {
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

	// Test various command syntaxes to find what TH2690 accepts
	testCmds := []string{
		"FUNC?",
		"FUNC CURR",
		":FUNC CURR",
		":FUNC:CURR",
		"SENS:FUNC CURR",
		":SENS:FUNC 'CURR'",
		"CONF:CURR",
		"SPEED?",
		"SPEED MED",
		":SPEED MED",
		"RATE?",
		"RATE MED",
		"RANG:AUTO?",
		"RANG:AUTO ON",
		":RANG:AUTO ON",
		"CURR:RANG:AUTO ON",
		":CURR:RANG:AUTO ON",
		"SOUR:VOLT?",
		"SOUR:VOLT 100",
		":SOUR:VOLT 100",
		"SOUR:VOLT:LEV 100",
		"SOUR:STAT?",
		"SOUR:STAT ON",
		":SOUR:STAT ON",
		"OUTP ON",
		":OUTP ON",
		"ZERO:CORR?",
		"ZERO:CORR",
		":ZERO:CORR",
		"SYST:ZCOR:STAT ON",
		"SYST:ZCH?",
	}

	results := make([]gin.H, 0, len(testCmds))
	for _, cmd := range testCmds {
		resp, err := scpi.Send(inst.Host, inst.Port, cmd, 2*time.Second)
		entry := gin.H{"cmd": cmd, "resp": resp}
		if err != nil {
			entry["err"] = err.Error()
		}
		results = append(results, entry)
		time.Sleep(100 * time.Millisecond)
	}

	c.JSON(http.StatusOK, gin.H{"results": results})
}

// --- Start / Stop experiment ---

type StartExperimentRequest struct {
	Name          string                              `json:"name" binding:"required"`
	InstrumentIDs string                              `json:"instrument_ids" binding:"required"` // comma-separated
	Notes         string                              `json:"notes"`
	Settings      map[string]*scpi.InstrumentSettings `json:"settings"` // key = instrument ID
}

func StartExperiment(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	if !user.InstrumentAccess && user.Role != models.RoleAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "no instrument access"})
		return
	}

	// Prevent double-start: check if any experiment is already running
	var runningCount int64
	database.DB.Model(&models.Experiment{}).Where("status = ?", models.StatusRunning).Count(&runningCount)
	if runningCount > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "Уже есть запущенный эксперимент. Остановите его перед запуском нового."})
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

	// Apply per-instrument settings (or defaults)
	var maxFreq float64 = 5
	for _, inst := range instruments {
		idStr := strconv.Itoa(int(inst.ID))
		settings := scpi.DefaultSettings()
		if req.Settings != nil {
			if s, ok := req.Settings[idStr]; ok && s != nil {
				settings = *s
			}
		}
		if settings.Frequency > maxFreq {
			maxFreq = settings.Frequency
		}
		if err := scpi.ApplySettings(inst.Host, inst.Port, settings); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": fmt.Sprintf("failed to configure %s: %v", inst.Name, err)})
			return
		}
	}

	// Send FUNC:RUN to all instruments
	for _, inst := range instruments {
		if err := scpi.Run(inst.Host, inst.Port); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": fmt.Sprintf("failed to start %s: %v", inst.Name, err)})
			return
		}
	}

	// Serialize settings to JSON for storage
	settingsJSON := "{}"
	if req.Settings != nil {
		if b, err := json.Marshal(req.Settings); err == nil {
			settingsJSON = string(b)
		}
	}

	// Use highest frequency from all instruments
	pollingSettings := scpi.DefaultSettings()
	pollingSettings.Frequency = maxFreq

	now := time.Now()
	exp := models.Experiment{
		Name:          req.Name,
		UserID:        user.ID,
		Status:        models.StatusRunning,
		StartTime:     &now,
		InstrumentIDs: req.InstrumentIDs,
		Notes:         req.Notes,
		SettingsJSON:  settingsJSON,
	}

	if err := database.DB.Create(&exp).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Start polling goroutine at max frequency
	scpi.DefaultRunner.Start(&exp, instruments, pollingSettings.PollingInterval())

	// Start video recording if cameras available
	recorder.Default.Start(exp.ID)

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

	// Atomically mark as stopping to prevent double-stop race
	res := database.DB.Model(&exp).Where("status = ?", models.StatusRunning).Update("status", "stopping")
	if res.RowsAffected == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "experiment already stopping"})
		return
	}

	// Stop polling
	scpi.DefaultRunner.Stop(exp.ID)

	// Stop instruments and reset to safe state
	idStrs := strings.Split(exp.InstrumentIDs, ",")
	for _, s := range idStrs {
		instID, _ := strconv.Atoi(strings.TrimSpace(s))
		var inst models.Instrument
		if database.DB.First(&inst, instID).Error == nil {
			scpi.Stop(inst.Host, inst.Port)
			// Turn off source and ammeter for safety
			scpi.Send(inst.Host, inst.Port, "FUNC:SRC OFF", 2*time.Second)
			scpi.Send(inst.Host, inst.Port, "FUNC:AMMET OFF", 2*time.Second)
		}
	}

	// Stop video recording and upload
	if videoPath := recorder.Default.Stop(exp.ID); videoPath != "" {
		exp.VideoPath = videoPath
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

// GetInstrumentSettings reads current settings from the instrument
func GetInstrumentSettings(c *gin.Context) {
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
	settings, err := scpi.ReadSettings(inst.Host, inst.Port)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, settings)
}

// SendCommand sends an arbitrary SCPI command to an instrument
func SendCommand(c *gin.Context) {
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

	var body struct {
		Command string `json:"command" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := scpi.SendRaw(inst.Host, inst.Port, body.Command)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"response": resp})
}
