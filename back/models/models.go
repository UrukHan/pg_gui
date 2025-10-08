package models

import (
	"encoding/json"
	"io/ioutil"
)

type ForeignKey struct {
	Table    string `json:"table"`
	Field    string `json:"field"`
	OnDelete string `json:"onDelete"` // RESTRICT | CASCADE | SET NULL
}

type Field struct {
	Name       string      `json:"name"`
	Type       string      `json:"type"`
	PrimaryKey bool        `json:"primaryKey,omitempty"`
	Nullable   bool        `json:"nullable,omitempty"`
	Default    string      `json:"default,omitempty"`
	Unique     bool        `json:"unique,omitempty"`
	ForeignKey *ForeignKey `json:"foreignKey,omitempty"`
}

type Table struct {
	Name   string  `json:"name"`
	Fields []Field `json:"fields"`
}

type Schema struct {
	Tables []Table `json:"tables"`
}

func LoadSchema(path string) (Schema, error) {
	data, err := ioutil.ReadFile(path)
	if err != nil {
		return Schema{}, err
	}
	var schema Schema
	err = json.Unmarshal(data, &schema)
	return schema, err
}

func SaveSchema(path string, schema Schema) error {
	data, err := json.MarshalIndent(schema, "", "  ")
	if err != nil {
		return err
	}
	return ioutil.WriteFile(path, data, 0644)
}
