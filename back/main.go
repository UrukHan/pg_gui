package main

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"back/controllers"
	"back/database"
	"back/middleware"
	"back/models"
	"back/scpi"
)

func main() {
	database.Init()
	syncInstruments()

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

		// Instruments (read-only + toggle active)
		auth.GET("/instruments", controllers.ListInstruments)
		auth.GET("/instruments/:id/ping", controllers.PingInstrument)
		auth.PUT("/instruments/:id/toggle", controllers.ToggleInstrument)

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

// syncInstruments reads INSTRUMENTS env var and syncs DB.
// Format: "TH2690=192.168.1.150:45454,Probe2=10.0.0.5:45454"
// Or simple: "192.168.1.150:45454,10.0.0.5:45454"
func syncInstruments() {
	raw := os.Getenv("INSTRUMENTS")
	if raw == "" {
		return
	}

	type entry struct {
		Name string
		Host string
		Port int
	}

	var entries []entry
	for _, s := range strings.Split(raw, ",") {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		var name, addr string
		if idx := strings.Index(s, "="); idx > 0 {
			name = strings.TrimSpace(s[:idx])
			addr = strings.TrimSpace(s[idx+1:])
		} else {
			addr = s
		}
		host, portStr, ok := strings.Cut(addr, ":")
		if !ok {
			log.Printf("INSTRUMENTS: invalid %q (need host:port)", s)
			continue
		}
		port, err := strconv.Atoi(strings.TrimSpace(portStr))
		if err != nil {
			log.Printf("INSTRUMENTS: bad port in %q: %v", s, err)
			continue
		}
		if name == "" {
			name = fmt.Sprintf("%s:%d", host, port)
		}
		entries = append(entries, entry{Name: name, Host: strings.TrimSpace(host), Port: port})
	}

	for _, e := range entries {
		var inst models.Instrument
		res := database.DB.Where("host = ? AND port = ?", e.Host, e.Port).First(&inst)
		if res.Error != nil {
			inst = models.Instrument{Name: e.Name, Host: e.Host, Port: e.Port, Active: true}
			database.DB.Create(&inst)
			log.Printf("Instrument added: %s (%s:%d)", e.Name, e.Host, e.Port)
		}
		// Query *IDN?
		if info, err := scpi.QueryIDN(inst.Host, inst.Port); err == nil {
			inst.Model = info.Model
			inst.Firmware = info.Firmware
			inst.Serial = info.Serial
			if inst.Name == fmt.Sprintf("%s:%d", inst.Host, inst.Port) {
				inst.Name = info.Model
			}
			database.DB.Save(&inst)
			log.Printf("Instrument OK: %s (model=%s fw=%s)", inst.Name, info.Model, info.Firmware)
		} else {
			log.Printf("Instrument %s (%s:%d) unreachable: %v", inst.Name, inst.Host, inst.Port, err)
		}
	}
}
