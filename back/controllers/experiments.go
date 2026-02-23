package controllers

import (
	"net/http"
	"strconv"

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

	var measurements []models.Measurement
	if err := database.DB.Where("experiment_id = ?", id).Order("recorded_at ASC").Find(&measurements).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"experiment":   exp,
		"measurements": measurements,
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
