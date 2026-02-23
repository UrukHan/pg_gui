package controllers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"back/database"
	"back/middleware"
	"back/models"
)

type LoginRequest struct {
	Login    string `json:"login" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type ChangePasswordRequest struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=4"`
}

func Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "login and password required"})
		return
	}

	var user models.User
	if err := database.DB.Where("login = ?", req.Login).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if !user.CheckPassword(req.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	token, err := middleware.GenerateToken(&user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":                user.ID,
			"first_name":        user.FirstName,
			"last_name":         user.LastName,
			"position":          user.Position,
			"login":             user.Login,
			"role":              user.Role,
			"permission":        user.Permission,
			"instrument_access": user.InstrumentAccess,
		},
	})
}

func GetMe(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id":                user.ID,
		"first_name":        user.FirstName,
		"last_name":         user.LastName,
		"position":          user.Position,
		"login":             user.Login,
		"role":              user.Role,
		"permission":        user.Permission,
		"instrument_access": user.InstrumentAccess,
	})
}

func ChangePassword(c *gin.Context) {
	user := middleware.GetCurrentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	var req ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "old_password and new_password required"})
		return
	}

	if !user.CheckPassword(req.OldPassword) {
		c.JSON(http.StatusForbidden, gin.H{"error": "wrong current password"})
		return
	}

	if err := user.SetPassword(req.NewPassword); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	if err := database.DB.Save(user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
