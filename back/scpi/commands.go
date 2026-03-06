package scpi

import (
	"fmt"
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

// ApplySettings sends configuration SCPI commands to the instrument
func ApplySettings(host string, port int, s InstrumentSettings) error {
	cmds := buildSettingsCommands(s)
	for _, cmd := range cmds {
		if _, err := Send(host, port, cmd, 2*time.Second); err != nil {
			return fmt.Errorf("command %q failed: %w", cmd, err)
		}
		// Small delay between commands for instrument to process
		time.Sleep(50 * time.Millisecond)
	}
	return nil
}

// buildSettingsCommands converts settings into ordered SCPI commands for TH2690
func buildSettingsCommands(s InstrumentSettings) []string {
	var cmds []string

	// 1. Stop any running measurement
	cmds = append(cmds, "FUNC:STOP")

	// 2. Set measurement function
	switch s.Function {
	case "RES":
		cmds = append(cmds, "FUNC:RES")
	case "CHAR":
		cmds = append(cmds, "FUNC:CHAR")
	default:
		cmds = append(cmds, "FUNC:CURR")
	}

	// 3. Measurement speed (derived from frequency)
	speed := FrequencyToSpeed(s.Frequency)
	cmds = append(cmds, "SPEED:"+speed)

	// 4. Range
	if s.AutoRange {
		cmds = append(cmds, "RANG:AUTO ON")
	} else {
		cmds = append(cmds, "RANG:AUTO OFF")
		if s.Range != "" {
			cmds = append(cmds, fmt.Sprintf("RANG %s", s.Range))
		}
	}

	// 5. Zero correction
	if s.ZeroCorrect {
		cmds = append(cmds, "ZERO:CORR")
	}

	// 6. Source voltage
	if s.SourceOn {
		cmds = append(cmds, fmt.Sprintf("SOUR:VOLT %.3f", s.SourceVolt))
		cmds = append(cmds, "SOUR:STAT ON")
	} else {
		cmds = append(cmds, "SOUR:STAT OFF")
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
func ReadSettings(host string, port int) (*InstrumentSettings, error) {
	s := DefaultSettings()

	// Query function
	if resp, err := Send(host, port, "FUNC?", defaultTimeout); err == nil && resp != "" {
		switch resp {
		case "RES":
			s.Function = "RES"
		case "CHAR":
			s.Function = "CHAR"
		default:
			s.Function = "CURR"
		}
	}

	// Query source state
	if resp, err := Send(host, port, "SOUR:STAT?", defaultTimeout); err == nil {
		if resp == "ON" || resp == "1" {
			s.SourceOn = true
		}
	}

	// Query source voltage
	if resp, err := Send(host, port, "SOUR:VOLT?", defaultTimeout); err == nil && resp != "" {
		fmt.Sscanf(resp, "%f", &s.SourceVolt)
	}

	return &s, nil
}

// SendRaw sends an arbitrary SCPI command and returns the response
func SendRaw(host string, port int, cmd string) (string, error) {
	return Send(host, port, cmd, 2*time.Second)
}
