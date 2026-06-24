import dotenv from 'dotenv';

dotenv.config();

/**
 * Lightweight config facade.
 *
 * Most subsystems read their env vars directly at the call site (see
 * `config/database.ts`, `config/redis.ts`, `config/minio.ts`, `utils/jwt.ts`).
 * Only values consumed by multiple modules via the `config` object belong here.
 *
 * The previously-present `db`, `redis`, `minio`, `jwt`, `server`, and
 * `security` blocks were dead — no production code read them — and were
 * removed in the S11 dead-code pass. Do not re-add them; centralize env reads
 * in `config/constants.ts` instead.
 */
export const config = {
  // MQTT — used by `services/mqtt-publisher.ts` and `services/device-monitor.ts`
  mqtt: {
    brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    username: process.env.MQTT_USERNAME || '',
    password: process.env.MQTT_PASSWORD || '',
  },
};

export { sequelize } from './database';
export { redis, setWithExpiry } from './redis';
export { minioClient } from './minio';
