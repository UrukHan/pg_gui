package main

import (
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"back/controllers"
	"back/database"
)

func main() {
	database.Init()

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins: []string{"http://localhost:3000"},
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE"},
		AllowHeaders: []string{"Origin", "Content-Type"},
	}))

	r.GET("/schema", controllers.GetSchema)
    r.POST("/schema", controllers.PostSchema)

    r.GET("/schema/:tableName", controllers.GetTableData)
    r.POST("/schema/:tableName", controllers.CreateTableRow)
    r.PUT("/schema/:tableName/:id", controllers.UpdateTableRow)
    r.DELETE("/schema/:tableName/:id", controllers.DeleteTableRow)

    r.DELETE("/schema/:tableName", controllers.DeleteTable)

	r.Run(":8080")
}
