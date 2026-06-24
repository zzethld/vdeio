import shaka from 'shaka-player/dist/shaka-player.compiled';

type ShakaResponseFilter = shaka.extern.ResponseFilter;

interface InitOptions {
  videoEl: HTMLVideoElement;
  videoId: number;
  accessCode?: string;
  /** Optional response filter (used by the facade to inject AES keys). */
  onResponseFilter?: ShakaResponseFilter;
}

/**
 * Owns the `shaka.Player` lifecycle: polyfill install, browser-support check,
 * player creation/attach, streaming config, request/response filter
 * registration, manifest load, and destruction.
 *
 * The request filter attaches the device JWT and (for code-protected videos)
 * appends the access code to same-origin device video URLs. The response
 * filter (key injection) is supplied by the facade via `onResponseFilter`,
 * keeping this composable free of encryption-specific logic.
 */
export function useShakaPlayer() {
  let player: shaka.Player | null = null;

  /**
   * Resolves the manifest URI for a video: prefers a locally-synced file
   * (offline playback), falling back to the authenticated server playlist
   * endpoint. Online-only videos are never downloaded by the sync-service
   * (filtered in calculateSyncDiff), so they never have a localPath — no
   * explicit offlineAllowed check is needed here.
   */
  function resolveManifestUri(videoId: number, accessCode?: string): string {
    const localPath = localStorage.getItem(`video:localPath:${videoId}`);
    if (localPath) {
      return localPath;
    }
    // The server serves a rewritten m3u8 directly from the playlist endpoint
    // (segment paths point back to authenticated server routes), so we can
    // load it as a relative URL without going to MinIO.
    const params = accessCode ? `?code=${encodeURIComponent(accessCode)}` : '';
    return `/api/v1/devices/videos/${videoId}/playlist${params}`;
  }

  async function init(opts: InitOptions): Promise<void> {
    // Install polyfills
    shaka.polyfill.installAll();

    if (!shaka.Player.isBrowserSupported()) {
      throw new Error('浏览器不支持 Shaka Player');
    }

    // Create player
    player = new shaka.Player();
    await player.attach(opts.videoEl);

    // Configure streaming
    player.configure({
      streaming: {
        bufferingGoal: 30,
        rebufferingGoal: 2,
        bufferBehind: 30,
      },
    });

    // Register request filter to attach JWT on all server-side HLS requests
    // (playlist + segments). The axios request interceptor only covers axios
    // calls; Shaka performs its own HLS fetches and would otherwise hit the
    // server without auth and get 401. For code-protected videos the same
    // access code is also appended to every playlist/key/segment request.
    player.getNetworkingEngine()?.registerRequestFilter((_type, shakaRequest) => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        shakaRequest.headers = {
          ...shakaRequest.headers,
          Authorization: `Bearer ${token}`,
        };
      }

      if (opts.accessCode && shakaRequest.uris && shakaRequest.uris[0]) {
        const uri = shakaRequest.uris[0];
        // Only rewrite same-origin device video URLs.
        if (uri.startsWith('/api/v1/devices/videos/')) {
          const url = new URL(uri, window.location.origin);
          url.searchParams.set('code', opts.accessCode);
          shakaRequest.uris[0] = url.pathname + url.search;
        }
      }
    });

    if (opts.onResponseFilter) {
      player.getNetworkingEngine()?.registerResponseFilter(opts.onResponseFilter);
    }

    // Load the stream
    await player.load(resolveManifestUri(opts.videoId, opts.accessCode));
  }

  async function destroy(): Promise<void> {
    if (player) {
      try {
        await player.destroy();
      } catch {
        // Ignore destroy errors
      }
      player = null;
    }
  }

  return {
    init,
    destroy,
    resolveManifestUri,
  };
}
