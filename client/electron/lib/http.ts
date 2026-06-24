import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  responseType?: 'text' | 'buffer';
  maxRedirects?: number;
}

/**
 * Low-level HTTP request wrapper that follows 301/302 redirects, rejects on
 * HTTP >= 400 (with a snippet of the error body), and resolves with the full
 * response as a Buffer. Uses a 120s timeout. Self-recursive for redirects
 * (previously a private method on SyncService that recursed via `this`).
 */
export function httpRequest(
  url: string,
  options: HttpRequestOptions = {},
): Promise<Buffer> {
  const { method = 'GET', headers = {}, body, maxRedirects = 5 } = options;

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? https : http;

    const reqOptions: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers,
      rejectUnauthorized: true,
    };

    const req = lib.request(reqOptions, (res) => {
      // Handle redirects
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && maxRedirects > 0) {
        httpRequest(res.headers.location, { ...options, maxRedirects: maxRedirects - 1 })
          .then(resolve)
          .catch(reject);
        return;
      }

      if (res.statusCode && res.statusCode >= 400) {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const errBody = Buffer.concat(chunks).toString('utf-8');
          reject(new Error(`HTTP ${res.statusCode}: ${errBody.substring(0, 200)}`));
        });
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });

    req.on('error', reject);
    req.setTimeout(120000, () => {
      req.destroy(new Error('Request timeout'));
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}
