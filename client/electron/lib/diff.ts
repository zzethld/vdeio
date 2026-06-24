import { URL } from 'url';

// --- Types ---

export interface SyncDiff {
  downloads: VideoDownload[];
  deletes: VideoDelete[];
}

export interface VideoDownload {
  videoId: number;
  title: string;
  fileSize: number;
  campaignId: number;
  playlistUrl: string;
  accessMode: 'open' | 'campaign' | 'code';
  offlineAllowed: boolean;
  keyTtlHours: number;
}

export interface VideoDelete {
  videoId: number;
}

// --- Pure diff logic ---
// Given local cached video IDs and server's playlist, compute what to download
// and what to delete. Extracted as a pure function for testability.
export function calculateDiff(
  localIds: number[],
  serverVideos: VideoDownload[],
): SyncDiff {
  const localSet = new Set(localIds);
  const seen = new Set<number>();
  const downloads: VideoDownload[] = [];

  for (const video of serverVideos) {
    if (!localSet.has(video.videoId) && !seen.has(video.videoId)) {
      seen.add(video.videoId);
      downloads.push(video);
    }
  }

  const serverSet = new Set(serverVideos.map((v) => v.videoId));
  const deletes = localIds
    .filter((id) => !serverSet.has(id))
    .map((id) => ({ videoId: id }));

  return { downloads, deletes };
}

// --- M3U8 utilities (pure functions) ---

export function parseM3U8(m3u8Text: string, baseUrl: string): string[] {
  const lines = m3u8Text.split('\n');
  const segments: string[] = [];
  const parsedBase = new URL(baseUrl);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      segments.push(trimmed);
    } else {
      const resolved = new URL(trimmed, parsedBase.href);
      segments.push(resolved.href);
    }
  }
  return segments;
}

/**
 * Parse every `#EXTINF:<duration>` value (in seconds) from an HLS playlist.
 * Returns an empty array when no durations can be parsed, so callers can fall
 * back to a sensible default instead of guessing.
 */
function parseExtInfDurations(m3u8Text: string): number[] {
  const durations: number[] = [];
  const regex = /#EXTINF:([0-9]+(?:\.[0-9]+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(m3u8Text)) !== null) {
    const value = parseFloat(match[1]);
    if (!Number.isNaN(value) && value > 0) durations.push(value);
  }
  return durations;
}

export function createLocalM3U8(
  segmentCount: number,
  ivHex?: string | null,
  sourceM3u8?: string,
): string {
  // Parse per-segment #EXTINF durations from the source playlist (when provided)
  // so the local playlist advertises an accurate #EXT-X-TARGETDURATION — RFC 8216
  // requires it to be >= the longest segment duration. Fall back to 10s per segment
  // when the source is unavailable or has no parseable EXTINF lines.
  const durations = sourceM3u8 ? parseExtInfDurations(sourceM3u8) : [];
  const targetDuration =
    durations.length > 0 ? Math.max(1, Math.ceil(Math.max(...durations))) : 10;

  let m3u8 = '#EXTM3U\n';
  m3u8 += '#EXT-X-VERSION:3\n';
  m3u8 += `#EXT-X-TARGETDURATION:${targetDuration}\n`;
  m3u8 += '#EXT-X-MEDIA-SEQUENCE:0\n';
  // When an IV is known, declare it explicitly so the player decrypts with the same
  // IV FFmpeg used to encrypt the segments. When unknown, omit the IV attribute so the
  // player falls back to the media-sequence-number IV per RFC 8216 — never hardcode zero,
  // that would mis-decrypt segments encrypted with a real random IV.
  const keyLine = ivHex
    ? `#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x${ivHex}\n`
    : '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n';
  m3u8 += keyLine;

  for (let i = 0; i < segmentCount; i++) {
    const duration = i < durations.length ? durations[i] : 10;
    m3u8 += `#EXTINF:${duration.toFixed(1)},\n`;
    m3u8 += `seg_${String(i).padStart(3, '0')}.ts\n`;
  }

  m3u8 += '#EXT-X-ENDLIST\n';
  return m3u8;
}

/**
 * Extract the AES-128 initialization vector from a server-generated HLS playlist.
 *
 * FFmpeg writes the per-video IV into the m3u8 as
 * `#EXT-X-KEY:METHOD=AES-128,URI="...",IV=0x<hex>` whenever the key_info file's
 * third line is present (which key-manager always provides). Returns the hex
 * string WITHOUT the `0x` prefix, or null when the playlist omits the IV (in
 * which case the player must use the media sequence number as IV per RFC 8216).
 */
export function extractIv(m3u8Text: string): string | null {
  const match = m3u8Text.match(/#EXT-X-KEY:[^\n]*IV=0x([0-9a-fA-F]+)/);
  return match ? match[1].toLowerCase() : null;
}
