package controllers

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"back/database"
	"back/models"
)

func GetTableData(c *gin.Context) {
	tableName := c.Param("tableName")

	schema, err := models.LoadSchema("config.json")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Собираем список полей (id всегда включён)
	fields := []string{`"id"`}
	var found bool
	for _, table := range schema.Tables {
		if table.Name == tableName {
			found = true
			for _, f := range table.Fields {
				if f.Name != "id" {
					fields = append(fields, fmt.Sprintf(`"%s"`, f.Name))
				}
			}
			break
		}
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "table not found in schema"})
		return
	}

	query := fmt.Sprintf(`SELECT %s FROM "%s" ORDER BY "id" ASC;`,
		strings.Join(fields, ", "), tableName)

	rows, err := database.DB.Raw(query).Rows()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var result []map[string]interface{}
	cols, _ := rows.Columns()

	for rows.Next() {
		values := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range values {
			ptrs[i] = &values[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		m := make(map[string]interface{}, len(cols))
		for i, col := range cols {
			m[col] = *(ptrs[i].(*interface{}))
		}
		result = append(result, m)
	}

	c.JSON(http.StatusOK, gin.H{"rows": result})
}

func CreateTableRow(c *gin.Context) {
	tableName := c.Param("tableName")
	var rowData map[string]interface{}
	if err := c.ShouldBindJSON(&rowData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input format"})
		return
	}
	if err := database.DB.Table(tableName).Create(rowData).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Failed to insert row: %v", err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "Row inserted successfully"})
}

func DeleteTableRow(c *gin.Context) {
	tableName := c.Param("tableName")
	rowId := c.Param("id")
	query := fmt.Sprintf(`DELETE FROM "%s" WHERE id = ?`, tableName)
	if err := database.DB.Exec(query, rowId).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to delete row: %v", err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "Row deleted successfully"})
}

func UpdateTableRow(c *gin.Context) {
	tableName := c.Param("tableName")
	rowId := c.Param("id")
	var rowData map[string]interface{}
	if err := c.ShouldBindJSON(&rowData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input format"})
		return
	}
	if err := database.DB.Table(tableName).Where("id = ?", rowId).Updates(rowData).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to update row: %v", err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "Row updated successfully"})
}
