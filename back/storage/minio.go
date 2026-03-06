package storage

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

var (
	Client *minio.Client
	Bucket string
)

func Init() {
	endpoint := os.Getenv("MINIO_ENDPOINT")
	if endpoint == "" {
		log.Println("[MinIO] MINIO_ENDPOINT not set, video storage disabled")
		return
	}
	accessKey := os.Getenv("MINIO_ACCESS_KEY")
	secretKey := os.Getenv("MINIO_SECRET_KEY")
	Bucket = os.Getenv("MINIO_BUCKET")
	if Bucket == "" {
		Bucket = "experiments"
	}

	var err error
	Client, err = minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: false,
	})
	if err != nil {
		log.Printf("[MinIO] connection error: %v", err)
		Client = nil
		return
	}

	ctx := context.Background()
	exists, err := Client.BucketExists(ctx, Bucket)
	if err != nil {
		log.Printf("[MinIO] bucket check error: %v", err)
		Client = nil
		return
	}
	if !exists {
		if err := Client.MakeBucket(ctx, Bucket, minio.MakeBucketOptions{}); err != nil {
			log.Printf("[MinIO] create bucket error: %v", err)
			Client = nil
			return
		}
	}
	log.Printf("[MinIO] connected, bucket=%s", Bucket)
}

func Enabled() bool {
	return Client != nil
}

func UploadFile(objectName, filePath, contentType string) error {
	if Client == nil {
		return fmt.Errorf("minio not initialized")
	}
	_, err := Client.FPutObject(context.Background(), Bucket, objectName, filePath, minio.PutObjectOptions{
		ContentType: contentType,
	})
	return err
}

func GetObject(objectName string) (io.ReadCloser, int64, string, error) {
	if Client == nil {
		return nil, 0, "", fmt.Errorf("minio not initialized")
	}
	obj, err := Client.GetObject(context.Background(), Bucket, objectName, minio.GetObjectOptions{})
	if err != nil {
		return nil, 0, "", err
	}
	info, err := obj.Stat()
	if err != nil {
		obj.Close()
		return nil, 0, "", err
	}
	return obj, info.Size, info.ContentType, nil
}
