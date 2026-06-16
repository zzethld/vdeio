# vdeio 完整测试用例设计与执行计划

> 本计划由 Sisyphus 基于 `server/`、`admin/`、`client/`、`e2e/` 实测盘点结果编制。
> 已确认：**server 已有 32 个测试文件**，admin/client 已有少量测试，E2E 已有 6 个 PowerShell 流程脚本。
> 重点覆盖：管理员登录、钉钉扫码 OAuth、JWT 刷新/黑名单、视频 AES-128 HLS 加密、活动投放、门店/设备、MQTT 遥测、Electron 主进程。

---

## 1. 当前状态盘点

### 1.1 Server

| 项 | 事实 |
|---|---|
| 框架 | vitest 4.1.8，globals=true，environment=node |
| DB | `DB_DIALECT=sqlite` + `:memory:` → Sequelize 内存 SQLite，真实建表 |
| Redis | `REDIS_MOCK=true` → 内存 `MemoryRedis`（get/setex/del/sadd/smembers/keys） |
| MQTT | 单测中 `vi.mock('mqtt')`；`startTelemetrySubscriber` 在 sqlite 模式下跳过 |
| HTTP | supertest，集成测试自行 `init/reset/close` 数据库 |
| 已有测试 | 单元 23 个 + 集成/安全 9 个 = 32 个 `.test.ts` |

**已覆盖**：JWT 签发/验证/黑名单中间件、管理员登录+锁定、钉钉服务层两步 OAuth、上传/加密/key-manager 服务、活动 CRUD/发布/结束、设备注册/绑定/同步/遥测 HTTP 兜底、EMQX webhook、安全扫描。

**主要缺口**：
- `GET /api/v1/auth/dingtalk/callback`（HTML 重定向落地）未测；POST callback 已测。
- qrcode 非 mock 模式未测（默认恒为 mock 模式）。
- `/auth/refresh` 存在已知 bug（容忍 200/500），需锁定成功路径。
- `startTelemetrySubscriber` MQTT 订阅消息处理器完全未测。
- 门店无独立集成测试；`GET /admin/devices/:deviceId/telemetry` 路由未测。
- `sendCommand` / 非法 command 400 分支未测。
- `app.ts` 后台调度器、config 三件套、`playLog` 模型等无测试。

### 1.2 Admin

| 项 | 事实 |
|---|---|
| 框架 | Vue3 + Pinia + Element Plus + Vitest + jsdom |
| 测试脚本 | **package.json 无 `test` 脚本** |
| 已有测试 | setup、router(复制品)、stores/auth、utils/request 共 4 个 |

**缺口**：Login.vue、Dashboard.vue、VideoList/VideoUpload.vue、CampaignList/Create/Detail、StoreList.vue、DeviceList.vue、真实 router、video/campaign store 全部未测。

### 1.3 Client

| 项 | 事实 |
|---|---|
| 框架 | Vue3 + Electron + Shaka Player + Vitest + jsdom |
| 测试脚本 | 有 `test`/`test:watch` |
| 已有测试 | useDingTalkAuth、usePlayer、diff 复制品、helpers、infrastructure、auth/device stores、mqtt IPC 封装、request 共 9 个 |

**缺口**：
- `client/electron/` 主进程 **0 测试**（sync-service.ts 520 行、mqtt-bridge.ts 428 行）。
- `src/__tests__/sync/diff.test.ts` 在行内重定义 diff，未导入真实 `electron/sync-service.ts`。
- Login.vue、Player.vue、Dashboard.vue、SyncStatus.vue、真实 router 未测。

### 1.4 E2E

