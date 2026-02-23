package main

import (
	"log"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"back/controllers"
	"back/database"
	"back/middleware"
)

func main() {
	database.Init()

	r := gin.Default()

	// CORS — allow all origins so the frontend can reach the backend from any IP/domain
	r.Use(cors.New(cors.Config{
		AllowAllOrigins: true,
		AllowMethods:    []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:    []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With"},
		ExposeHeaders:   []string{},
		MaxAge:          12 * time.Hour,
	}))

	// Health
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })

	// Auth (public)
	r.POST("/auth/login", controllers.Login)

	// All routes below require auth
	auth := r.Group("/")
	auth.Use(middleware.AuthRequired())
	{
		auth.GET("/auth/me", controllers.GetMe)
		auth.PUT("/auth/password", controllers.ChangePassword)

		// Users (admin only for write, all authenticated can list)
		auth.GET("/users", controllers.ListUsers)
		admin := auth.Group("/")
		admin.Use(middleware.AdminRequired())
		{
			admin.POST("/users", controllers.CreateUser)
			admin.PUT("/users/:id", controllers.UpdateUser)
			admin.DELETE("/users/:id", controllers.DeleteUser)
		}

		// Instruments
		auth.GET("/instruments", controllers.ListInstruments)
		auth.GET("/instruments/:id/ping", controllers.PingInstrument)
		admin2 := auth.Group("/instruments")
		admin2.Use(middleware.AdminRequired())
		{
			admin2.POST("", controllers.CreateInstrument)
			admin2.PUT("/:id", controllers.UpdateInstrument)
			admin2.DELETE("/:id", controllers.DeleteInstrument)
		}

		// Experiments
		auth.GET("/experiments", controllers.ListExperiments)
		auth.GET("/experiments/:id", controllers.GetExperiment)
		auth.GET("/experiments/:id/data", controllers.GetExperimentData)
		auth.GET("/experiments/:id/status", controllers.ExperimentStatusCheck)
		auth.DELETE("/experiments/:id", controllers.DeleteExperiment)

		// Start / Stop measurement
		auth.POST("/experiments/start", controllers.StartExperiment)
		auth.POST("/experiments/:id/stop", controllers.StopExperiment)
	}

	if err := r.Run(":8080"); err != nil {
		log.Fatal(err)
	}
}
