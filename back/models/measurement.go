package models

import "time"

type Measurement struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	ExperimentID uint      `gorm:"not null;index" json:"experiment_id"`
	InstrumentID uint      `gorm:"not null;index" json:"instrument_id"`
	DeviceTime   string    `gorm:"size:30" json:"device_time"`
	RecordedAt   time.Time `gorm:"autoCreateTime" json:"recorded_at"`
	Voltage      float64   `json:"voltage"`
	Current      float64   `json:"current"`
	Charge       float64   `json:"charge"`
	Resistance   float64   `json:"resistance"`
	Temperature  float64   `json:"temperature"`
	Humidity     float64   `json:"humidity"`
	Source       float64   `json:"source"`
	MathValue    float64   `json:"math_value"`
	ErrorCode    int       `json:"error_code"`
}