| 脚本 | 覆盖 |
|---|---|
| `dingtalk-login-flow.ps1` | 二维码→POST callback→轮询→JWT→refresh→旧 token 拒绝→登出→黑名单 |
| `video-upload-flow.ps1` | 管理员登录→分片上传→完成→轮询加密→验证 hlsUrl |
| `campaign-lifecycle-flow.ps1` | 视频上传→创建活动→加视频/门店→发布→仪表盘→结束 |
| `device-sync-flow.ps1` | 设备注册→绑定→上传+活动→同步→播放列表/key/分片→播放上报→遥测 |
| `dashboard-alert-flow.ps1` | 仪表盘+EMQX webhook 模拟 connect/disconnect+遥测 |
| `real-video-upload.ps1` | 真实 MP4 二进制分片上传+MinIO 验证（README 未收录） |

**缺口**：GET `/auth/dingtalk/callback` HTML 分支、state 过期/非法、storeId=null 强制登出、admin 5 次锁定、真实 MQTT 连接、Electron 真实同步引擎。

---

## 2. 测试用例清单

### 2.1 Server 集成测试补充

#### A. Auth 路由（扩展 `tests/integration/auth.test.ts`）

| ID | 用例标题 | 路径 | 关键断言 |
|---|---|---|---|
| AUTH-INT-01 | 钉钉 qrcode 返回 mockMode | `GET /auth/dingtalk/qrcode` | `mockMode=true`, `qrCodeUrl=''`, state 写入 Redis |
| AUTH-INT-02 | 钉钉 qrcode 非 mock 模式返回真实 url | `GET /auth/dingtalk/qrcode` | 注入 `DINGTALK_APP_KEY` 后 `qrCodeUrl` 包含 state 参数 |
| AUTH-INT-03 | POST callback 成功创建 operator | `POST /auth/dingtalk/callback` | 200, 用户/设备创建, Redis 状态变 success |
| AUTH-INT-04 | POST callback 缺 state/authCode 400 | `POST /auth/dingtalk/callback` | 400 |
| AUTH-INT-05 | POST callback 无效/过期 state 400 | `POST /auth/dingtalk/callback` | 400 |
| AUTH-INT-06 | GET callback 返回 HTML 成功页 | `GET /auth/dingtalk/callback?state=&authCode=` | 200, 响应体含 `✅ 登录成功` |
| AUTH-INT-07 | GET callback 缺参数返回 HTML 错误页 | `GET /auth/dingtalk/callback` | 200, 响应体含 `参数缺失` |
| AUTH-INT-08 | poll pending | `GET /auth/poll?state=` | `{status:'pending'}` |
| AUTH-INT-09 | poll success | `GET /auth/poll?state=` | `{status:'success', accessToken, refreshToken, user, storeId}` |
| AUTH-INT-10 | poll 无效 state 400 | `GET /auth/poll?state=bad` | 400 |
| AUTH-INT-11 | mock-login 签发真实 JWT | `POST /auth/mock-login` | accessToken/refreshToken 存在, 可过 authMiddleware |
| AUTH-INT-12 | refresh 返回新 token 并把旧 refresh 拉黑 | `POST /auth/refresh` | 200, 旧 refresh 再用 401 |
| AUTH-INT-13 | refresh 缺 token 400 | `POST /auth/refresh` | 400 |
| AUTH-INT-14 | refresh 过期/篡改 token 401 | `POST /auth/refresh` | 401 |
| AUTH-INT-15 | logout 把 access token 拉黑 | `POST /auth/logout` | 200, 再用该 token 请求 401 |
| AUTH-INT-16 | 已拉黑 access token 走 refresh 应 401 | `POST /auth/refresh` | 先 logout，再用 access token 调 refresh 401 |

#### B. Admin 认证（扩展 `tests/integration/admin-auth-dashboard.test.ts`）

