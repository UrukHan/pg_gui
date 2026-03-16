package scpi

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
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

	// Parse HV schedule from experiment
	hvSchedule := make(map[uint][]HvPoint)
	if experiment.HvScheduleJSON != "" && experiment.HvScheduleJSON != "{}" {
		var raw map[string][]HvPoint
		if err := json.Unmarshal([]byte(experiment.HvScheduleJSON), &raw); err == nil {
			for idStr, pts := range raw {
				var id uint
				fmt.Sscanf(idStr, "%d", &id)
				hvSchedule[id] = pts
			}
		}
	}

	var duration time.Duration
	if experiment.DurationSec > 0 {
		duration = time.Duration(experiment.DurationSec) * time.Second
	}

	go r.poll(experiment.ID, instruments, pollInterval, cancel, duration, hvSchedule)
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

// interpolateHV returns the interpolated voltage at elapsed seconds from sorted HvPoint slice
func interpolateHV(points []HvPoint, elapsedSec float64) float64 {
	if len(points) == 0 {
		return 0
	}
	if elapsedSec <= points[0].TimeSec {
		return points[0].Voltage
	}
	if elapsedSec >= points[len(points)-1].TimeSec {
		return points[len(points)-1].Voltage
	}
	for i := 1; i < len(points); i++ {
		if elapsedSec <= points[i].TimeSec {
			p0, p1 := points[i-1], points[i]
			dt := p1.TimeSec - p0.TimeSec
			if dt <= 0 {
				return p1.Voltage
			}
			t := (elapsedSec - p0.TimeSec) / dt
			return p0.Voltage + t*(p1.Voltage-p0.Voltage)
		}
	}
	return points[len(points)-1].Voltage
}

// instState holds per-instrument state for polling — each goroutine owns exactly one, no sharing
type instState struct {
	inst   models.Instrument
	pc     *persistentConn
	hvPts  []HvPoint
	lastHV float64
}

func (r *Runner) poll(experimentID uint, instruments []models.Instrument, interval time.Duration, cancel chan struct{}, duration time.Duration, hvSchedule map[uint][]HvPoint) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	start := time.Now()

	// Duration timer (0 = unlimited)
	var deadlineC <-chan time.Time
	if duration > 0 {
		deadlineC = time.After(duration)
	}

	// Per-instrument state — slice indexed by position, no shared maps
	states := make([]instState, len(instruments))
	for i, inst := range instruments {
		states[i] = instState{
			inst:   inst,
			pc:     newPersistentConn(inst.Host, inst.Port),
			hvPts:  hvSchedule[inst.ID],
			lastHV: math.NaN(),
		}
	}
	defer func() {
		for i := range states {
			states[i].pc.close()
		}
	}()

	var count int64
	for {
		select {
		case <-cancel:
			return
		case <-deadlineC:
			// Auto-stop: duration expired
			log.Printf("[SCPI] exp=%d duration expired, auto-stopping", experimentID)
			r.Stop(experimentID)
			// Mark experiment completed in DB
			now := time.Now()
			database.DB.Model(&models.Experiment{}).Where("id = ?", experimentID).
				Updates(map[string]interface{}{"status": models.StatusCompleted, "end_time": now})
			// Turn off instruments in parallel
			var stopWg sync.WaitGroup
			for i := range states {
				stopWg.Add(1)
				go func(s *instState) {
					defer stopWg.Done()
					Stop(s.inst.Host, s.inst.Port)
					Send(s.inst.Host, s.inst.Port, "FUNC:SRC OFF", 2*time.Second)
					Send(s.inst.Host, s.inst.Port, "FUNC:AMMET OFF", 2*time.Second)
				}(&states[i])
			}
			stopWg.Wait()
			return
		case <-ticker.C:
			elapsed := time.Since(start).Seconds()

			// Poll all instruments in parallel — each goroutine owns its own *instState
			var wg sync.WaitGroup
			for i := range states {
				wg.Add(1)
				go func(s *instState) {
					defer wg.Done()

					// Apply HV schedule if needed
					if len(s.hvPts) > 0 {
						targetV := interpolateHV(s.hvPts, elapsed)
						if math.IsNaN(s.lastHV) || math.Abs(targetV-s.lastHV) >= 0.1 {
							s.pc.sendCmd(fmt.Sprintf("SRC:VALUE %.3f", targetV), defaultTimeout)
							s.lastHV = targetV
							if count%20 == 0 {
								log.Printf("[SCPI] exp=%d inst=%d HV schedule -> %.1fV", experimentID, s.inst.ID, targetV)
							}
						}
					}

					// Fetch measurements
					rawResp, rawErr := s.pc.sendCmd("FETCH:ALL_S?", defaultTimeout)
					if rawErr != nil {
						if count%10 == 0 {
							log.Printf("[SCPI] exp=%d inst=%d fetch error (x10): %v", experimentID, s.inst.ID, rawErr)
						}
						return
					}
					resp, err := ParseAllS(rawResp)
					if err != nil {
						if count%10 == 0 {
							log.Printf("[SCPI] exp=%d inst=%d parse error (x10): %v", experimentID, s.inst.ID, err)
						}
						return
					}

					m := models.Measurement{
						ExperimentID: experimentID,
						InstrumentID: s.inst.ID,
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
						log.Printf("[SCPI] exp=%d inst=%d save error: %v", experimentID, s.inst.ID, err)
					}
				}(&states[i])
			}
			wg.Wait()
			count++
			if count%100 == 0 {
				log.Printf("[SCPI] exp=%d polls=%d OK elapsed=%.0fs", experimentID, count, elapsed)
			}
		}
	}
}
