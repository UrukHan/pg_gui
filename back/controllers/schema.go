package controllers

import (
	"fmt"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"back/database"
	"back/models"
)

type SchemaRequest struct {
	Tables     []models.Table `json:"tables"`
	RenameFrom string         `json:"renameFrom,omitempty"`
	RenameTo   string         `json:"renameTo,omitempty"`
}

func logTables(phase string) {
    var allTables []string
    database.DB.Raw(`SELECT tablename FROM pg_tables WHERE schemaname = 'public';`).Scan(&allTables)
    log.Printf("[%s] Таблицы в базе: %v", phase, allTables)
}

func GetSchema(c *gin.Context) {
	schema, err := models.LoadSchema("config.json")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, schema)
}

func PostSchema(c *gin.Context) {
	var req SchemaRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("Ошибка при разборе запроса: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	log.Printf("ПОЛУЧЕННЫЙ ЗАПРОС: %+v", req)
	logTables("START")

	currentSchema, err := models.LoadSchema("config.json")
	if err != nil {
		log.Printf("Ошибка при загрузке схемы: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if req.RenameFrom != "" && req.RenameTo != "" && req.RenameFrom != req.RenameTo {
		log.Printf("Переименование таблицы '%s' в '%s'", req.RenameFrom, req.RenameTo)

		var existsFrom, existsTo int
		checkSQL := `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1;`

		database.DB.Raw(checkSQL, req.RenameFrom).Scan(&existsFrom)
		database.DB.Raw(checkSQL, req.RenameTo).Scan(&existsTo)

		if existsFrom == 0 {
			msg := fmt.Sprintf("Таблица '%s' не существует", req.RenameFrom)
			log.Printf(msg)
			c.JSON(http.StatusBadRequest, gin.H{"error": msg})
			return
		}
		if existsTo != 0 {
			msg := fmt.Sprintf("Таблица '%s' уже существует", req.RenameTo)
			log.Printf(msg)
			c.JSON(http.StatusBadRequest, gin.H{"error": msg})
			return
		}

		sqlRename := fmt.Sprintf(`ALTER TABLE "%s" RENAME TO "%s";`, req.RenameFrom, req.RenameTo)
		if err := database.DB.Exec(sqlRename).Error; err != nil {
			log.Printf("Ошибка переименования: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Rename error: %v", err)})
			return
		}

		log.Printf("Таблица успешно переименована: '%s' -> '%s'", req.RenameFrom, req.RenameTo)

		for i, tbl := range req.Tables {
			if tbl.Name == req.RenameFrom {
				req.Tables[i].Name = req.RenameTo
			}
		}
	}

	logTables("AFTER RENAME")

	for _, table := range req.Tables {
		log.Printf("Миграция таблицы: '%s'", table.Name)
		if err := migrateTable(table); err != nil {
			log.Printf("Ошибка миграции таблицы '%s': %v", table.Name, err)
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": fmt.Sprintf("Migration error for table '%s': %v", table.Name, err),
			})
			return
		}
		log.Printf("Таблица '%s' успешно мигрирована", table.Name)
	}

	logTables("AFTER MIGRATION")

	for _, oldTable := range currentSchema.Tables {
		oldName := oldTable.Name
		if oldName == req.RenameFrom && req.RenameFrom != "" {
			oldName = req.RenameTo
		}

		if !tableExists(req.Tables, oldName) {
			sqlDrop := fmt.Sprintf(`DROP TABLE IF EXISTS "%s" CASCADE;`, oldTable.Name)
			log.Printf("Удаление таблицы: '%s'", oldTable.Name)
			if err := database.DB.Exec(sqlDrop).Error; err != nil {
				log.Printf("Ошибка удаления таблицы '%s': %v", oldTable.Name, err)
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": fmt.Sprintf("Error dropping table '%s': %v", oldTable.Name, err),
				})
				return
			}
			log.Printf("Таблица '%s' успешно удалена", oldTable.Name)
		}
	}

	logTables("END")

	newSchema := models.Schema{Tables: req.Tables}
	if err := models.SaveSchema("config.json", newSchema); err != nil {
		log.Printf("Ошибка сохранения новой схемы: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	log.Printf("Схема успешно обновлена")

	c.JSON(http.StatusOK, gin.H{"status": "schema updated"})
}


func isSameTable(a, b models.Table) bool {
	if len(a.Fields) != len(b.Fields) {
		return false
	}
	fieldsA := make(map[string]string)
	for _, f := range a.Fields {
		fieldsA[f.Name] = f.Type
	}
	for _, f := range b.Fields {
		if t, ok := fieldsA[f.Name]; !ok || t != f.Type {
			return false
		}
	}
	return true
}

func tableExists(tables []models.Table, name string) bool {
	for _, t := range tables {
		if t.Name == name {
			return true
		}
	}
	return false
}

func DeleteTable(c *gin.Context) {
	tableName := c.Param("tableName")

	dropSQL := fmt.Sprintf(`DROP TABLE IF EXISTS "%s" CASCADE;`, tableName)
	if err := database.DB.Exec(dropSQL).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to drop table: %v", err),
		})
		return
	}

	schema, err := models.LoadSchema("config.json")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to load schema: %v", err),
		})
		return
	}

	newTables := make([]models.Table, 0, len(schema.Tables))
	for _, t := range schema.Tables {
		if t.Name != tableName {
			newTables = append(newTables, t)
		}
	}
	schema.Tables = newTables

	if err := models.SaveSchema("config.json", schema); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("failed to save schema: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "table deleted successfully"})
}


