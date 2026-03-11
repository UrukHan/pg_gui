package scpi

import (
	"fmt"
	"log"
	"time"
)

// InstrumentSettings holds configurable electrometer parameters
type InstrumentSettings struct {
	Function    string  `json:"function"`     // CURR, RES, CHAR
	SourceOn    bool    `json:"source_on"`    // HV source enable
	SourceVolt  float64 `json:"source_volt"`  // HV source voltage (-1000..+1000)
	AutoRange   bool    `json:"auto_range"`   // auto range enable
	Range       string  `json:"range"`        // manual range value (if auto off)
	Frequency   float64 `json:"frequency"`    // polling frequency in Hz (1-20)
	ZeroCorrect bool    `json:"zero_correct"` // run zero correction before start
}

// HvPoint defines a key point in an HV voltage schedule
type HvPoint struct {
	TimeSec float64 `json:"time_sec"` // seconds from experiment start
	Voltage float64 `json:"voltage"`  // target voltage at this point
}

// FrequencyToSpeed maps polling frequency to SCPI integration speed
func FrequencyToSpeed(hz float64) string {
	if hz >= 10 {
		return "FAST"
	}
	if hz >= 3 {
		return "MED"
	}
	return "SLOW"
}

// DefaultSettings returns safe sensible defaults for TH2690
func DefaultSettings() InstrumentSettings {
	return InstrumentSettings{
		Function:    "CURR",
		SourceOn:    false,
		SourceVolt:  0,
		AutoRange:   true,
		Range:       "",
		Frequency:   5,
		ZeroCorrect: true,
	}
}

// ApplySettings configures the TH2690 electrometer via SCPI.
// TH2690 uses its own command tree (not standard Keithley SCPI):
//
//	FUNC:FUNC CURR, FUNC:SRC ON, SRC:VALUE <v>, CURR:RANGE 1, etc.
//
// Each command is sent on its own TCP connection.
// Best-effort: logs warnings but does not block experiment start.
func ApplySettings(host string, port int, s InstrumentSettings) error {
	log.Printf("[SCPI] ApplySettings %s:%d func=%s freq=%.0f autoRange=%v sourceOn=%v sourceVolt=%.0f",
		host, port, s.Function, s.Frequency, s.AutoRange, s.SourceOn, s.SourceVolt)

	cmds := buildSettingsCommands(s)
	for _, cmd := range cmds {
		resp, err := Send(host, port, cmd, 2*time.Second)
		if err != nil {
			log.Printf("[SCPI] ApplySettings %s:%d cmd=%q ERROR: %v", host, port, cmd, err)
		} else if resp != "" {
			log.Printf("[SCPI] ApplySettings %s:%d cmd=%q resp=%q", host, port, cmd, resp)
		} else {
			log.Printf("[SCPI] ApplySettings %s:%d cmd=%q OK", host, port, cmd)
		}
	}
	return nil
}

// buildSettingsCommands converts settings into ordered SCPI commands for TH2690.
// Uses correct TH2690 command tree from official manual (Chapter 6.6):
//
//	FUNC:FUNC, FUNC:SRC, FUNC:AMMET, SRC:VALUE, SRC:RANGE, CURR:RANGE, CURR:SPEED, etc.
func buildSettingsCommands(s InstrumentSettings) []string {
	var cmds []string

	// 1. Set measurement function (FUNC:FUNC <RES|VOLT|CURR|COUL|SRC>)
	switch s.Function {
	case "RES":
		cmds = append(cmds, "FUNC:FUNC RES")
	case "CHAR":
		cmds = append(cmds, "FUNC:FUNC COUL")
	default:
		cmds = append(cmds, "FUNC:FUNC CURR")
	}

	// 2. Enable ammeter (FUNC:AMMET ON)
	cmds = append(cmds, "FUNC:AMMET ON")

	// 3. Disable Null/Zero (FUNC:ZERO OFF) — prevents offset
	if !s.ZeroCorrect {
		cmds = append(cmds, "FUNC:ZERO OFF")
	} else {
		cmds = append(cmds, "FUNC:ZERO ON")
	}

	// 4. Measurement speed per function (e.g. CURR:SPEED <FAST|MID|SLOW>)
	speed := FrequencyToSpeed(s.Frequency)
	switch s.Function {
	case "RES":
		cmds = append(cmds, "RES:SPEED "+speed)
	default:
		cmds = append(cmds, "CURR:SPEED "+speed)
	}

	// 5. Range: 1=Auto, 2..11=manual (CURR:RANGE <1..11>)
	if s.AutoRange {
		switch s.Function {
		case "RES":
			cmds = append(cmds, "RES:RANGE 1")
		default:
			cmds = append(cmds, "CURR:RANGE 1")
		}
	} else if s.Range != "" {
		switch s.Function {
		case "RES":
			cmds = append(cmds, fmt.Sprintf("RES:RANGE %s", s.Range))
		default:
			cmds = append(cmds, fmt.Sprintf("CURR:RANGE %s", s.Range))
		}
	}

	// 6. Source voltage (SRC:VALUE <float>, SRC:RANGE <1|2|3>)
	if s.SourceOn {
		// Set range first: 1=-20~20V, 2=0~1000V, 3=-1000~0V
		if s.SourceVolt >= 0 {
			cmds = append(cmds, "SRC:RANGE 2")
		} else {
			cmds = append(cmds, "SRC:RANGE 3")
		}
		cmds = append(cmds, fmt.Sprintf("SRC:VALUE %.3f", s.SourceVolt))
		cmds = append(cmds, "FUNC:SRC ON")
	} else {
		cmds = append(cmds, "FUNC:SRC OFF")
	}

	return cmds
}

// PollingInterval returns the duration between polls for the given settings
func (s InstrumentSettings) PollingInterval() time.Duration {
	hz := s.Frequency
	if hz <= 0 {
		hz = 5
	}
	if hz > 20 {
		hz = 20
	}
	return time.Duration(1000.0/hz) * time.Millisecond
}

// ReadSettings queries current instrument state (best-effort)
// Uses correct TH2690 query commands: FUNC:FUNC?, FUNC:SRC?, SRC:VALUE?
func ReadSettings(host string, port int) (*InstrumentSettings, error) {
	s := DefaultSettings()

	// Query function
	if resp, err := Send(host, port, "FUNC:FUNC?", defaultTimeout); err == nil && resp != "" {
		switch resp {
		case "RES":
			s.Function = "RES"
		case "COUL":
			s.Function = "CHAR"
		default:
			s.Function = "CURR"
		}
	}

	// Query source state
	if resp, err := Send(host, port, "FUNC:SRC?", defaultTimeout); err == nil {
		if resp == "ON" {
			s.SourceOn = true
		}
	}

	// Query source voltage
	if resp, err := Send(host, port, "SRC:VALUE?", defaultTimeout); err == nil && resp != "" {
		fmt.Sscanf(resp, "%f", &s.SourceVolt)
	}

	return &s, nil
}

// SendRaw sends an arbitrary SCPI command and returns the response
func SendRaw(host string, port int, cmd string) (string, error) {
	return Send(host, port, cmd, 2*time.Second)
}
