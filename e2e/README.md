# Vdeio E2E Test Scripts

PowerShell E2E test scripts for the Vdeio video distribution platform.

## Prerequisites

- Server running on `localhost:3000` (or set `$env:VDEIO_BASE_URL`)
- Docker containers running: MySQL, Redis, MinIO, EMQX (for full-stack live runs)
- Admin account configured (default: `admin` / `admin123`)
- DingTalk mock mode enabled (no `DINGTALK_APP_KEY` required) for the DingTalk flow

## Quick Start

```powershell
# Dry run — print all steps without executing HTTP calls
powershell -ExecutionPolicy Bypass -File .\e2e\video-upload-flow.ps1 -WhatIf

# Run a single flow against a live server
powershell -ExecutionPolicy Bypass -File .\e2e\video-upload-flow.ps1
```

## Test Flows

| Script | Flow | API Endpoints |
|--------|------|---------------|
| `video-upload-flow.ps1` | Upload + Encryption | login, upload/init, chunk x3, complete, poll status |
| `real-video-upload.ps1` | Real MP4 Binary Upload + MinIO Verify | login, binary chunk upload, complete, poll, key endpoint |
| `campaign-lifecycle-flow.ps1` | Campaign CRUD | login, create, assign videos/stores, publish, end |
| `device-sync-flow.ps1` | Device + Playback | register, bind, sync, playlist, key, segment, report, telemetry |
| `dingtalk-login-flow.ps1` | DingTalk Auth | QR code, callback, GET callback HTML, poll, refresh, logout |
| `dashboard-alert-flow.ps1` | Dashboard + Alerts | stats, device register, EMQX webhooks, telemetry, verify |
| `admin-lockout-flow.ps1` | Admin Login Lockout | 5 failed logins → 15 min lock, reset on success |
| `store-crud-flow.ps1` | Store CRUD | create, duplicate code 409, list/filter, update, delete |

## Running All Tests

```powershell
# Run all flows sequentially
$flows = @(
    ".\e2e\video-upload-flow.ps1",
    ".\e2e\real-video-upload.ps1",
    ".\e2e\campaign-lifecycle-flow.ps1",
    ".\e2e\device-sync-flow.ps1",
    ".\e2e\dingtalk-login-flow.ps1",
    ".\e2e\dashboard-alert-flow.ps1",
    ".\e2e\admin-lockout-flow.ps1",
    ".\e2e\store-crud-flow.ps1"
)
foreach ($f in $flows) {
    powershell -ExecutionPolicy Bypass -File $f
}
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `$env:VDEIO_BASE_URL` | `http://localhost:3000/api/v1` | API base URL |

## DingTalk Mock vs Real

- **Mock mode (default)**: leave `DINGTALK_APP_KEY` unset. The DingTalk flow uses `/auth/dingtalk/qrcode` + `/auth/dingtalk/callback` with mock auth codes and expects `mockMode=true` in the qrcode response.
- **Real mode**: configure `DINGTALK_APP_KEY`, `DINGTALK_APP_SECRET`, and `DINGTALK_REDIRECT_URI` on the server, then scan the returned QR code with a real DingTalk client. The PowerShell scripts do not automate the QR scan step.

## Status

These scripts execute real HTTP calls against a running server. Use `-WhatIf` for a dry run that prints steps without sending requests.
