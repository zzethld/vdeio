import * as Minio from 'minio';
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

/**
 * Ensure a bucket exists, creating it if missing.
 *
 * Callers invoke the underlying `minioClient.*` methods directly; the previous
 * `presignedGetUrl` / `putObject` / `removeObject` / `bucketExists` wrappers
 * were unreferenced and were removed in the S11 dead-code pass.
 */
export async function ensureBucket(bucket: string): Promise<void> {
  const exists = await minioClient.bucketExists(bucket).catch(() => false);
  if (!exists) {
    await minioClient.makeBucket(bucket, 'us-east-1');
  }
}
