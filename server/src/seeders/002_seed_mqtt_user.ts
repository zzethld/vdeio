import crypto from 'crypto';
import { sequelize } from '../config/database';

/**
 * Seed the mqtt_user table with the server MQTT credentials.
 *
 * EMQX MySQL auth (sha256, salt_position: suffix) expects:
 *   password_hash = sha256( password + salt )   (hex-encoded)
 */
export async function seedMqttUser(): Promise<void> {
  try {
    const username = process.env.MQTT_USERNAME || 'vdeio-server';
    const password = process.env.MQTT_PASSWORD || '';

    if (!password) {
      console.warn('MQTT_PASSWORD not set, skipping mqtt_user seed.');
      return;
    }

    // Generate a random 8-byte hex salt
    const salt = crypto.randomBytes(8).toString('hex');

    // EMQX suffix-salt sha256: hash = sha256(password + salt)
    const passwordHash = crypto
      .createHash('sha256')
      .update(password + salt)
      .digest('hex');

    // Upsert: insert new row or update password_hash + salt if username exists
    await sequelize.query(
      `INSERT INTO mqtt_user (username, password_hash, salt, is_superuser)
       VALUES (:username, :passwordHash, :salt, 1)
       ON DUPLICATE KEY UPDATE
         password_hash = VALUES(password_hash),
         salt = VALUES(salt),
         is_superuser = VALUES(is_superuser)`,
      {
        replacements: { username, passwordHash, salt },
      },
    );

    console.log(`MQTT user seeded: ${username}`);
  } catch (error) {
    console.error('MQTT user seed failed:', error);
    process.exit(1);
  }
}