| ID | 用例标题 | 路径 | 关键断言 |
|---|---|---|---|
| ADMIN-AUTH-01 | 正确登录返回 token | `POST /admin/auth/login` | 200, accessToken/refreshToken, role='admin' |
| ADMIN-AUTH-02 | 密码错误 401 并累加失败计数 | `POST /admin/auth/login` | 401, `loginFailCount=1` |
| ADMIN-AUTH-03 | 5 次失败后第 6 次 403 锁定 | `POST /admin/auth/login` | 连续 5 次 401，第 6 次 403，提示 15 分钟后重试 |
| ADMIN-AUTH-04 | 成功后失败计数清零 | `POST /admin/auth/login` | 先失败 2 次，再成功，计数归零 |
| ADMIN-AUTH-05 | 禁用账号(status=0)无法登录 | `POST /admin/auth/login` | 403 或 401 |
| ADMIN-AUTH-06 | 不存在用户 401 | `POST /admin/auth/login` | 401 |
| ADMIN-AUTH-07 | 缺字段 400 | `POST /admin/auth/login` | 400 |
| ADMIN-AUTH-08 | dashboard stats 正确聚合 | `GET /admin/dashboard/stats` | 返回 totalVideos/totalStores/... |
| ADMIN-AUTH-09 | dashboard 无 token 401 | `GET /admin/dashboard/stats` | 401 |
| ADMIN-AUTH-10 | 普通 operator token 访问 dashboard 403 | `GET /admin/dashboard/stats` | 403 |

#### C. Admin 业务路由（新增 `tests/integration/admin-stores.test.ts`、`admin-devices-extra.test.ts`）

| ID | 用例标题 | 路径 | 关键断言 |
|---|---|---|---|
| STORE-01 | 创建门店 | `POST /admin/stores` | 201, code 唯一 |
| STORE-02 | 重复 code 409 | `POST /admin/stores` | 409 |
| STORE-03 | 列出门店支持搜索/状态过滤 | `GET /admin/stores` | 分页/过滤正确 |
| STORE-04 | 获取门店详情 200/404 | `GET /admin/stores/:id` | 存在 200, 不存在 404 |
| STORE-05 | 更新门店 | `PUT /admin/stores/:id` | 200 |
| STORE-06 | 删除无设备门店 | `DELETE /admin/stores/:id` | 200 或 204 |
| DEVICE-ADMIN-01 | 列出设备支持过滤 | `GET /admin/devices` | 分页/状态/门店过滤 |
| DEVICE-ADMIN-02 | 发送 sync 命令 | `POST /admin/devices/:deviceId/command` | 200 |
| DEVICE-ADMIN-03 | 非法 command 400 | `POST /admin/devices/:deviceId/command` | 400, Invalid command |
| DEVICE-ADMIN-04 | 命令发给不存在的设备 404 | `POST /admin/devices/:deviceId/command` | 404 |
| DEVICE-ADMIN-05 | 获取设备遥测 | `GET /admin/devices/:deviceId/telemetry` | 200, 返回列表 |

#### D. Device 路由（扩展 `tests/integration/device.test.ts`）

| ID | 用例标题 | 路径 | 关键断言 |
|---|---|---|---|
| DEVICE-01 | 设备注册 | `POST /devices/register` | 200, deviceId/deviceToken |
| DEVICE-02 | 设备绑定门店 | `POST /devices/bind` | 200, storeId 写入 |
| DEVICE-03 | 同一设备重复绑定不同门店 409 | `POST /devices/bind` | 409 |
| DEVICE-04 | 无 storeId token 调 sync 403 | `POST /devices/sync` | 403 |
| DEVICE-05 | sync 返回 diff | `POST /devices/sync` | 返回 downloads/deletes |
| DEVICE-06 | 获取授权视频列表 | `GET /devices/videos` | 按活动分组 |
| DEVICE-07 | 获取播放列表 | `GET /devices/videos/:id/playlist` | 200 或 403 |
| DEVICE-08 | 获取 AES key | `GET /devices/videos/:id/key` | 200 二进制或 403 |
| DEVICE-09 | 获取 segment | `GET /devices/videos/:id/segment/:seq` | stream |
| DEVICE-10 | 播放上报 | `POST /devices/videos/:id/report-play` | 200 |
| DEVICE-11 | 遥测上报 HTTP 兜底 | `POST /devices/telemetry` | 200 |
| DEVICE-12 | sync/confirm 更新 localPaths | `POST /devices/sync/confirm` | 200 |

