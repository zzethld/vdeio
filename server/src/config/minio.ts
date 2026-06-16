import * as Minio from 'minio';
import { Readable } from 'stream';
import dotenv from 'dotenv';

dotenv.config();

const minioEndpoint = process.env.MINIO_ENDPOINT || 'localhost';
const minioPort = parseInt(process.env.MINIO_PORT || '9000', 10);
const minioAccessKey = process.env.MINIO_ROOT_USER || 'admin';
const minioSecretKey = process.env.MINIO_ROOT_PASSWORD || 'vdeio_minio_2024';

export const minioClient = new Minio.Client({
  endPoint: minioEndpoint,
  port: minioPort,
  useSSL: false,
  accessKey: minioAccessKey,
  secretKey: minioSecretKey,
});

export async function presignedGetUrl(
  bucket: string,
  key: string,
  expirySeconds: number
): Promise<string> {
  return minioClient.presignedGetObject(bucket, key, expirySeconds);
}

export async function putObject(
  bucket: string,
  key: string,
  stream: Readable,
  metadata?: object
) {
  const result = await minioClient.putObject(bucket, key, stream, undefined, metadata);
  return result;
}

export async function removeObject(
  bucket: string,
  key: string
): Promise<void> {
  await minioClient.removeObject(bucket, key);
}

export async function bucketExists(bucket: string): Promise<boolean> {
  return minioClient.bucketExists(bucket);
}

export async function ensureBucket(bucket: string): Promise<void> {
  const exists = await minioClient.bucketExists(bucket).catch(() => false);
  if (!exists) {
    await minioClient.makeBucket(bucket, 'us-east-1');
  }
}
