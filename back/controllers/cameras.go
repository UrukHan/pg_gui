package controllers

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"back/database"
	"back/models"
	"back/storage"
)

func ListCameras(c *gin.Context) {
	var cameras []models.Camera
	if err := database.DB.Order("id").Find(&cameras).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cameras)
}

func GetExperimentVideo(c *gin.Context) {
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

	if exp.VideoPath == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "no video for this experiment"})
		return
	}

	obj, size, contentType, err := storage.GetObject(exp.VideoPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("video read error: %v", err)})
		return
	}
	defer obj.Close()

	if contentType == "" {
		contentType = "video/mp4"
	}

	extraHeaders := map[string]string{
		"Content-Disposition": fmt.Sprintf("inline; filename=\"exp_%d.mp4\"", exp.ID),
	}
	c.DataFromReader(http.StatusOK, size, contentType, obj, extraHeaders)
}
