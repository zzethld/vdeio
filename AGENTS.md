# AGENTS.md — vdeio

Chain-store encrypted video distribution platform (连锁门店视频管理系统). Admins upload
videos → server encrypts as AES-128 HLS → campaigns target stores → in-store Windows
Electron client syncs/plays offline and reports telemetry over MQTT.

## Workspace layout

Monorepo of **three independent npm packages** — no workspace tooling, `npm install`
separately in each. There is no top-level package.json.

| Dir | Stack | Role |
|-----|-------|------|
| `server/` | Node + Express + TS + Sequelize/MySQL | REST API on `:3000`, entry `src/app.ts` (**not** `index.ts`) |
| `admin/` | Vue3 + Element Plus + Pinia + ECharts | Operator browser SPA on `:5173` |
| `client/` | Vue3 + Electron + Shaka Player | In-store Windows player on `:5174` |
| `deploy/` | Docker Compose | Infra (MySQL, Redis, MinIO, EMQX) + installers |
| `e2e/` | PowerShell | Flow tests against a live server |
| `docs/` | Markdown | **Authoritative** design/deploy/ops docs |

**vdeio is a standalone project.** It currently has **no git repo of its own** — the
surrounding `D:\work` is an *unrelated* repository (`aiUser` remote), and vdeio's files are
untracked there. Running git inside `vdeio/` therefore acts on the wrong repo. Do **not**
commit vdeio files into `D:\work`; `git init` inside `vdeio/` if you need version control.
The unrelated `D:\work\AGENTS.md` does **not** apply to vdeio — this file is authoritative.

## Common dev commands

### Server — zero-infra local dev (recommended starting point)
```powershell
cd server; npm install
$env:DB_DIALECT='sqlite'   # in-memory SQLite + auto Redis mock + auto-seeded admin/admin123
npm run dev                # ts-node-dev with hot reload
```
No DingTalk credentials? Hit the dev mock login: `POST /api/v1/auth/mock-login`.

### Full stack (with infra containers)
```powershell
cd deploy; docker compose up -d   # MySQL:3306 Redis:6379 MinIO:9000/9001 EMQX:1883/8083/18083
cd ..\server; npm install; npm run dev   # reads .env (copy .env.example first)
cd ..\admin;  npm install; npm run dev   # http://localhost:5173
cd ..\client; npm install; npm run dev   # http://localhost:5174 (browser/mock device)
```

### Build / test
```powershell
# server
npm run build      # tsc -> dist/
npm run migrate    # apply SQL migrations (prod)
npm run seed       # seed DB
npm test           # vitest run (~289 tests); npm run test:watch to watch

# admin / client
npm run build      # vue-tsc + vite build
npm test           # vitest (client)
```

### Client as a real Electron app
```powershell
cd client
npm run electron:dev     # Electron + Vite together (NOT `npm run dev`, which is browser-only)
npm run electron:build   # Windows NSIS installer -> release/
```

## E2E tests (PowerShell)
```powershell
powershell -ExecutionPolicy Bypass -File .\e2e\video-upload-flow.ps1 -WhatIf   # dry-run, prints steps
powershell -ExecutionPolicy Bypass -File .\e2e\video-upload-flow.ps1           # live HTTP
```
Requires server on `:3000` + Docker infra running. Default admin `admin`/`admin123`.
Override URL: `$env:VDEIO_BASE_URL='http://host:3000/api/v1'`. Five flow scripts share
`e2e/common.ps1` (`Invoke-ApiCall` is a real `Invoke-WebRequest` wrapper). Note: the e2e
README's "skeleton scripts" disclaimer is stale — these scripts execute real calls.

## Architectural facts agents get wrong

- **Server entry is `src/app.ts`.** `src/server.ts` is a thin alternative. `startServer()`
  boots Express **and** these background loops: campaign-expiry (60s), alert scan (10min),
  encryption queue (5min + startup burst, retry≤3), MQTT telemetry subscriber. Removing a
  scheduler here silently breaks device state and dashboards.
- **Two auth planes.** Admin = username/password (bcrypt, 5-fail → 15-min lock). Operator =
  DingTalk QR OAuth. Both issue JWT HS512 (access 2h / refresh 7d); logout and refresh
  rotation push tokens onto a **Redis blacklist** (`jwt:blacklist:<token>`).
- **Authorization chain:** `authMiddleware` (JWT + blacklist) → optional `adminAuthMiddleware`
  (requires `role === 'admin'`). Device/operator routes use the former; `/admin/*` uses both.
- **Express body limit is 100mb** — video chunks upload as large JSON/octet payloads. Do not
  "tighten" this.
- **13 Sequelize models** (`server/src/models/index.ts`): User, Store, UserStoreBinding,
  Device, DeviceTelemetry, Video, VideoKey, Campaign, CampaignVideo, CampaignStore, Category,
  PlayLog, Admin. `Video` uses paranoid soft-delete; `VideoKey` is 1:1 with `Video`.
- **Client renderer uses `createWebHashHistory`** (Electron `file://`); admin uses
  `createWebHistory`. Do not switch one to match the other.
- **Client's real engine lives in `client/electron/`, not `src/`:** `sync-service.ts`
  (HLS diff/download/decrypt/LRU eviction), `mqtt-bridge.ts` (telemetry + remote commands),
  `preload.ts` (exposes `window.electronAPI` via contextBridge with contextIsolation on).
- **Path alias `@/` → `src/`** in all three packages (server `tsconfig` `baseUrl` + tsconfig-paths
  for ts-node; admin/client vite `resolve.alias`).

## Config gotchas

- `.env.example` documents `PORT`, but `app.ts` reads **`SERVER_PORT`** and `CORS_ORIGIN`. Set
  `SERVER_PORT` (or both) in production.
- `DB_DIALECT=sqlite` switches the DB to in-memory SQLite **and auto-enables the Redis mock**
  — full zero-infra dev. The MySQL prod path ignores it.
- `MASTER_KEY` (32-byte hex) encrypts the AES-128 HLS keys. Changing it makes existing
  videos undecryptable.
- Admin seeded as `admin`/`admin123` in dev; prod password = `.env` `ADMIN_DEFAULT_PASSWORD`.
- `client/` has **no committed `.env`.** Set `VITE_API_BASE_URL` only if the backend is not
  reachable through the vite proxy (`/api` → `localhost:3000`).
- Infra ports: MySQL 3306, Redis 6379, MinIO 9000 (API)/9001 (console), EMQX 1883
  (MQTT)/8083 (WS)/18083 (dashboard). EMQX authenticates devices via the `mqtt_user` MySQL
  table — deleting a device row revokes MQTT access.

## Docs & tracking

- **Authoritative:** `docs/技术说明.md`, `docs/部署文档.md`, `docs/MVP技术方案.md`.
- The large Chinese design `.md` files at repo root (`技术架构方案.md`, `完整实施计划.md`,
  `独立架构设计.md`, `低成本混合边缘节点方案.md`, `开发路线与测试方案.md`) describe a
  **superseded** Widevine + Syncthing + ARM architecture. Do NOT follow them as instructions.
- `VERIFICATION_REPORT.md` (root) = test-status snapshot (413 tests / 37 endpoints / 4 Docker
  services). `.sisyphus/` = prior agent-session artifacts (plans/evidence/notepads) — safe to
  ignore unless resuming that work.

## Style / safety

- TypeScript **strict** in all packages. No `as any`, `@ts-ignore`, `@ts-expect-error`.
- No secrets are committed. Copy `.env.example` → `.env` per package.
- Never edit `dist/` or `node_modules/`.
