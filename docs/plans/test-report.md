# vdeio 测试执行报告

> 生成时间：2026-06-16
> 范围：server / admin / client / E2E
> 重点：钉钉扫码登录链路覆盖

---

## 1. 执行摘要

| 包 | 测试文件数 | 通过用例 | 失败用例 | 状态 |
|---|---|---|---|---|
| `server/` | 35 | 404 | 0 | ✅ 通过 |
| `admin/` | 14 | 170 | 0 | ✅ 通过 |
| `client/` | 21 | 234 | 0 | ✅ 通过 |
| `e2e/` | 8 个脚本 | 71 步 | 0 步 | ✅ 全部实时通过 |

**总计新增/修复**：
- Server：4 个新测试文件 + 4 个扩展文件 + 6 个生产 bug/设计缺陷修复
- Admin：10 个新测试文件 + 2 个新 store + package.json test 脚本
- Client：10 个新测试文件 + 2 个新 store + 1 个测试修复 + 1 个生产代码 refactor
- E2E：2 个新脚本 + 多个脚本重写/修复 + common.ps1 修复 + README 更新

---

## 2. Server 测试详情

### 基线
- 修改前：32 文件 / 311 用例通过
- 修改后：35 文件 / **404 用例通过**

### 新增/扩展内容

| 文件 | 类型 | 覆盖点 |
|---|---|---|
| `tests/integration/auth.test.ts` | 扩展 | GET `/auth/dingtalk/callback` HTML 落地页、mock 模式断言、黑名单 refresh 路径、已拉黑 access token 调 refresh |
| `tests/integration/admin-stores.test.ts` | 新增 | 门店 CRUD、409 重复 code、搜索/状态过滤、401/403 |
| `tests/integration/admin-devices-extra.test.ts` | 新增 | admin devices 过滤、command 非法/404、GET `/admin/devices/:id/telemetry` |
| `tests/integration/device.test.ts` | 扩展 | `/sync/confirm` 404、`/telemetry` HTTP 兜底存储验证、segment stream 错误路径 |
| `tests/integration/video.test.ts` | 扩展 | 二进制 octet-stream chunk 上传、删除被 active campaign 引用 409 |
| `src/__tests__/services/device-monitor-subscriber.test.ts` | 新增 | `startTelemetrySubscriber` MQTT 消息处理器、JSON 解析、storeTelemetry 转发、离线队列 |
| `src/__tests__/services/sync-service.test.ts` | 扩展 | `getVideoKey`/`getVideoPlaylist`/`getSegmentStream`/`getAuthorizedVideos` |
| `src/__tests__/utils/jwt.test.ts` | 修复 | `refreshAccessToken` 真正调用被测函数 |

### 生产 bug / 设计缺陷修复

1. **`/auth/refresh` 端点 500 错误**
   - 原因：`verifyRefreshToken` 返回的 payload 包含 `iat`/`exp`，再次传给 `signAccessToken`/`signRefreshToken` 时与 `expiresIn` 冲突。
   - 修复：在 `src/routes/auth.ts` 和 `src/utils/jwt.ts` 中提取纯粹 `JwtPayload` 字段后签名。
   - 验证：refresh 测试稳定 200。

2. **门店重复 code 返回 500 而非 409**
   - 原因：路由 catch 块仅检查 `err.message` 是否包含 "unique"/"Duplicate"，但 Sequelize 的 `err.message` 是 "Validation error"。
   - 修复：增加 `err.name === 'SequelizeUniqueConstraintError'` 判断。
   - 验证：`admin-stores.test.ts` 409 测试通过。

3. **二进制 chunk 上传不可达**
   - 原因：`express.json()` 会忽略 `application/octet-stream`，导致 `req.body = {}`。
   - 修复：在 `src/app.ts` 为 `/api/v1/admin/videos/upload/chunk` 添加 `express.raw()` 中间件。
   - 验证：`video.test.ts` 二进制 chunk 测试通过。

4. **设备注册返回的 token 不是 JWT，导致设备 HTTP API 401**
   - 原因：`/devices/register` 返回的是原始 UUID，而 `authMiddleware` 只校验 JWT。
   - 修复：在 `src/routes/device.ts` 的 register 路由中用 `signAccessToken` 签发 device JWT；同时把该 JWT 的 bcrypt hash 写入 `mqtt_user`，使同一凭证可用于 MQTT。
   - 验证：`device-sync-flow.ps1` / `dashboard-alert-flow.ps1` 设备链路全部通过。

