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

// --- НОВОЕ: гарантируем, что в каждой таблице есть поля image_links и file_links (TEXT[])
func ensureAssetFields(t *models.Table) {
	need := map[string]bool{
		"image_links": true,
		"file_links":  true,
	}
	for _, f := range t.Fields {
		if f.Name == "image_links" || f.Name == "file_links" {
			delete(need, f.Name)
		}
	}
	for name := range need {
		t.Fields = append(t.Fields, models.Field{
			Name:     name,
			Type:     "text_array", // -> TEXT[]
			Nullable: true,
		})
	}
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

	// Переименование таблицы по запросу
	if req.RenameFrom != "" && req.RenameTo != "" && req.RenameFrom != req.RenameTo {
		var existsFrom, existsTo int
		checkSQL := `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1;`
		database.DB.Raw(checkSQL, req.RenameFrom).Scan(&existsFrom)
		database.DB.Raw(checkSQL, req.RenameTo).Scan(&existsTo)

		if existsFrom == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Таблица '%s' не существует", req.RenameFrom)})
			return
		}
		if existsTo != 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Таблица '%s' уже существует", req.RenameTo)})
			return
		}

		sqlRename := fmt.Sprintf(`ALTER TABLE "%s" RENAME TO "%s";`, req.RenameFrom, req.RenameTo)
		if err := database.DB.Exec(sqlRename).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Rename error: %v", err)})
			return
		}
		for i, tbl := range req.Tables {
			if tbl.Name == req.RenameFrom {
				req.Tables[i].Name = req.RenameTo
			}
		}
	}

	logTables("AFTER RENAME")

	// НОВОЕ: перед миграцией дополнить схему служебными полями
	for i := range req.Tables {
		ensureAssetFields(&req.Tables[i])
	}

	// Миграции ТОЛЬКО здесь (по запросу)
	for _, table := range req.Tables {
		if err := migrateTable(table); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": fmt.Sprintf("Migration error for table '%s': %v", table.Name, err),
			})
			return
		}
	}

	logTables("AFTER MIGRATION")

	// Дроп таблиц, которых больше нет
	for _, oldTable := range currentSchema.Tables {
		oldName := oldTable.Name
		if oldName == req.RenameFrom && req.RenameFrom != "" {
			oldName = req.RenameTo
		}
		if !tableExists(req.Tables, oldName) {
			sqlDrop := fmt.Sprintf(`DROP TABLE IF EXISTS "%s" CASCADE;`, oldTable.Name)
			if err := database.DB.Exec(sqlDrop).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": fmt.Sprintf("Error dropping table '%s': %v", oldTable.Name, err),
				})
				return
			}
		}
	}

	logTables("END")

	// Сохраняем конфиг (уже с доб. полями)
	newSchema := models.Schema{Tables: req.Tables}
	if err := models.SaveSchema("config.json", newSchema); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "schema updated"})
}

func tableExists(tables []models.Table, name string) bool {
	for _, t := range tables {
		if t.Name == name {
			return true
		}
	}
	return false
}

// ===== миграция — вызывается ТОЛЬКО из PostSchema =====

