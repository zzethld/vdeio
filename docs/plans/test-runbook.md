# vdeio 测试执行手册

> 本手册说明如何运行 vdeio 项目全部测试套件（server / admin / client / E2E），包括前置条件、命令、mock 与真实环境配置、常见排错。

---

## 1. 测试套件概览

| 包 | 技术栈 | 测试命令 | 当前基线 |
|---|---|---|---|
| `server/` | Node + Express + TS + Vitest | `cd server; $env:DB_DIALECT='sqlite'; npm test` | 32 文件 / 311 用例通过 |
| `admin/` | Vue3 + Pinia + Element Plus + Vitest | `cd admin; npm test` | 待补充组件/store 测试 |
| `client/` | Vue3 + Electron + Vitest | `cd client; npm test` | 9 文件 / 86 用例（1 个现有失败需修复） |
| `e2e/` | PowerShell + 真实 HTTP | `powershell -ExecutionPolicy Bypass -File .\e2e\dingtalk-login-flow.ps1` | 6 个流程脚本 + 2 个新增 |

---

## 2. 前置条件

### 2.1 安装依赖

三个 npm 包互相独立，无 workspace，需要分别安装：

```powershell
cd server; npm install
cd ../admin; npm install
cd ../client; npm install
```

### 2.2 零基础设施开发模式（推荐用于单元/集成测试）

```powershell
cd server
$env:DB_DIALECT='sqlite'   # 内存 SQLite + 自动 Redis mock + 自动 seed admin/admin123
npm test                    # 运行全部 server 测试
```

无需 Docker、MySQL、Redis、MinIO、EMQX。

### 2.3 全栈 E2E 模式（需要 Docker）

```powershell
cd deploy
docker compose up -d
```

启动：MySQL 3306、Redis 6379、MinIO 9000/9001、EMQX 1883/8083/18083。

然后启动 server：

```powershell
cd ../server
# 复制 .env.example -> .env 并按需填写
npm run dev
```

---

## 3. 各包测试命令

### 3.1 Server

```powershell
cd server
$env:DB_DIALECT='sqlite'
npm test                    # 全量
npx vitest run src/__tests__/services/device-monitor-subscriber.test.ts
npx vitest run tests/integration/auth.test.ts
```

### 3.2 Admin

```powershell
cd admin
npm test                    # 全量（需 package.json 已添加 test 脚本）
npx vitest run src/__tests__/views/Login.test.ts
```

### 3.3 Client

```powershell
cd client
npm test                    # 全量
npx vitest run src/__tests__/electron/sync-service.test.ts
```

### 3.4 E2E

```powershell
# Dry run（不发真实 HTTP 请求）
powershell -ExecutionPolicy Bypass -File .\e2e\dingtalk-login-flow.ps1 -WhatIf

# 真实运行（需要 server + Docker 基础设施）
powershell -ExecutionPolicy Bypass -File .\e2e\dingtalk-login-flow.ps1
powershell -ExecutionPolicy Bypass -File .\e2e\admin-lockout-flow.ps1
powershell -ExecutionPolicy Bypass -File .\e2e\store-crud-flow.ps1
```

---

## 4. 钉钉扫码登录测试

### 4.1 Mock 模式（默认，无需真实钉钉账号）

确保 server 没有配置 `DINGTALK_APP_KEY`：

```powershell
cd server
$env:DINGTALK_APP_KEY=''
$env:DB_DIALECT='sqlite'
npm run dev
```

在另一个窗口运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\e2e\dingtalk-login-flow.ps1
```

预期：
- `GET /auth/dingtalk/qrcode` 返回 `mockMode=true`、`qrCodeUrl=''`。
- `POST /auth/dingtalk/callback` 返回 `success=true`。
- `GET /auth/dingtalk/callback` 返回 HTML `✅ 登录成功`。
- `/auth/poll` 最终返回 `status=success` 与 JWT。

### 4.2 真实钉钉模式

1. 在钉钉开放平台创建应用，获取 `AppKey`、`AppSecret`。
2. 配置 server `.env`：
   ```
   DINGTALK_APP_KEY=your_app_key
   DINGTALK_APP_SECRET=your_app_secret
   DINGTALK_REDIRECT_URI=http://localhost:3000/api/v1/auth/dingtalk/callback
   ```
3. 重启 server。
4. 运行 E2E 脚本，此时 `qrCodeUrl` 为真实二维码地址。
5. **手动**用钉钉客户端扫码确认；脚本只验证轮询与 token 链路，不自动扫码。

---

## 5. 覆盖率阈值

| 包 | 行覆盖率目标 | 函数覆盖率目标 | 分支覆盖率目标 |
|---|---|---|---|
| server | ≥80% | ≥75% | ≥70% |
| admin | ≥60% | ≥50% | — |
| client | ≥60% | ≥50% | — |
| client/electron | ≥70% | ≥60% | — |

可在各包 `vitest.config.ts` 中配置：

```typescript
test: {
  coverage: {
    provider: 'v8',
    reporter: ['text', 'html'],
    thresholds: {
      lines: 80,
      functions: 75,
      branches: 70
    }
  }
}
```

---

## 6. 已知问题与排错

### 6.1 `/auth/refresh` 报 `Bad "options.expiresIn" option`

现象：server stderr 出现 `Error: Bad "options.expiresIn" option the payload already has an "exp" property.`
原因：`signAccessToken` 在 refresh 处理中传入了已带 `exp` 的 payload。
处理：修复 `src/routes/auth.ts` 或 `src/utils/jwt.ts`，确保 refresh 时只使用 refresh token 的 user 信息重新签发 access token，而不是复用旧 payload。

### 6.2 Client `mockLogin triggers login success` 超时

现象：`useDingTalkAuth.test.ts` 中 `mockLogin` 测试因 `router.push` 未被调用而失败。
原因：`mockLogin` 可能未正确触发 `onLoginSuccess`。
处理：检查 `src/composables/useDingTalkAuth.ts` 的 `mockLogin` 实现，确保它调用 `onLoginSuccess` 或修正测试断言。

### 6.3 E2E GET callback 步骤在无 server 时失败

现象：`-WhatIf` 模式下 Step 2a/2b 报连接错误。
原因：直接 `Invoke-WebRequest` 不识别 `-WhatIf`。
处理：正常现象；真实运行时需确保 server 已启动。

### 6.4 Admin package.json 无 test 脚本

现象：`cd admin; npm test` 报错。
处理：确认 `package.json` 已添加 `"test": "vitest run"`。

---

## 7. CI 建议

```yaml
# 示例 GitHub Actions 片段
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: cd server && npm install && DB_DIALECT=sqlite npm test
      - run: cd admin && npm install && npm test
      - run: cd client && npm install && npm test
```

E2E 需要 Docker 服务，建议在独立 job 中运行：

```yaml
  e2e:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - run: cd deploy && docker compose up -d
      - run: cd server && npm install && npm run dev &
      - run: Start-Sleep -Seconds 10
      - run: |
          powershell -ExecutionPolicy Bypass -File .\e2e\dingtalk-login-flow.ps1
          powershell -ExecutionPolicy Bypass -File .\e2e\video-upload-flow.ps1
```

---

## 8. 测试新增流程（TDD）

新增测试时遵循：

1. 写失败测试 → 运行 `npx vitest run <file>` 确认失败。
2. 实现最小代码使测试通过 → 再次运行确认通过。
3. 运行全量套件确认无回归。
4. 原子提交：`test(scope): what`。

---

*最后更新：2026-06-15*
