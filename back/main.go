package main

import (
	"log"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"back/controllers"
	"back/database"
)

func main() {
	// БД
	database.Init()

	// Gin
	r := gin.Default()

	// CORS — разрешаем фронт dev-сервера Next.js
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With"},
		ExposeHeaders:    []string{},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Раздача загруженных файлов
	r.Static("/uploads", "./uploads")

	// Health (удобно для проверки)
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })

	// Схема
	r.GET("/schema", controllers.GetSchema)
	r.POST("/schema", controllers.PostSchema)
	r.DELETE("/schema/:tableName", controllers.DeleteTable)

	// Данные таблиц
	r.GET("/schema/:tableName", controllers.GetTableData)
	r.POST("/schema/:tableName", controllers.CreateTableRow)
	r.PUT("/schema/:tableName/:id", controllers.UpdateTableRow)
	r.DELETE("/schema/:tableName/:id", controllers.DeleteTableRow)

	// Загрузки
    r.POST("/upload/:table/:id/image", controllers.UploadImageForRow)
    r.POST("/upload/:table/:id/file",  controllers.UploadFileForRow)
    r.DELETE("/upload/:table/:id/image", controllers.DeleteImageForRow)
    r.DELETE("/upload/:table/:id/file",  controllers.DeleteFileForRow)

	if err := r.Run(":8080"); err != nil {
		log.Fatal(err)
	}
}
