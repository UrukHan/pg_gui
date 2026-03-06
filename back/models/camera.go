package models

import "time"

type Camera struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"size:200;not null" json:"name"`
	RTSPURL   string    `gorm:"size:500;not null" json:"rtsp_url"`
	Active    bool      `gorm:"not null;default:true" json:"active"`
	Online    bool      `gorm:"-" json:"online"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
