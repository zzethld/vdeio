/**
 * Encryption service barrel.
 *
 * Public API surface for video encryption (AES-128 HLS) and key management
 * (AES-256-CBC master-key wrapping). Callers should import from
 * '@/services/encryption' (or './encryption' relative) rather than reaching
 * into the individual modules.
 *
 * Re-exported symbols (no name collisions between the two modules):
 *   - encryptVideo, processQueue, addToQueue, ProcessQueueOptions  (encryption.ts)
 *   - generateEncryptionKey, storeKey, getKeyForVideo, encryptKey, decryptKey, KeyData (key-manager.ts)
 */
export {
  encryptVideo,
  processQueue,
  addToQueue,
} from './encryption';
export type { ProcessQueueOptions } from './encryption';

export {
  generateEncryptionKey,
  storeKey,
  getKeyForVideo,
  encryptKey,
  decryptKey,
} from './key-manager';
export type { KeyData } from './key-manager';
