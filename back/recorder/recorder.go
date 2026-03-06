package recorder

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"

	"back/database"
	"back/models"
	"back/storage"
)

type Recording struct {
	cmd      *exec.Cmd
	filePath string
	objName  string
	done     chan struct{}
}

type Manager struct {
	mu         sync.Mutex
	recordings map[uint]*Recording // experimentID -> recording
}

var Default = &Manager{
	recordings: make(map[uint]*Recording),
}

// Cameras holds parsed camera configs
var Cameras []CameraConfig

type CameraConfig struct {
	Name    string
	RTSPURL string
}

func ParseCameras(raw string) []CameraConfig {
	if raw == "" {
		return nil
	}
	var configs []CameraConfig
	// Format: "Name1=rtsp://...,Name2=rtsp://..."
	// RTSP URLs contain colons, so we split on comma first, then on first "="
	start := 0
	for i := 0; i <= len(raw); i++ {
		if i == len(raw) || raw[i] == ',' {
			s := raw[start:i]
			start = i + 1
			if len(s) == 0 {
				continue
			}
			// Find first '='
			eqIdx := -1
			for j := 0; j < len(s); j++ {
				if s[j] == '=' {
					eqIdx = j
					break
				}
			}
			if eqIdx > 0 {
				name := s[:eqIdx]
				url := s[eqIdx+1:]
				configs = append(configs, CameraConfig{Name: name, RTSPURL: url})
			}
		}
	}
	return configs
}

// Start begins recording from the first available camera for the given experiment
func (m *Manager) Start(experimentID uint) {
	if !storage.Enabled() {
		log.Printf("[Recorder] MinIO not available, skipping video for exp=%d", experimentID)
		return
	}
	if len(Cameras) == 0 {
		log.Printf("[Recorder] No cameras configured, skipping video for exp=%d", experimentID)
		return
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.recordings[experimentID]; ok {
		return // already recording
	}

	// Check if any camera is active in DB
	var activeCam models.Camera
	if err := database.DB.Where("active = ?", true).First(&activeCam).Error; err != nil {
		log.Printf("[Recorder] No active cameras, skipping video for exp=%d", experimentID)
		return
	}

	// Find matching config by RTSP URL
	var cam CameraConfig
	found := false
	for _, c := range Cameras {
		if c.RTSPURL == activeCam.RTSPURL {
			cam = c
			found = true
			break
		}
	}
	if !found {
		cam = CameraConfig{Name: activeCam.Name, RTSPURL: activeCam.RTSPURL}
	}
	tmpDir := os.TempDir()
	fileName := fmt.Sprintf("exp_%d.mp4", experimentID)
	filePath := filepath.Join(tmpDir, fileName)
	objName := fmt.Sprintf("video/%s", fileName)

	// FFmpeg: record RTSP to MP4 file
	// -rtsp_transport tcp: more reliable
	// -t 86400: max 24h safety limit
	// -c copy: no re-encoding, just mux
	cmd := exec.Command("ffmpeg",
		"-rtsp_transport", "tcp",
		"-i", cam.RTSPURL,
		"-c", "copy",
		"-t", "86400",
		"-movflags", "+faststart",
		"-y",
		filePath,
	)
	cmd.Stdout = nil
	cmd.Stderr = nil

	if err := cmd.Start(); err != nil {
		log.Printf("[Recorder] FFmpeg start error for exp=%d: %v", experimentID, err)
		return
	}

	rec := &Recording{
		cmd:      cmd,
		filePath: filePath,
		objName:  objName,
		done:     make(chan struct{}),
	}
	m.recordings[experimentID] = rec

	// Wait for process in background
	go func() {
		defer close(rec.done)
		if err := cmd.Wait(); err != nil {
			log.Printf("[Recorder] FFmpeg finished for exp=%d: %v", experimentID, err)
		}
	}()

	log.Printf("[Recorder] Started recording for exp=%d camera=%s -> %s", experimentID, cam.Name, filePath)
}

// Stop stops recording, uploads to MinIO, returns the object name
func (m *Manager) Stop(experimentID uint) string {
	m.mu.Lock()
	rec, ok := m.recordings[experimentID]
	if !ok {
		m.mu.Unlock()
		return ""
	}
	delete(m.recordings, experimentID)
	m.mu.Unlock()

	// Send SIGINT to ffmpeg for graceful shutdown (writes trailer)
	if rec.cmd.Process != nil {
		rec.cmd.Process.Signal(os.Interrupt)
	}

	// Wait for ffmpeg to finish (max a few seconds)
	<-rec.done

	// Upload to MinIO
	if err := storage.UploadFile(rec.objName, rec.filePath, "video/mp4"); err != nil {
		log.Printf("[Recorder] Upload error for exp=%d: %v", experimentID, err)
		return ""
	}

	// Clean up temp file
	os.Remove(rec.filePath)

	log.Printf("[Recorder] Uploaded video for exp=%d -> %s", experimentID, rec.objName)
	return rec.objName
}

// IsRecording checks if experiment has active recording
func (m *Manager) IsRecording(experimentID uint) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.recordings[experimentID]
	return ok
}
