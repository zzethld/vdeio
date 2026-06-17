import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.MASTER_KEY = 'test-master-key-16b';

vi.mock('../../models', () => ({
  VideoKeyModel: {
    create: vi.fn(),
    findOne: vi.fn(),
  },
}));

import {
  generateEncryptionKey,
  encryptKey,
  decryptKey,
  storeKey,
  getKeyForVideo,
} from '../../services/encryption/key-manager';
import { VideoKeyModel } from '../../models';

describe('Key Manager Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateEncryptionKey', () => {
    it('should return a 16-byte key and valid iv', () => {
      const keyData = generateEncryptionKey();
      expect(keyData.key).toBeInstanceOf(Buffer);
      expect(keyData.key.length).toBe(16);
      expect(keyData.iv).toMatch(/^[0-9a-f]{32}$/);
      expect(keyData.keyId).toBeTruthy();
    });
  });

  describe('encryptKey / decryptKey', () => {
    it('should roundtrip encrypt and decrypt', () => {
      const original = Buffer.from('my-16-byte-key!!');
      const iv = 'aabbccddeeff00112233445566778899';
      const encrypted = encryptKey(original, iv);
      expect(typeof encrypted).toBe('string');
      expect(encrypted.length).toBeGreaterThan(0);

      const decrypted = decryptKey(encrypted, iv);
      expect(decrypted.toString()).toBe(original.toString());
    });

    it('should fail decryption with wrong master key', async () => {
      const original = Buffer.from('my-16-byte-key!!');
      const iv = 'aabbccddeeff00112233445566778899';
      const encrypted = encryptKey(original, iv);

      // Change master key and re-import module
      process.env.MASTER_KEY = 'wrong-master-key-32bytes!!!';
      vi.resetModules();
      const { decryptKey: decryptKeyWrong } = await import('../../services/encryption/key-manager');

      expect(() => decryptKeyWrong(encrypted, iv)).toThrow();
    });
  });

  describe('storeKey', () => {
    it('should create a VideoKey record', async () => {
      (VideoKeyModel.create as any).mockResolvedValue(true);
      const keyData = generateEncryptionKey();
      await storeKey(1, keyData);

      expect(VideoKeyModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          videoId: 1,
          keyId: keyData.keyId,
          iv: keyData.iv,
          status: 'active',
        })
      );
    });
  });

  describe('getKeyForVideo', () => {
    it('should return decrypted key for active video', async () => {
      const keyData = generateEncryptionKey();
      const encryptedKey = encryptKey(keyData.key, keyData.iv);
      (VideoKeyModel.findOne as any).mockResolvedValue({
        encryptedKey,
        iv: keyData.iv,
      });

      const result = await getKeyForVideo(1);

      expect(result).not.toBeNull();
      expect(result!.key.toString()).toBe(keyData.key.toString());
      expect(result!.iv).toBe(keyData.iv);
    });

    it('should return null when no active key found', async () => {
      (VideoKeyModel.findOne as any).mockResolvedValue(null);
      const result = await getKeyForVideo(1);
      expect(result).toBeNull();
    });
  });
});
