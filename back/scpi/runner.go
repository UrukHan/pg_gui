package scpi

import (
	"fmt"
	"log"
	"net"
	"strings"
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

// persistentConn wraps a TCP connection with send/receive for SCPI over persistent socket
type persistentConn struct {
	host string
	port int
	conn net.Conn
	buf  []byte
}

func newPersistentConn(host string, port int) *persistentConn {
	return &persistentConn{host: host, port: port, buf: make([]byte, 4096)}
}

func (pc *persistentConn) connect() error {
	if pc.conn != nil {
		pc.conn.Close()
		pc.conn = nil
	}
	addr := fmt.Sprintf("%s:%d", pc.host, pc.port)
	conn, err := net.DialTimeout("tcp", addr, 3*time.Second)
	if err != nil {
		return err
	}
	pc.conn = conn
	return nil
}

func (pc *persistentConn) close() {
	if pc.conn != nil {
		pc.conn.Close()
		pc.conn = nil
	}
}

// sendCmd sends a command on the persistent connection and reads the response.
// Returns response string and error. On error the connection is closed so next call reconnects.
func (pc *persistentConn) sendCmd(cmd string, timeout time.Duration) (string, error) {
	if pc.conn == nil {
		if err := pc.connect(); err != nil {
			return "", fmt.Errorf("connect %s:%d: %w", pc.host, pc.port, err)
		}
	}
	pc.conn.SetDeadline(time.Now().Add(timeout))
	_, err := pc.conn.Write([]byte(cmd + "\r\n"))
	if err != nil {
		pc.close()
		return "", fmt.Errorf("write: %w", err)
	}
	n, err := pc.conn.Read(pc.buf)
	if err != nil {
		pc.close()
		if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
			return "", nil
		}
		return "", fmt.Errorf("read: %w", err)
	}
	return strings.TrimSpace(string(pc.buf[:n])), nil
}

func (r *Runner) poll(experimentID uint, instruments []models.Instrument, interval time.Duration, cancel chan struct{}) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	// One persistent connection per instrument
	conns := make(map[uint]*persistentConn, len(instruments))
	for _, inst := range instruments {
		conns[inst.ID] = newPersistentConn(inst.Host, inst.Port)
	}
	defer func() {
		for _, pc := range conns {
			pc.close()
		}
	}()

	var count int64
	for {
		select {
		case <-cancel:
			return
		case <-ticker.C:
			for _, inst := range instruments {
				pc := conns[inst.ID]
				rawResp, rawErr := pc.sendCmd("FETCH:ALL_S?", defaultTimeout)
				if rawErr != nil {
					// Log only every 10th error to avoid log flood
					if count%10 == 0 {
						log.Printf("[SCPI] exp=%d inst=%d fetch error (x10): %v", experimentID, inst.ID, rawErr)
					}
					continue
				}
				resp, err := ParseAllS(rawResp)
				if err != nil {
					if count%10 == 0 {
						log.Printf("[SCPI] exp=%d inst=%d parse error (x10): %v", experimentID, inst.ID, err)
					}
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
					log.Printf("[SCPI] exp=%d save error: %v", experimentID, err)
				}
			}
			count++
			// Log status every 100 polls (~20s at 5Hz)
			if count%100 == 0 {
				log.Printf("[SCPI] exp=%d polls=%d OK", experimentID, count)
			}
		}
	}
}
