package controllers

import (
	"net/http"
    "fmt"
	"github.com/gin-gonic/gin"
	"back/database"
	"back/models"
	"strings"
)

func GetTableData(c *gin.Context) {
	tableName := c.Param("tableName")

	schema, err := models.LoadSchema("config.json")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var fields []string

	// Всегда добавляем поле id вручную!
	fields = append(fields, `"id"`)

	for _, table := range schema.Tables {
		if table.Name == tableName {
			for _, field := range table.Fields {
				if field.Name != "id" {
					fields = append(fields, fmt.Sprintf(`"%s"`, field.Name))
				}
			}
			break
		}
	}

	if len(fields) == 1 { // Только id, значит таблицы нет в схеме
		c.JSON(http.StatusNotFound, gin.H{"error": "table not found in schema"})
		return
	}

	orderByField := `"id"`

	query := fmt.Sprintf(`SELECT %s FROM "%s" ORDER BY %s ASC;`,
		strings.Join(fields, ", "),
		tableName,
		orderByField,
	)

	rows, err := database.DB.Raw(query).Rows()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var result []map[string]interface{}
	cols, _ := rows.Columns()

	for rows.Next() {
		columns := make([]interface{}, len(cols))
		columnPointers := make([]interface{}, len(cols))

		for i := range columns {
			columnPointers[i] = &columns[i]
		}

		if err := rows.Scan(columnPointers...); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		rowMap := make(map[string]interface{})
		for i, colName := range cols {
			val := columnPointers[i].(*interface{})
			rowMap[colName] = *val
		}

		result = append(result, rowMap)
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

	fmt.Printf("Creating row in table %s: %+v\n", tableName, rowData)

	if err := database.DB.Table(tableName).Create(rowData).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("Failed to insert row: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "Row inserted successfully"})
}

