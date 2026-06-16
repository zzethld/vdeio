import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Database
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    name: process.env.DB_NAME || 'vdeio',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },

  // MinIO
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    rootUser: process.env.MINIO_ROOT_USER || 'admin',
    rootPassword: process.env.MINIO_ROOT_PASSWORD || 'vdeio_minio_2024',
    useSSL: false,
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_jwt_refresh_secret_change_in_production',
    accessExpiry: '2h',
    refreshExpiry: '7d',
    algorithm: 'HS512' as const,
  },

  // Server
  server: {
    port: parseInt(process.env.SERVER_PORT || '3000', 10),
    env: process.env.NODE_ENV || 'development',
  },

  // Security
  security: {
    masterKey: process.env.MASTER_KEY || 'dev_master_key_32_bytes_pad_here!!',
  },

  // MQTT
  mqtt: {
    brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    username: process.env.MQTT_USERNAME || '',
    password: process.env.MQTT_PASSWORD || '',
  },
};

export { sequelize } from './database';
export { redis, setWithExpiry, get, deleteKey, addToSet, isMemberOfSet } from './redis';
export {
  minioClient,
  presignedGetUrl,
  putObject,
  removeObject,
  bucketExists,
} from './minio';
