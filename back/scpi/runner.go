package scpi

import (
	"log"
	"sync"
	"time"

	"back/database"
	"back/models"
)

// Runner manages active measurement polling goroutines
type Runner struct {
	mu      sync.Mutex
	cancels map[uint]chan struct{} // experimentID -> cancel channel
}

var DefaultRunner = &Runner{
	cancels: make(map[uint]chan struct{}),
}

// IsRunning checks if an experiment is actively polling
func (r *Runner) IsRunning(experimentID uint) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	_, ok := r.cancels[experimentID]
	return ok
}

// Start begins polling instruments for an experiment
func (r *Runner) Start(experiment *models.Experiment, instruments []models.Instrument, pollInterval time.Duration) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.cancels[experiment.ID]; ok {
		return // already running
	}

	cancel := make(chan struct{})
	r.cancels[experiment.ID] = cancel

	go r.poll(experiment.ID, instruments, pollInterval, cancel)
}

// Stop stops polling for an experiment
func (r *Runner) Stop(experimentID uint) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if ch, ok := r.cancels[experimentID]; ok {
		close(ch)
		delete(r.cancels, experimentID)
	}
}

func (r *Runner) poll(experimentID uint, instruments []models.Instrument, interval time.Duration, cancel chan struct{}) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-cancel:
			return
		case <-ticker.C:
			for _, inst := range instruments {
				resp, err := FetchAll(inst.Host, inst.Port)
				if err != nil {
					log.Printf("[SCPI] experiment=%d instrument=%d fetch error: %v", experimentID, inst.ID, err)
					continue
				}

				m := models.Measurement{
					ExperimentID: experimentID,
					InstrumentID: inst.ID,
					DeviceTime:   resp.DeviceTime,
					RecordedAt:   time.Now(),
					Voltage:      resp.Voltage,
					Current:      resp.Current,
					Charge:       resp.Charge,
					Resistance:   resp.Resistance,
					Temperature:  resp.Temperature,
					Humidity:     resp.Humidity,
					Source:       resp.Source,
					MathValue:    resp.MathValue,
					ErrorCode:    resp.ErrorCode,
				}

				if err := database.DB.Create(&m).Error; err != nil {
					log.Printf("[SCPI] experiment=%d save error: %v", experimentID, err)
				}
			}
		}
	}
}
