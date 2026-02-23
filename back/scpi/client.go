package scpi

import (
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"
)

const defaultTimeout = 1500 * time.Millisecond

// Response holds parsed FETCH:ALL_S? data
type Response struct {
	Voltage     float64
	Current     float64
	Charge      float64
	Resistance  float64
	DeviceTime  string
	Source      float64
	MathValue   float64
	Temperature float64
	Humidity    float64
	ErrorCode   int
}

// Send sends a SCPI command and returns the trimmed response string
func Send(host string, port int, cmd string, timeout time.Duration) (string, error) {
	if timeout == 0 {
		timeout = defaultTimeout
	}
	addr := fmt.Sprintf("%s:%d", host, port)
	conn, err := net.DialTimeout("tcp", addr, timeout)
	if err != nil {
		return "", fmt.Errorf("connect %s: %w", addr, err)
	}
	defer conn.Close()

	conn.SetDeadline(time.Now().Add(timeout))
	_, err = conn.Write([]byte(cmd + "\r\n"))
	if err != nil {
		return "", fmt.Errorf("write: %w", err)
	}

	buf := make([]byte, 4096)
	n, err := conn.Read(buf)
	if err != nil {
		// timeout is OK for commands that have no reply
		if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
			return "", nil
		}
		return "", fmt.Errorf("read: %w", err)
	}
	return strings.TrimSpace(string(buf[:n])), nil
}

// IDNInfo holds parsed *IDN? data
type IDNInfo struct {
	Model    string
	Firmware string
	Serial   string
	Raw      string
}

// Identify sends *IDN? and returns the identity string
func Identify(host string, port int) (string, error) {
	return Send(host, port, "*IDN?", defaultTimeout)
}

// QueryIDN sends *IDN? and parses the response into structured fields.
// TH2690 returns: "model,firmware,serial" e.g. "TH2690,V1.0.22,R08C240109"
func QueryIDN(host string, port int) (*IDNInfo, error) {
	raw, err := Identify(host, port)
	if err != nil {
		return nil, err
	}
	if raw == "" {
		return nil, fmt.Errorf("empty IDN response")
	}
	info := &IDNInfo{Raw: raw}
	parts := strings.Split(raw, ",")
	if len(parts) >= 1 {
		info.Model = strings.TrimSpace(parts[0])
	}
	if len(parts) >= 2 {
		info.Firmware = strings.TrimSpace(parts[1])
	}
	if len(parts) >= 3 {
		info.Serial = strings.TrimSpace(parts[2])
	}
	return info, nil
}

// FetchAll sends FETCH:ALL_S? and parses the response
func FetchAll(host string, port int) (*Response, error) {
	raw, err := Send(host, port, "FETCH:ALL_S?", defaultTimeout)
	if err != nil {
		return nil, err
	}
	return ParseAllS(raw)
}

// Run sends FUNC:RUN
func Run(host string, port int) error {
	_, err := Send(host, port, "FUNC:RUN", defaultTimeout)
	return err
}

// Stop sends FUNC:STOP
func Stop(host string, port int) error {
	_, err := Send(host, port, "FUNC:STOP", defaultTimeout)
	return err
}

// ClearError sends HAND:ERROR
func ClearError(host string, port int) error {
	_, err := Send(host, port, "HAND:ERROR", defaultTimeout)
	return err
}

// ParseAllS parses a FETCH:ALL_S? response CSV string
// Format: voltage,current,charge,resistance,time,source,math,temperature,humidity,error_code
func ParseAllS(raw string) (*Response, error) {
	parts := strings.Split(raw, ",")
	if len(parts) < 10 {
		return nil, fmt.Errorf("unexpected ALL_S format: %q (got %d fields)", raw, len(parts))
	}

	r := &Response{}
	var err error

	r.Voltage, err = strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
	if err != nil {
		return nil, fmt.Errorf("parse voltage: %w", err)
	}
	r.Current, err = strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
	if err != nil {
		return nil, fmt.Errorf("parse current: %w", err)
	}
	r.Charge, err = strconv.ParseFloat(strings.TrimSpace(parts[2]), 64)
	if err != nil {
		return nil, fmt.Errorf("parse charge: %w", err)
	}
	r.Resistance, err = strconv.ParseFloat(strings.TrimSpace(parts[3]), 64)
	if err != nil {
		return nil, fmt.Errorf("parse resistance: %w", err)
	}
	r.DeviceTime = strings.TrimSpace(parts[4])
	r.Source, err = strconv.ParseFloat(strings.TrimSpace(parts[5]), 64)
	if err != nil {
		return nil, fmt.Errorf("parse source: %w", err)
	}
	r.MathValue, err = strconv.ParseFloat(strings.TrimSpace(parts[6]), 64)
	if err != nil {
		return nil, fmt.Errorf("parse math: %w", err)
	}
	r.Temperature, err = strconv.ParseFloat(strings.TrimSpace(parts[7]), 64)
	if err != nil {
		return nil, fmt.Errorf("parse temperature: %w", err)
	}
	r.Humidity, err = strconv.ParseFloat(strings.TrimSpace(parts[8]), 64)
	if err != nil {
		return nil, fmt.Errorf("parse humidity: %w", err)
	}
	r.ErrorCode, err = strconv.Atoi(strings.TrimSpace(parts[9]))
	if err != nil {
		return nil, fmt.Errorf("parse error_code: %w", err)
	}

	return r, nil
}
