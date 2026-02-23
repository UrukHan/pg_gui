package models

import "time"

type ExperimentStatus string

const (
	StatusRunning   ExperimentStatus = "running"
	StatusStopped   ExperimentStatus = "stopped"
	StatusCompleted ExperimentStatus = "completed"
	StatusError     ExperimentStatus = "error"
)

type Experiment struct {
	ID            uint             `gorm:"primaryKey" json:"id"`
	Name          string           `gorm:"size:300;not null" json:"name"`
	UserID        uint             `gorm:"not null;index" json:"user_id"`
	User          User             `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Status        ExperimentStatus `gorm:"size:20;not null;default:stopped" json:"status"`
	StartTime     *time.Time       `json:"start_time"`
	EndTime       *time.Time       `json:"end_time"`
	InstrumentIDs string           `gorm:"size:500" json:"instrument_ids"` // comma-separated IDs
	Notes         string           `gorm:"type:text" json:"notes"`
	CreatedAt     time.Time        `json:"created_at"`
	UpdatedAt     time.Time        `json:"updated_at"`
}
