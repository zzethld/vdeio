import crypto from 'crypto';
import { VideoKeyModel } from '../../models';

const MASTER_KEY = process.env.MASTER_KEY || 'dev_master_key_32_bytes_pad_here!!';

// Pad or hash MASTER_KEY to exactly 32 bytes for AES-256
function getMasterKeyBuffer(): Buffer {
  return crypto.createHash('sha256').update(MASTER_KEY).digest();
}

export interface KeyData {
  key: Buffer;      // 16-byte AES-128 key
  iv: string;       // hex string
  keyId: string;    // uuid
}

export function generateEncryptionKey(): KeyData {
  return {
    key: crypto.randomBytes(16),
    iv: crypto.randomBytes(16).toString('hex'),
    keyId: crypto.randomUUID(),
  };
}

export function encryptKey(key: Buffer, iv: string): string {
  const masterKey = getMasterKeyBuffer();
  const ivBuffer = Buffer.from(iv, 'hex').subarray(0, 16);
  const cipher = crypto.createCipheriv('aes-256-cbc', masterKey, ivBuffer);
  return cipher.update(key).toString('hex') + cipher.final().toString('hex');
}

export function decryptKey(encryptedKey: string, iv: string): Buffer {
  const masterKey = getMasterKeyBuffer();
  const ivBuffer = Buffer.from(iv, 'hex').subarray(0, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', masterKey, ivBuffer);
  return Buffer.concat([decipher.update(Buffer.from(encryptedKey, 'hex')), decipher.final()]);
}

export async function storeKey(videoId: number, keyData: KeyData): Promise<void> {
  const encryptedKey = encryptKey(keyData.key, keyData.iv);
  await VideoKeyModel.create({
    videoId,
    keyId: keyData.keyId,
    encryptedKey,
    iv: keyData.iv,
    status: 'active',
  });
}

export async function getKeyForVideo(videoId: number): Promise<{ key: Buffer; iv: string } | null> {
  const record = await VideoKeyModel.findOne({ where: { videoId, status: 'active' } });
  if (!record) return null;
  return {
    key: decryptKey(record.encryptedKey!, record.iv!),
    iv: record.iv!,
  };
}
