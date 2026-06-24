/**
 * Centralized application constants.
 *
 * This file is the single source of truth for hardcoded TTLs, scheduler
 * intervals, pagination defaults, and other "magic numbers" that were
 * previously scattered across `utils/jwt.ts`, `routes/auth.ts`,
 * `services/campaign.ts`, `services/device-monitor.ts`, and `app.ts`.
 *
 * Env-driven values (e.g. `process.env.JWT_SECRET`) are intentionally NOT
 * centralized here — those remain at their call sites.
 *
 * EXCEPTION: `isSqliteDev` (below) is centralized because the SQLite dev-mode
 * flag gates branching across many modules (app.ts, routes/device.ts,
 * services/device-monitor.ts, config/redis.ts) and a single source of truth
 * keeps the dev-mode contract consistent.
 *
 * NOTE: Numeric values were transcribed verbatim from the pre-existing code;
 * centralizing their location must not change any runtime behaviour.
 */

// ─── Dev-mode flag ────────────────────────────────────────────────────────────
/**
 * True when the server runs against the zero-infra in-memory SQLite backend
 * (`DB_DIALECT=sqlite`). Modules branch on this to skip MySQL-only side
 * effects (e.g. EMQX `mqtt_user` inserts, MQTT subscriber startup) and to
 * auto-enable the Redis mock. Import this instead of reading
 * `process.env.DB_DIALECT` directly so the dev-mode contract has one source.
 *
 * Captured once at module load; tests that flip `process.env.DB_DIALECT`
 * per-case should re-import via `vi.resetModules()` if they need a fresh value.
 */
export const isSqliteDev = process.env.DB_DIALECT === 'sqlite';

// ─── JWT TTLs (seconds) ───────────────────────────────────────────────────────
/** Access token lifetime: 2 hours = 7200 seconds. */
export const JWT_ACCESS_TTL_SECONDS = 7200;
/** Refresh token lifetime: 7 days = 604800 seconds. */
export const JWT_REFRESH_TTL_SECONDS = 604800;

// ─── Auth / Redis TTLs (seconds) ──────────────────────────────────────────────
/** DingTalk OAuth state entry TTL in Redis: 5 minutes = 300 seconds. */
export const DINGTALK_STATE_TTL_SECONDS = 300;

// ─── Pagination defaults ──────────────────────────────────────────────────────
/** Default page size for list endpoints. */
export const DEFAULT_PAGE_SIZE = 20;
/** Upper bound for page size when callers can override the default. */
export const MAX_PAGE_SIZE = 100;

// ─── Admin roles ──────────────────────────────────────────────────────────────
/**
 * Roles that satisfy `adminAuthMiddleware` (i.e. may access `/admin/*` routes).
 * Must stay in sync with the `Admin.role` enum in `models/admin.ts`.
 *
 * `admin`     — standard operator-facing administrator.
 * `super_admin` — seeded root account; same route access as `admin`.
 */
export const ADMIN_ROLES = ['admin', 'super_admin'] as const;
/** Union of all admin-level roles (mirrors `Admin.role`). */
export type AdminRole = (typeof ADMIN_ROLES)[number];

// ─── Campaign status ──────────────────────────────────────────────────────────
/** Initial / editable status for a campaign. */
export const CAMPAIGN_DRAFT_STATUS = 'draft' as const;

// ─── Device telemetry ─────────────────────────────────────────────────────────
/** Maximum number of telemetry rows returned by `getDeviceTelemetry`. */
export const TELEMETRY_HISTORY_MAX_LIMIT = 500;

// ─── Scheduler intervals (milliseconds) ───────────────────────────────────────
/**
 * Background-loop intervals started by `startServer()` in `app.ts`.
 * Values are kept identical to the originals — `as const` makes the keys
 * readonly for safe indexing.
 */
export const SCHEDULER_INTERVAL_MS = {
  /** Campaign-expiry scan: every 60 seconds. */
  campaignExpiry: 60_000,
  /** Device-alert scan: every 10 minutes (consumed by `services/alert.ts`). */
  alertScan: 10 * 60 * 1000,
  /** Encryption-queue worker: every 5 minutes. */
  encryptionQueue: 5 * 60 * 1000,
} as const;
