package controllers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"

	"back/database"
)

func saveAndReturnPath(c *gin.Context, subdir string) (string, error) {
	fh, err := c.FormFile("file")
	if err != nil { return "", err }
	base := filepath.Join("uploads", subdir)
	if err := os.MkdirAll(base, 0755); err != nil { return "", err }
	name := fmt.Sprintf("%d_%s", time.Now().UnixNano(), fh.Filename)
	dst := filepath.Join(base, name)
	if err := c.SaveUploadedFile(fh, dst); err != nil { return "", err }
	return "/" + filepath.ToSlash(dst), nil // <-- относительный путь, см. фронт
}

func UploadImageForRow(c *gin.Context) {
	table := c.Param("table"); id := c.Param("id")
	path, err := saveAndReturnPath(c, "images")
	if err != nil { c.JSON(http.StatusInternalServerError, gin.H{"error":"save failed"}); return }

	upd := fmt.Sprintf(`UPDATE "%s" SET "image_links" = COALESCE("image_links", ARRAY[]::text[]) || ARRAY[?] WHERE id = ?`, table)
	if err := database.DB.Exec(upd, path, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("db update failed: %v", err)}); return
	}
	c.JSON(http.StatusOK, gin.H{"path": path})
}

func UploadFileForRow(c *gin.Context) {
	table := c.Param("table"); id := c.Param("id")
	path, err := saveAndReturnPath(c, "files")
	if err != nil { c.JSON(http.StatusInternalServerError, gin.H{"error":"save failed"}); return }

	upd := fmt.Sprintf(`UPDATE "%s" SET "file_links" = COALESCE("file_links", ARRAY[]::text[]) || ARRAY[?] WHERE id = ?`, table)
	if err := database.DB.Exec(upd, path, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("db update failed: %v", err)}); return
	}
	c.JSON(http.StatusOK, gin.H{"path": path})
}

func DeleteImageForRow(c *gin.Context) {
	table := c.Param("table"); id := c.Param("id")
	var body struct{ Path string `json:"path"` }
	if err := c.ShouldBindJSON(&body); err != nil || body.Path=="" {
		c.JSON(http.StatusBadRequest, gin.H{"error":"path required"}); return
	}
	upd := fmt.Sprintf(`UPDATE "%s" SET "image_links" = COALESCE(ARRAY_REMOVE("image_links", ?), ARRAY[]::text[]) WHERE id = ?`, table)
	if err := database.DB.Exec(upd, body.Path, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("db update failed: %v", err)}); return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func DeleteFileForRow(c *gin.Context) {
	table := c.Param("table"); id := c.Param("id")
	var body struct{ Path string `json:"path"` }
	if err := c.ShouldBindJSON(&body); err != nil || body.Path=="" {
		c.JSON(http.StatusBadRequest, gin.H{"error":"path required"}); return
	}
	upd := fmt.Sprintf(`UPDATE "%s" SET "file_links" = COALESCE(ARRAY_REMOVE("file_links", ?), ARRAY[]::text[]) WHERE id = ?`, table)
	if err := database.DB.Exec(upd, body.Path, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("db update failed: %v", err)}); return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