#### E. Video 路由（扩展 `tests/integration/video.test.ts`）

| ID | 用例标题 | 路径 | 关键断言 |
|---|---|---|---|
| VIDEO-01 | upload init | `POST /admin/videos/upload/init` | uploadId/chunkCount |
| VIDEO-02 | upload chunk base64 | `POST /admin/videos/upload/chunk` | 200 |
| VIDEO-03 | upload chunk 二进制 body | `POST /admin/videos/upload/chunk` | 200 |
| VIDEO-04 | upload complete | `POST /admin/videos/upload/complete` | video 创建, status pending |
| VIDEO-05 | list 支持 encryptStatus/search | `GET /admin/videos` | 过滤正确 |
| VIDEO-06 | detail 200/404 | `GET /admin/videos/:id` | — |
| VIDEO-07 | update 元数据 | `PUT /admin/videos/:id` | 200 |
| VIDEO-08 | 删除被活动引用的视频 409 | `DELETE /admin/videos/:id` | 409 |
| VIDEO-09 | 删除无引用视频软删 | `DELETE /admin/videos/:id` | 200 |

#### F. Campaign 路由（扩展 `tests/integration/campaign.test.ts`）

| ID | 用例标题 | 路径 | 关键断言 |
|---|---|---|---|
| CAMPAIGN-01 | 创建草稿 | `POST /admin/campaigns` | 201 |
| CAMPAIGN-02 | publish 无视频/无门店 400 | `POST /admin/campaigns/:id/publish` | 400 |
| CAMPAIGN-03 | publish draft→active | `POST /admin/campaigns/:id/publish` | 200, status active |
| CAMPAIGN-04 | end active→ended | `POST /admin/campaigns/:id/end` | 200, status ended |
| CAMPAIGN-05 | 非 draft 无法更新 | `PUT /admin/campaigns/:id` | 400 |
| CAMPAIGN-06 | 添加/删除视频和门店 | `POST/DELETE .../videos` `.../stores` | 200 |

#### G. 服务层缺口

| ID | 模块 | 测试点 | 文件 |
|---|---|---|---|
| SVC-01 | device-monitor | `startTelemetrySubscriber` 消息处理器 | 新增 `src/__tests__/services/device-monitor-subscriber.test.ts` |
| SVC-02 | device-monitor | `sendCommand` 各种 command | 扩展 `src/__tests__/services/device-monitor.test.ts` |
| SVC-03 | campaign | `listCampaigns` / `getCampaignById` | 扩展 `src/__tests__/services/campaign.test.ts` |
| SVC-04 | upload | chunk 乱序、缺失、idempotency | 扩展 `src/__tests__/services/upload.test.ts` |
| SVC-05 | encryption | 重试上限≤3、失败状态、HLS key 包装 | 扩展 `src/__tests__/services/encryption.test.ts` |
| SVC-06 | sync-service | `getVideoKey`/`getVideoPlaylist`/`getSegmentStream`/`getAuthorizedVideos` | 扩展 `src/__tests__/services/sync-service.test.ts` |
| SVC-07 | jwt | 修复 `refreshAccessToken` 名不副实的测试 | 修改 `src/__tests__/utils/jwt.test.ts` |
| SVC-08 | dingtalk | 网络异常 fetch reject、非 mock URL 结构 | 扩展 `src/__tests__/services/dingtalk.test.ts` |

### 2.2 Admin 前端测试补充

> 先给 `admin/package.json` 添加 `"test": "vitest run"`。

