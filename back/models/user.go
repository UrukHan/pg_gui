package models

import (
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type UserPermission string

const (
	PermReadOwn     UserPermission = "read_own"
	PermReadAll     UserPermission = "read_all"
	PermReadWriteAll UserPermission = "read_write_all"
)

type UserRole string

const (
	RoleAdmin UserRole = "admin"
	RoleUser  UserRole = "user"
)

type User struct {
	ID               uint           `gorm:"primaryKey" json:"id"`
	FirstName        string         `gorm:"size:100;not null" json:"first_name"`
	LastName         string         `gorm:"size:100;not null" json:"last_name"`
	Position         string         `gorm:"size:200" json:"position"`
	Login            string         `gorm:"size:100;uniqueIndex;not null" json:"login"`
	PasswordHash     string         `gorm:"size:255;not null" json:"-"`
	Role             UserRole       `gorm:"size:20;not null;default:user" json:"role"`
	Permission       UserPermission `gorm:"size:30;not null;default:read_own" json:"permission"`
	InstrumentAccess bool           `gorm:"not null;default:false" json:"instrument_access"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
	DeletedAt        gorm.DeletedAt `gorm:"index" json:"-"`
}

func (u *User) SetPassword(password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	u.PasswordHash = string(hash)
	return nil
}

func (u *User) CheckPassword(password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)) == nil
}
