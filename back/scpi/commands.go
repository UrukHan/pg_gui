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

// ApplySettings configures the TH2690 electrometer.
// First switches to REMOTE mode, then sends configuration commands.
// Each command is sent on its own TCP connection (TH2690 requirement).
// Best-effort: logs warnings but does not block experiment start.
func ApplySettings(host string, port int, s InstrumentSettings) error {
	log.Printf("[SCPI] ApplySettings %s:%d settings: func=%s freq=%.0f autoRange=%v zeroCorr=%v sourceOn=%v sourceVolt=%.0f",
		host, port, s.Function, s.Frequency, s.AutoRange, s.ZeroCorrect, s.SourceOn, s.SourceVolt)

	// Step 1: Try to switch instrument to REMOTE mode
	remCmds := []string{"SYST:REM", "SYST:RWL", "SYSTem:REMote", "SYST:LOC OFF"}
	for _, cmd := range remCmds {
		resp, err := Send(host, port, cmd, 2*time.Second)
		log.Printf("[SCPI] RemoteMode %s:%d cmd=%q resp=%q err=%v", host, port, cmd, resp, err)
	}

	// Step 2: Clear errors and reset
	for _, cmd := range []string{"*CLS", "*RST"} {
		resp, err := Send(host, port, cmd, 2*time.Second)
		log.Printf("[SCPI] Init %s:%d cmd=%q resp=%q err=%v", host, port, cmd, resp, err)
	}

	// Step 3: Disable zero check (critical — shorts input when ON)
	for _, cmd := range []string{"SYST:ZCH OFF", "SYST:ZCH 0", "ZCHK:STAT OFF"} {
		resp, err := Send(host, port, cmd, 2*time.Second)
		log.Printf("[SCPI] ZeroCheck %s:%d cmd=%q resp=%q err=%v", host, port, cmd, resp, err)
	}

	// Step 4: Apply settings (best-effort, each on own connection)
	cmds := buildSettingsCommands(s)
	for _, cmd := range cmds {
		resp, err := Send(host, port, cmd, 2*time.Second)
		if err != nil {
			log.Printf("[SCPI] ApplySettings %s:%d cmd=%q ERROR: %v", host, port, cmd, err)
		} else if resp != "" {
			log.Printf("[SCPI] ApplySettings %s:%d cmd=%q resp=%q", host, port, cmd, resp)
		} else {
			log.Printf("[SCPI] ApplySettings %s:%d cmd=%q OK (empty)", host, port, cmd)
		}
	}

	// Step 5: Query current state for diagnostics
	for _, cmd := range []string{"FUNC?", "SOUR:VOLT?", "SOUR:STAT?", "SYST:ZCH?", "RANG:AUTO?"} {
		resp, err := Send(host, port, cmd, 2*time.Second)
		log.Printf("[SCPI] QueryState %s:%d cmd=%q resp=%q err=%v", host, port, cmd, resp, err)
	}

	return nil
}

// buildSettingsCommands converts settings into ordered SCPI commands for TH2690.
// TH2690 has limited remote control; many commands may return Error 5.
// Critical: SYST:ZCH OFF disables zero check (which shorts input → all reads = 0).
func buildSettingsCommands(s InstrumentSettings) []string {
	var cmds []string

	// 1. Disable zero check — THIS IS CRITICAL
	// When zero check is ON (default after power-on), input is shorted and all measurements = 0
	cmds = append(cmds, "SYST:ZCH OFF")
	cmds = append(cmds, "KEY ZCHK") // fallback: simulate front-panel ZCHK key press

	// 2. Set measurement function
	switch s.Function {
	case "RES":
		cmds = append(cmds, "FUNC RES")
	case "CHAR":
		cmds = append(cmds, "FUNC CHAR")
	default:
		cmds = append(cmds, "FUNC CURR")
	}

	// 3. Measurement speed
	speed := FrequencyToSpeed(s.Frequency)
	cmds = append(cmds, "SPEED "+speed)

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