func migrateTable(table models.Table) error {
	createSQL := fmt.Sprintf(`CREATE TABLE IF NOT EXISTS "%s" (id SERIAL PRIMARY KEY);`, table.Name)
	if err := database.DB.Exec(createSQL).Error; err != nil {
		return err
	}

	// текущие колонки (кроме id)
	var currentColumns []string
	columnsSQL := `
		SELECT column_name FROM information_schema.columns
		WHERE table_name = ? AND column_name != 'id';`
	if err := database.DB.Raw(columnsSQL, table.Name).Scan(&currentColumns).Error; err != nil {
		return err
	}

	// карта схемы
	schemaColumns := make(map[string]models.Field)
	for _, field := range table.Fields {
		schemaColumns[field.Name] = field
	}

	// удалить лишние
	for _, col := range currentColumns {
		if _, exists := schemaColumns[col]; !exists {
			dropColumnSQL := fmt.Sprintf(`ALTER TABLE "%s" DROP COLUMN "%s";`, table.Name, col)
			if err := database.DB.Exec(dropColumnSQL).Error; err != nil {
				return err
			}
		}
	}

	// добавить недостающие
	for _, field := range table.Fields {
		if field.Name == "id" {
			continue
		}
		var rows []map[string]interface{}
		checkSQL := `SELECT 1 FROM information_schema.columns WHERE table_name = ? AND column_name = ?;`
		if err := database.DB.Raw(checkSQL, table.Name, field.Name).Scan(&rows).Error; err != nil {
			return err
		}
		if len(rows) == 0 {
			colDef := fmt.Sprintf(`"%s" %s`, field.Name, mapFieldTypeToSQL(field.Type))
			if !field.Nullable {
				colDef += " NOT NULL"
			}
			if field.Default != "" {
				switch field.Type {
				case "int", "uint", "float", "bool":
					colDef += fmt.Sprintf(" DEFAULT %s", field.Default)
				default:
					colDef += fmt.Sprintf(" DEFAULT '%s'", field.Default)
				}
			}
			alterSQL := fmt.Sprintf(`ALTER TABLE "%s" ADD COLUMN %s;`, table.Name, colDef)
			if err := database.DB.Exec(alterSQL).Error; err != nil {
				return err
			}
		}
		// UNIQUE
		if field.Unique {
			uniqueSQL := fmt.Sprintf(`ALTER TABLE "%s" ADD UNIQUE ("%s");`, table.Name, field.Name)
			if err := database.DB.Exec(uniqueSQL).Error; err != nil {
				return err
			}
		}
	}

	// страховка на случай, если поле не оказалось в req.Tables (но мы уже добавили ensureAssetFields)
	ensureArray := func(col string) error {
		var rows []map[string]interface{}
		check := `SELECT 1 FROM information_schema.columns WHERE table_name = ? AND column_name = ?;`
		if err := database.DB.Raw(check, table.Name, col).Scan(&rows).Error; err != nil {
			return err
		}
		if len(rows) == 0 {
			sql := fmt.Sprintf(`ALTER TABLE "%s" ADD COLUMN "%s" TEXT[];`, table.Name, col)
			if err := database.DB.Exec(sql).Error; err != nil {
				return err
			}
		}
		return nil
	}
	if err := ensureArray("file_links"); err != nil {
		return err
	}
	if err := ensureArray("image_links"); err != nil {
		return err
	}

	// FK (если заданы)
	for _, field := range table.Fields {
		if field.ForeignKey == nil || field.ForeignKey.Table == "" || field.ForeignKey.Field == "" {
			continue
		}
		onDelete := field.ForeignKey.OnDelete
		if onDelete == "" {
			onDelete = "RESTRICT"
		}
		constraint := fmt.Sprintf(`fk_%s_%s__%s_%s`, table.Name, field.Name, field.ForeignKey.Table, field.ForeignKey.Field)

		drop := fmt.Sprintf(`ALTER TABLE "%s" DROP CONSTRAINT IF EXISTS "%s";`, table.Name, constraint)
		if err := database.DB.Exec(drop).Error; err != nil {
			return err
		}

		add := fmt.Sprintf(
			`ALTER TABLE "%s" ADD CONSTRAINT "%s" FOREIGN KEY ("%s") REFERENCES "%s"("%s") ON DELETE %s;`,
			table.Name, constraint, field.Name, field.ForeignKey.Table, field.ForeignKey.Field, onDelete,
		)
		if err := database.DB.Exec(add).Error; err != nil {
			return err
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
	case "text_array":
		return "TEXT[]"
	default:
		return "VARCHAR(255)"
	}
}

// DeleteTable как у тебя
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