| ID | 文件 | 关键用例 |
|---|---|---|
| ADMIN-UI-01 | `src/__tests__/views/Login.test.ts` | 表单渲染、校验、登录成功/失败、重定向查询参数、错误提示 |
| ADMIN-UI-02 | `src/__tests__/views/Dashboard.test.ts` | stats 卡片渲染、ECharts 初始化、空数据态 |
| ADMIN-UI-03 | `src/__tests__/views/video/VideoList.test.ts` | 表格/分页/搜索/删除确认/软删后状态 |
| ADMIN-UI-04 | `src/__tests__/views/video/VideoUpload.test.ts` | 选择文件、分片进度、完成跳转、100MB 限制提示 |
| ADMIN-UI-05 | `src/__tests__/views/campaign/CampaignList.test.ts` | 状态筛选、publish/end 按钮、分页 |
| ADMIN-UI-06 | `src/__tests__/views/campaign/CampaignCreate.test.ts` | 表单校验、编辑模式回填、视频/门店选择 |
| ADMIN-UI-07 | `src/__tests__/views/store/StoreList.test.ts` | CRUD 表格、code 唯一校验 |
| ADMIN-UI-08 | `src/__tests__/views/device/DeviceList.test.ts` | 列表、删除设备=撤销 MQTT、在线状态 |
| ADMIN-UI-09 | `src/__tests__/stores/video.test.ts` | video store actions/mutations |
| ADMIN-UI-10 | `src/__tests__/stores/campaign.test.ts` | campaign store actions/mutations |
| ADMIN-UI-11 | `src/__tests__/router/index.test.ts` | 改为测试真实 `src/router/index.ts` |

### 2.3 Client 渲染层测试补充

| ID | 文件 | 关键用例 |
|---|---|---|
| CLIENT-UI-01 | `src/__tests__/views/Login.test.ts` | iframe 渲染、loading、错误、mock 按钮、轮询成功 |
| CLIENT-UI-02 | `src/__tests__/views/Home.test.ts` | 视频列表、活动标签、playVideo 导航、logout |
| CLIENT-UI-03 | `src/__tests__/views/Player.test.ts` | 路由参数→usePlayer init/destroy、返回按钮 |
| CLIENT-UI-04 | `src/__tests__/views/SyncStatus.test.ts` | 进度条、日志、手动触发 sync |
| CLIENT-UI-05 | `src/__tests__/stores/auth.test.ts` | setStoreInfo、token 生命周期、loadFromStorage |
| CLIENT-UI-06 | `src/__tests__/stores/sync.test.ts` | 状态更新、进度事件、缓存大小 |
| CLIENT-UI-07 | `src/__tests__/stores/player.test.ts` | 当前视频、播放列表、离线检测 |
| CLIENT-UI-08 | `src/__tests__/router/index.test.ts` | 真实路由守卫 |
| CLIENT-UI-09 | `src/__tests__/sync/diff.test.ts` | 改为导入真实 `electron/sync-service.ts` 的纯函数 |

### 2.4 Electron 主进程测试补充

| ID | 文件 | 关键用例 |
|---|---|---|
| ELECTRON-01 | `src/__tests__/electron/main.test.ts` | BrowserWindow 创建、CSP、IPC 处理程序装配 |
| ELECTRON-02 | `src/__tests__/electron/sync-service.test.ts` | 目录创建、scanLocalVideos、fetchSyncDiff、downloadVideo、LRU 淘汰阈值(85%/95%)、startSync 并发守卫 |
| ELECTRON-03 | `src/__tests__/electron/mqtt-bridge.test.ts` | connect 遗嘱/online、订阅 command、restart/sync/clear-cache 命令、离线队列、重连 flush、disconnect offline |
| ELECTRON-04 | `src/__tests__/electron/preload.test.ts` | contextBridge 暴露的 API 形状 |

### 2.5 E2E PowerShell 增强

| ID | 文件 | 增强点 |
|---|---|---|
| E2E-01 | `e2e/dingtalk-login-flow.ps1` | 增加 GET `/auth/dingtalk/callback` HTML 断言、state 过期/非法 400 断言、mockMode=true 断言、轮询重试退避 |
| E2E-02 | `e2e/common.ps1` | 修复 `Get-AdminToken`/`Get-DeviceToken` 的 `return $null`；增加 setup 校验；失败时保存 response body |
| E2E-03 | `e2e/README.md` | 收录 `real-video-upload.ps1`、删除“skeleton”过时说明、标注 mock/real DingTalk 执行方式 |
| E2E-04 | 新增 `e2e/admin-lockout-flow.ps1` | 5 次失败→15 分钟锁定 |
| E2E-05 | 新增 `e2e/store-crud-flow.ps1` | 门店 CRUD + 409 重复 code |