5. **设备绑定后 token 未包含 storeId，导致 store 范围接口 403**
   - 原因：绑定前签发的 JWT `storeId=null`。
   - 修复：`/devices/bind` 在更新 `storeId` 后重新签发 device JWT 并返回给客户端。
   - 验证：设备 sync / videos / playlist / key / segment / report 接口全部通过。

6. **`device_telemetries.device_id` 列类型被 Sequelize 关联推断为 `BIGINT`**
   - 原因：`DeviceModel.hasMany(DeviceTelemetryModel)` 未指定 `sourceKey: 'deviceId'`，Sequelize 默认引用 `devices.id`（BIGINT），导致生成的表/列与 model 期望的 UUID 字符串不一致。
   - 修复：在 `src/models/index.ts` 的 Device↔DeviceTelemetry 关联中显式指定 `sourceKey: 'deviceId'` / `targetKey: 'deviceId'`。
   - 验证：现场 DB 已 `ALTER TABLE` 修正；`dashboard-alert-flow.ps1` 遥测接口 200。

7. **`.env.example` MinIO 变量名与代码不一致**
   - 原因：`.env.example` 使用 `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`，但 `src/config/minio.ts` 读取 `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`。
   - 修复：统一 `.env.example` 为 `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`。

---

## 3. Admin 测试详情

### 基线
- 修改前：无 `test` 脚本，4 个测试文件
- 修改后：`npm test` 可用，14 文件 / **170 用例通过**

### 新增内容

| 文件 | 覆盖点 |
|---|---|
| `src/__tests__/views/Login.test.ts` | 表单渲染、校验、登录成功/失败、重定向查询参数 |
| `src/__tests__/views/Dashboard.test.ts` | stats 卡片、ECharts 初始化、空数据态 |
| `src/__tests__/views/video/VideoList.test.ts` | 表格/分页/搜索/删除确认 |
| `src/__tests__/views/video/VideoUpload.test.ts` | 文件选择、分片进度、完成跳转 |
| `src/__tests__/views/campaign/CampaignList.test.ts` | 状态筛选、publish/end 按钮 |
| `src/__tests__/views/campaign/CampaignCreate.test.ts` | 表单校验、编辑模式回填、视频/门店选择 |
| `src/__tests__/views/store/StoreList.test.ts` | CRUD 表格、code 唯一校验 |
| `src/__tests__/views/device/DeviceList.test.ts` | 列表、删除设备、在线状态 |
| `src/__tests__/stores/video.test.ts` | video store state/actions |
| `src/__tests__/stores/campaign.test.ts` | campaign store state/actions |
| `src/__tests__/router/index.test.ts` | 真实 `src/router/index.ts` 守卫 |
| `src/stores/video.ts` | 新增生产 store |
| `src/stores/campaign.ts` | 新增生产 store |
| `package.json` | 添加 `"test": "vitest run"` |

---

## 4. Client 测试详情

### 基线
- 修改前：9 文件 / 86 用例（1 失败）
- 修改后：21 文件 / **234 用例通过**

### 新增/修复内容

| 文件 | 说明 |
|---|---|
| `src/__tests__/views/Login.test.ts` | 钉钉 QR iframe、loading、错误、mock 按钮、轮询 |
| `src/__tests__/views/Home.test.ts` | 视频列表、活动标签、playVideo 导航、logout |
| `src/__tests__/views/Player.test.ts` | 路由参数→usePlayer init/destroy、返回 |
| `src/__tests__/views/SyncStatus.test.ts` | 进度条、日志、手动触发 sync |
| `src/__tests__/stores/auth.test.ts` | 补充 auth store 测试 |
| `src/__tests__/stores/sync.test.ts` + `src/stores/sync.ts` | 新增 sync store + 测试 |
| `src/__tests__/stores/player.test.ts` + `src/stores/player.ts` | 新增 player store + 测试 |
| `src/__tests__/router/index.test.ts` | 真实路由守卫测试 |
| `src/__tests__/electron/main.test.ts` | BrowserWindow、CSP、IPC handlers、device-id |
| `src/__tests__/electron/sync-service.test.ts` | 目录创建、diff、download、LRU 阈值、并发守卫 |
| `src/__tests__/electron/mqtt-bridge.test.ts` | connect/will、命令、离线队列、重连 flush、disconnect |
| `src/__tests__/electron/preload.test.ts` | contextBridge API 形状 |
| `src/__tests__/sync/diff.test.ts` | 改为从真实 `electron/sync-service.ts` 导入 `calculateDiff` |
| `src/composables/useDingTalkAuth.test.ts` | 修复 `mockLogin` 测试（补 mock 响应） |
| `electron/sync-service.ts` | 导出纯函数 `parseM3U8` / `createLocalM3U8` / `calculateDiff` 供测试 |