func DeleteTableRow(c *gin.Context) {
	tableName := c.Param("tableName")
	rowId := c.Param("id")

	query := fmt.Sprintf(`DELETE FROM "%s" WHERE id = ?`, tableName)
	if err := database.DB.Exec(query, rowId).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to delete row: %v", err),
		})
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

	fmt.Printf("Updating row %s in table %s: %+v\n", rowId, tableName, rowData)

	if err := database.DB.Table(tableName).Where("id = ?", rowId).Updates(rowData).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": fmt.Sprintf("Failed to update row: %v", err),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "Row updated successfully"})
}

func migrateTable(table models.Table) error {
	createSQL := fmt.Sprintf(`CREATE TABLE IF NOT EXISTS "%s" (id SERIAL PRIMARY KEY);`, table.Name)
	if err := database.DB.Exec(createSQL).Error; err != nil {
		return err
	}

	var currentColumns []string
	columnsSQL := `
		SELECT column_name FROM information_schema.columns
		WHERE table_name = ? AND column_name != 'id';`
	if err := database.DB.Raw(columnsSQL, table.Name).Scan(&currentColumns).Error; err != nil {
		return err
	}

	schemaColumns := make(map[string]models.Field)
	for _, field := range table.Fields {
		schemaColumns[field.Name] = field
	}

	for _, col := range currentColumns {
		if _, exists := schemaColumns[col]; !exists {
			dropColumnSQL := fmt.Sprintf(`ALTER TABLE "%s" DROP COLUMN "%s";`, table.Name, col)
			if err := database.DB.Exec(dropColumnSQL).Error; err != nil {
				return err
			}
		}
	}

	for _, field := range table.Fields {
		if field.Name == "id" {
			continue
		}

		var exists bool
		checkSQL := `
			SELECT 1
			FROM information_schema.columns
			WHERE table_name = ? AND column_name = ?;`

		var rows []map[string]interface{}
		if err := database.DB.Raw(checkSQL, table.Name, field.Name).Scan(&rows).Error; err != nil {
			return err
		}
		exists = len(rows) > 0
		if exists {
			continue
		}

		colDef := fmt.Sprintf(`"%s" %s`, field.Name, mapFieldTypeToSQL(field.Type))

		if !field.Nullable {
			colDef += " NOT NULL"
		}
		if field.Default != "" {
			if field.Type == "int" || field.Type == "uint" || field.Type == "float" || field.Type == "bool" {
				colDef += fmt.Sprintf(" DEFAULT %s", field.Default)
			} else {
				colDef += fmt.Sprintf(" DEFAULT '%s'", field.Default)
			}
		}

		alterSQL := fmt.Sprintf(`ALTER TABLE "%s" ADD COLUMN %s;`, table.Name, colDef)
		if err := database.DB.Exec(alterSQL).Error; err != nil {
			return err
		}

		if field.Unique {
			uniqueSQL := fmt.Sprintf(`ALTER TABLE "%s" ADD UNIQUE ("%s");`, table.Name, field.Name)
			if err := database.DB.Exec(uniqueSQL).Error; err != nil {
				return err
			}
		}
	}

	return nil
}



func mapFieldTypeToSQL(fieldType string) string {
	switch fieldType {
	case "uint", "int":
		return "INTEGER"
	case "float":
		return "FLOAT"
	case "string":
		return "VARCHAR(255)"
	case "text":
		return "TEXT"
	case "bool":
		return "BOOLEAN"
	default:
		return "VARCHAR(255)"
	}
}