---

## 3. 实施与执行计划

### 3.1 工作波次

**Wave 1（可并行）**
- 服务端集成/服务测试补充
- admin 前端测试补充 + 添加 package.json test 脚本
- client 渲染层测试补充
- Electron 主进程测试补充

**Wave 2（依赖 Wave 1）**
- E2E PowerShell 脚本增强与实测

**Wave 3**
- 覆盖率阈值、CI、测试手册

### 3.2 执行命令

```powershell
# Server
$env:DB_DIALECT='sqlite'
cd server
npm install
npm run test            # 全量
npx vitest run src/__tests__/services/device-monitor-subscriber.test.ts

# Admin
cd ../admin
npm install
# 先确保 package.json 有 "test": "vitest run"
npm run test

# Client
cd ../client
npm install
npm run test

# E2E（需要 server + Docker 基础设施）
cd ..
powershell -ExecutionPolicy Bypass -File .\e2e\dingtalk-login-flow.ps1
powershell -ExecutionPolicy Bypass -File .\e2e\video-upload-flow.ps1
powershell -ExecutionPolicy Bypass -File .\e2e\campaign-lifecycle-flow.ps1
powershell -ExecutionPolicy Bypass -File .\e2e\device-sync-flow.ps1
powershell -ExecutionPolicy Bypass -File .\e2e\dashboard-alert-flow.ps1
```

### 3.3 外部依赖与降级

| 依赖 | 用途 | 降级/Mock |
|---|---|---|
| Docker | E2E 真实基础设施 | 单测用 SQLite+Redis mock |
| 钉钉凭据 | 真实扫码 | `DINGTALK_APP_KEY` 空 → mock 模式；单元测试 mock `fetch` |
| 真实 MQTT broker | MQTT 遥测 E2E | 单元测试 mock `mqtt`；E2E 用 EMQX |
| MinIO | 上传/加密/分片 | 单测 mock minio；E2E 用真实 MinIO |
| Electron runtime | 渲染层集成 | jsdom + `window.electronAPI` mock；主进程 Node 测试 |

---

## 4. 成功标准

1. `server` `npm test` 通过，行覆盖率 ≥ 80%。
2. `admin` `npm test` 通过，行覆盖率 ≥ 60%。
3. `client` `npm test` 通过，行覆盖率 ≥ 60%。
4. Electron 主进程测试通过，行覆盖率 ≥ 70%。
5. E2E `dingtalk-login-flow.ps1` mock 模式通过；其余 PowerShell 流程通过。
6. 钉钉扫码链路（服务端 qrcode/callback/poll、客户端 useDingTalkAuth、E2E）均有明确 success/error/mock 用例。
7. 产出 `docs/plans/test-runbook.md`：命令、依赖、mock/real DingTalk 配置、排错。

---

## 5. 原子提交策略

```
test(server): add DingTalk GET callback and refresh/blacklist integration tests
test(server): add admin stores/devices extra route integration tests
test(server): add MQTT telemetry subscriber and sync-service key/segment tests
test(server): fix refreshAccessToken test and expand service coverage
test(admin): add package.json test script and Login/Dashboard component tests
test(admin): add Video/Campaign/Store/Device list and create tests
test(admin): add video/campaign stores and real router tests
test(client): add Login/Home/Player/SyncStatus view tests
test(client): add auth/sync/player stores and router tests
test(client): add electron main/sync-service/mqtt-bridge/preload tests
test(client): import real diff function in sync/diff.test.ts
test(e2e): harden dingtalk flow with GET callback and retry
test(e2e): add admin lockout and store CRUD flows
docs: add test-runbook and coverage thresholds
```

---

*计划完成。下一步：请确认本计划范围，或授权我按 Wave 1 开始实现测试代码。*
