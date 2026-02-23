package models

import "time"

type Instrument struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"size:200;not null" json:"name"`
	Host      string    `gorm:"size:100;not null" json:"host"`
	Port      int       `gorm:"not null" json:"port"`
	Active    bool      `gorm:"not null;default:true" json:"active"`
	Model     string    `gorm:"size:100" json:"model"`
	Firmware  string    `gorm:"size:100" json:"firmware"`
	Serial    string    `gorm:"size:100" json:"serial"`
	Online    bool      `gorm:"-" json:"online"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