---

## 5. E2E 详情

### 环境准备

```powershell
cd deploy
docker compose up -d

# server 已配置 .env（MySQL/Redis/MinIO/EMQX 均使用 localhost 映射端口）
cd ../server
npm run dev
```

### 执行结果（全部实时通过）

| 脚本 | 步骤 | 通过 | 失败 |
|---|---|---|---|
| `dingtalk-login-flow.ps1` | 11 | 11 | 0 |
| `admin-lockout-flow.ps1` | 8 | 8 | 0 |
| `store-crud-flow.ps1` | 8 | 8 | 0 |
| `video-upload-flow.ps1` | 9 | 9 | 0 |
| `campaign-lifecycle-flow.ps1` | 12 | 12 | 0 |
| `device-sync-flow.ps1` | 14 | 14 | 0 |
| `dashboard-alert-flow.ps1` | 10 | 10 | 0 |
| `real-video-upload.ps1` | 9 | 9 | 0 |

### E2E 脚本修复要点

- **PowerShell 中文正则编码**：所有含中文断言的 `.ps1` 脚本统一转换为 **UTF-8 BOM**，避免文件执行时中文字面量无法匹配。
- **`e2e/common.ps1`**：修正 `Test-E2EServerReachable` 的 health URL（`/api/v1/health` → `/health`）。
- **`dingtalk-login-flow.ps1`**：
  - 增加 GET `/auth/dingtalk/callback` HTML 成功页/错误页断言；
  - 处理 400 响应流需先 `$stream.Position = 0` 才能读取内容。
- **`video-upload-flow.ps1`** / **`campaign-lifecycle-flow.ps1`**：
  - 移除随机 base64 块覆盖，使用 ffmpeg 生成的合法 MP4 分片；
  - chunk 断言从 `body.received` 改为 `body.receivedBytes`。
- **`device-sync-flow.ps1`**：
  - 每次运行创建独立 test store，避免门店单设备约束冲突；
  - 绑定后使用服务端重新签发的 device JWT；
  - 上传合法视频并轮询加密完成后再创建 campaign；
  - segment 序号从 `001` 修正为 `000`（与 ffmpeg 输出一致）。
- **`dashboard-alert-flow.ps1`**：同样改为创建独立 test store，并更新绑定后的 device token。

---

## 6. 覆盖率趋势（未设置阈值）

| 包 | 修改前估算 | 修改后趋势 |
|---|---|---|
| server | ~60% 行覆盖 | 显著提升（新增 93 个用例 + 路由覆盖） |
| admin | ~5%（仅 store/request） | 大幅提升至主要视图/路由/store |
| client | ~30% | 大幅提升，Electron 主进程从 0% 开始覆盖 |

> 注：未运行带 `--coverage` 的完整报告，因为任务重点是补充测试用例与执行测试套件。

---

## 7. 已知问题与后续建议

1. **钉钉真实模式**：已配置 mock 模式全覆盖；真实 DingTalk 需配置 `DINGTALK_APP_KEY/SECRET/REDIRECT_URI` 并手动扫码。
2. **CI 集成**：建议将 `server/admin/client` 的 `npm test` 加入 CI；E2E 作为独立 job 在 Docker 服务中运行。
3. **覆盖率阈值**：建议在 `vitest.config.ts` 中设置 server 80%/admin 60%/client 60% 的行覆盖阈值。
4. **E2E 幂等性**：当前 device/dashboard 流已改为“每运行创建独立 store”，但 lockout 流会锁定 admin 15 分钟；连续跑全量 E2E 时建议在 lockout 流后手动 `UPDATE admins SET login_fail_count=0, locked_until=NULL`，或把 lockout 放在最后执行。

---

## 8. 交付物清单

- `docs/plans/2026-06-15-vdeio-test-case-design.md` — 测试用例设计计划
- `docs/plans/test-runbook.md` — 测试执行手册
- `docs/plans/test-report.md` — 本报告
- Server/Admin/Client 新增与修改的测试文件（见上文）
- E2E PowerShell 脚本增强与新增（见上文）

---

*报告完成。*
