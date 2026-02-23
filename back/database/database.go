package database

import (
	"log"
	"os"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"back/models"
)

var DB *gorm.DB

func Init() {
	dsn := os.Getenv("DATABASE_DSN")
	if dsn == "" {
		dsn = "host=localhost user=ariadna password=ariadna dbname=ariadna port=5435 sslmode=disable"
	}
	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("Database connection failed:", err)
	}

	// Auto-migrate all models
	if err := DB.AutoMigrate(
		&models.User{},
		&models.Instrument{},
		&models.Experiment{},
		&models.Measurement{},
	); err != nil {
		log.Fatal("Auto-migration failed:", err)
	}

	// Seed default admin if none exists
	var count int64
	DB.Model(&models.User{}).Where("role = ?", models.RoleAdmin).Count(&count)
	if count == 0 {
		adminPass := os.Getenv("ADMIN_PASSWORD")
		if adminPass == "" {
			adminPass = "admin"
		}
		adminLogin := os.Getenv("ADMIN_LOGIN")
		if adminLogin == "" {
			adminLogin = "admin"
		}
		admin := models.User{
			FirstName:        "Admin",
			LastName:         "Admin",
			Position:         "Администратор",
			Login:            adminLogin,
			Role:             models.RoleAdmin,
			Permission:       models.PermReadWriteAll,
			InstrumentAccess: true,
		}
		if err := admin.SetPassword(adminPass); err != nil {
			log.Fatal("Failed to hash admin password:", err)
		}
		if err := DB.Create(&admin).Error; err != nil {
			log.Fatal("Failed to seed admin:", err)
		}
		log.Println("Default admin created (login: admin)")
	}
}
