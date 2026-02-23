package controllers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"back/database"
	"back/models"
)

type CreateUserRequest struct {
	FirstName        string                `json:"first_name" binding:"required"`
	LastName         string                `json:"last_name" binding:"required"`
	Position         string                `json:"position"`
	Login            string                `json:"login" binding:"required"`
	Password         string                `json:"password" binding:"required,min=4"`
	Permission       models.UserPermission `json:"permission" binding:"required"`
	InstrumentAccess bool                  `json:"instrument_access"`
}

type UpdateUserRequest struct {
	FirstName        *string                `json:"first_name"`
	LastName         *string                `json:"last_name"`
	Position         *string                `json:"position"`
	Login            *string                `json:"login"`
	Password         *string                `json:"password"`
	Permission       *models.UserPermission `json:"permission"`
	InstrumentAccess *bool                  `json:"instrument_access"`
}

func ListUsers(c *gin.Context) {
	var users []models.User
	if err := database.DB.Order("id").Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Strip sensitive fields
	type SafeUser struct {
		ID               uint                  `json:"id"`
		FirstName        string                `json:"first_name"`
		LastName         string                `json:"last_name"`
		Position         string                `json:"position"`
		Login            string                `json:"login"`
		Role             models.UserRole       `json:"role"`
		Permission       models.UserPermission `json:"permission"`
		InstrumentAccess bool                  `json:"instrument_access"`
	}

	result := make([]SafeUser, len(users))
	for i, u := range users {
		result[i] = SafeUser{
			ID: u.ID, FirstName: u.FirstName, LastName: u.LastName,
			Position: u.Position, Login: u.Login, Role: u.Role,
			Permission: u.Permission, InstrumentAccess: u.InstrumentAccess,
		}
	}
	c.JSON(http.StatusOK, result)
}

func CreateUser(c *gin.Context) {
	var req CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user := models.User{
		FirstName:        req.FirstName,
		LastName:         req.LastName,
		Position:         req.Position,
		Login:            req.Login,
		Role:             models.RoleUser,
		Permission:       req.Permission,
		InstrumentAccess: req.InstrumentAccess,
	}

	if err := user.SetPassword(req.Password); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	if err := database.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "user already exists or DB error: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": user.ID})
}

func UpdateUser(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var user models.User
	if err := database.DB.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	var req UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.FirstName != nil {
		user.FirstName = *req.FirstName
	}
	if req.LastName != nil {
		user.LastName = *req.LastName
	}
	if req.Position != nil {
		user.Position = *req.Position
	}
	if req.Login != nil {
		user.Login = *req.Login
	}
	if req.Permission != nil {
		user.Permission = *req.Permission
	}
	if req.InstrumentAccess != nil {
		user.InstrumentAccess = *req.InstrumentAccess
	}
	if req.Password != nil && *req.Password != "" {
		if err := user.SetPassword(*req.Password); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
			return
		}
	}

	if err := database.DB.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func DeleteUser(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	// Don't allow deleting last admin
	var user models.User
	if err := database.DB.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if user.Role == models.RoleAdmin {
		var count int64
		database.DB.Model(&models.User{}).Where("role = ?", models.RoleAdmin).Count(&count)
		if count <= 1 {
			c.JSON(http.StatusForbidden, gin.H{"error": "cannot delete the last admin"})
			return
		}
	}

	if err := database.DB.Delete(&models.User{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
