import request from '@/utils/request';

interface CachedKey {
  key: string; // base64
  timestamp: number;
}

/**
 * Fetches and caches AES-128 HLS encryption keys with a per-video TTL.
 *
 * The per-video key TTL travels via the `X-Key-TTL` response header on the
 * `/key` endpoint (the playlist endpoint serves raw m3u8). Each successful
 * fetch updates the closure-scoped `currentKeyTtlHours` so subsequent cache
 * checks and fetches use the correct value.
 *
 * For code-protected videos the key is never cached locally — each play
 * requires re-entering the access code, so the key is fetched with per-request
 * authorization.
 */
export function useEncryptionKey() {
  // Closure-scoped TTL (was previously module-level). Default 7 days.
  let currentKeyTtlHours = 168;

  function getKeyCacheKey(videoId: number): string {
    return `video:key:${videoId}`;
  }

  function getCachedKey(videoId: number, ttlHours: number): string | null {
    if (ttlHours <= 0) return null;
    const raw = localStorage.getItem(getKeyCacheKey(videoId));
    if (!raw) return null;
    try {
      const cached: CachedKey = JSON.parse(raw);
      if (Date.now() - cached.timestamp > ttlHours * 3600 * 1000) {
        localStorage.removeItem(getKeyCacheKey(videoId));
        return null;
      }
      return cached.key;
    } catch {
      return null;
    }
  }

  function setCachedKey(videoId: number, keyBase64: string, ttlHours: number): void {
    if (ttlHours <= 0) return;
    const cached: CachedKey = { key: keyBase64, timestamp: Date.now() };
    localStorage.setItem(getKeyCacheKey(videoId), JSON.stringify(cached));
  }

  function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Fetch the AES key for a video. When no `accessCode` is given, a non-expired
   * cached key is reused; otherwise the key is always re-fetched and not
   * cached.
   */
  async function fetchEncryptionKey(
    videoId: number,
    accessCode?: string,
  ): Promise<ArrayBuffer> {
    // For code-protected videos the key must not be cached beyond the current
    // playback session; each play requires re-entering the code.
    if (!accessCode) {
      const cached = getCachedKey(videoId, currentKeyTtlHours);
      if (cached) {
        return base64ToArrayBuffer(cached);
      }
    }

    const config: Record<string, unknown> = { responseType: 'arraybuffer' };
    if (accessCode) {
      config.params = { code: accessCode };
    }

    // Fetch from server
    const res = await request.get(`/devices/videos/${videoId}/key`, config);
    const keyBuffer = res.data as ArrayBuffer;
    // The playlist endpoint now serves m3u8 content (not JSON), so the
    // per-video keyTtlHours travels via the X-Key-TTL response header on
    // the /key endpoint. Update the closure TTL so subsequent key requests
    // and cache checks use the correct per-video value.
    const ttl = parseInt(String(res.headers?.['x-key-ttl'] ?? '168'), 10);
    currentKeyTtlHours = ttl;
    if (!accessCode) {
      setCachedKey(videoId, arrayBufferToBase64(keyBuffer), ttl);
    }
    return keyBuffer;
  }

  return {
    fetchEncryptionKey,
  };
}
