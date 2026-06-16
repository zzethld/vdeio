# 连锁门店视频管理系统 — MVP 技术方案

> 版本：v1.2 | 日期：2026-06-10
> 基于多轮讨论确认，替代原执行计划中的 ARM/Syncthing/Widevine 方案

---

## 一、系统概述

**目标**：为 1000+ 连锁门店构建一个视频管理、加密分发、按需播放系统。

**核心流程**：
```
管理员上传视频 → 服务端加密存储 → 创建营销活动 → 关联视频 + 分配门店
                                                        ↓
店员钉钉扫码登录 → 看到所属活动的视频 → 点击播放（优先本地缓存）
```

**业务场景**：
- **高频日更**：每天约 10GB 新视频产生，同时几 GB 旧视频过期删除
- **营销活动驱动**：视频按"营销活动"分组（如活动A / 活动B / 活动C），每个活动关联一组视频 + 一批门店
- **同活动同内容**：同一活动下的所有门店看到完全相同的视频列表
- **生命周期管理**：活动有开始/结束时间，到期后视频自动从门店回收

**典型日流量模型**：
```
              每日新增          每日删除          边缘同步量
              ~10GB            ~几GB            1000门店 × 差异
              │                │                │
              └───── 全量加密 ──┘                │
                    │                           │
              MinIO + MySQL                     │
                    │                           │
                    └──── MQTT 推送变更 ─────────┘
                              │
                     各门店自动同步
                     下载新增 / 删除过期
```

**关键约束**（已确认）：
- 门店设备：普通 Windows PC（4-8GB RAM），有互联网，带宽和磁盘无限制
- 店员登录：钉钉扫码（个人账号，非一机一码）
- 播放模式：按需播放（培训/宣传视频），非数字标牌循环
- 离线播放：支持（密钥本地缓存 7 天）
- 加密方案：AES-128 HLS（MVP），后续可升级 ClearKey DRM

---

## 二、功能清单

### 2.1 管理后台（Web）

| 功能 | 说明 |
|------|------|
| 管理员登录 | 用户名 + 密码（bcrypt），错误 5 次锁定 15 分钟 |
| 视频上传 | 分片上传（支持断点续传），进度条显示 |
| 视频列表 | 分页、搜索、分类筛选、加密状态标签、所属活动标签 |
| 视频删除 | 删除视频 → 关联活动自动解除 → 门店缓存自动清理 |
| **营销活动管理** | **创建活动 → 关联视频（多选）→ 分配门店（按区域/按门店/全局）→ 设定时间段** |
| **活动生命周期** | **活动开始自动生效 → 活动结束自动回收 → 门店自动删除过期视频** |
| 分类管理 | 树形分类 CRUD |
| 门店管理 | 门店 CRUD、绑定设备、所属区域、启用/禁用 |
| 设备监控 | 在线状态、遥测数据（CPU/内存/磁盘/缓存大小）、同步进度、远程命令 |
| 数据看板 | 播放量趋势、设备在线率、活动热度、每日新增/删除量 |
| 告警 | 设备离线 >30 分钟、磁盘 >80%、同步失败 → 钉钉群机器人告警 |

### 2.2 门店客户端（Electron 桌面应用）

| 功能 | 说明 |
|------|------|
| 钉钉扫码登录 | 嵌入钉钉 JS SDK，扫码 → JWT → 存入 safeStorage |
| 自动登录 | 重启后 safeStorage 中有有效 token 则自动登录 |
| 视频列表 | 按当前生效的营销活动分组展示，活动内视频缩略图列表 |
| 活动切换 | 多个活动同时生效时，按活动 tab 切换浏览 |
| 视频播放 | Shaka Player 播放加密 HLS，播放控制，进度记忆 |
| 本地缓存（边缘存储） | 后台静默下载授权视频到本地磁盘，HTTP Range 断点续传 |
| 离线播放 | 密钥缓存 7 天，断网后本地缓存视频仍可播放 |
| **增量同步** | **每天自动同步：检测活动变更 → 下载新增视频 → 删除过期视频（支持断点续传）** |
| **同步状态提示** | **通知栏显示：正在下载 X/Y 个视频、同步完成、同步失败重试** |
| 断网数据缓存 | 播放日志 + 遥测数据本地队列缓存（48h），联网后批量上报 |
| 远程命令 | 通过 MQTT 接收：重启、强制同步、清理缓存、配置更新 |
| **磁盘空间管理** | **磁盘 >85% 暂停下载并告警，>95% LRU 删除最久未播放视频** |
| 安全加固 | 禁用 DevTools、上下文隔离、CSP、防截图、反调试 |

### 2.3 后端 API 服务

| 功能 | 说明 |
|------|------|
| 钉钉 OAuth | QR 码生成、回调处理、JWT 签发 |
| JWT 管理 | 签发 / 验证 / 刷新 / 黑名单（登出） |
| 视频管理 | CRUD、分片上传合并、加密触发、批量删除（级联清理活动关联和门店缓存） |
| 加密转码 | FFmpeg HLS 切片 + AES-128 加密，密钥 AES-256 加密存储 |
| 播放许可证 | 预签名 URL（绑定 deviceId + 24h 过期）+ 密钥下发（权限验证） |
| **营销活动管理** | **活动 CRUD → 关联视频 → 分配门店 → 时间段控制 → 活动状态机（草稿/进行中/已结束）** |
| **活动变更推送** | **活动发布/更新/结束时，通过 MQTT 推送通知到相关门店 → 触发增量同步** |
| **增量同步 API** | **门店上报本地视频版本号 → 服务端计算差异 → 返回需要下载/删除的视频清单** |
| 设备管理 | 注册、在线状态、遥测存储、远程命令下发 |
| 播放日志 | start/pause/resume/end/seek 事件记录 |
| 统计 API | 总览、播放趋势、设备在线趋势、活动维度统计 |

---

## 三、技术架构

### 3.1 整体架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                          云端中心层                               │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ API 服务      │  │ MinIO        │  │ EMQX 5.8              │  │
│  │ (Node.js)    │  │ (全量视频)    │  │ (设备管理通道)          │  │
│  │              │  │              │  │                        │  │
│  │ - 上传/加密   │  │ - HLS 文件    │  │ - 在线状态 (Will 遗嘱)  │  │
│  │ - 权限管理    │  │ - 预签名 URL  │  │ - 遥测数据接收          │  │
│  │ - 许可证发放  │  │ - 分片 ts     │  │ - 远程命令下发          │  │
│  │ - 播放日志    │  │ - 密钥文件    │  │ - Webhook 状态同步      │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬───────────┘  │
│         │                 │                       │              │
    │  ┌──────┴───────┐         │              ┌───────┴──────────┐   │
│  │ MySQL 8.0    │         │              │ Redis 7          │   │
│  │ - 11 张表    │         │              │ - 在线状态        │   │
│  │ - 密钥(加密)  │         │              │ - JWT 黑名单      │   │
│  └──────────────┘         │              │ - 遥测缓存        │   │
│                           │              │ - 同步任务队列     │   │
│                           │              └──────────────────┘   │
│                           │                                      │
└───────────────────────────┼──────────────────────────────────────┘
                            │
                   HTTPS (预签名 URL)
                   MQTT (设备通道)
                            │
┌───────────────────────────┼──────────────────────────────────────┐
│                   门店边缘节点（Windows PC）                       │
│                           │                                      │
│  ┌────────────────────────┴──────────────────────────────────┐   │
│  │ Electron 32 桌面应用                                       │   │
│  │                                                            │   │
│  │  ┌──────────────┐  ┌────────────────────────────────────┐ │   │
│  │  │ Vue3 前端     │  │ 后台同步服务                        │ │   │
│  │  │              │  │ (Worker Thread)                     │ │   │
│  │  │ - 钉钉扫码页  │  │                                    │ │   │
│  │  │ - 视频列表页  │  │ - 启动时同步授权列表                 │ │   │
│  │  │ - 播放器页    │  │ - HTTP Range 下载缺失视频           │ │   │
│  │  │ - 设置页     │  │ - 删除过期/无权视频                  │ │   │
│  │  └──────┬───────┘  │ - 断点续传                          │ │   │
│  │         │          └────────────────────────────────────┘ │   │
│  │         ▼                                                 │   │
│  │  ┌────────────────────────────────────────────────────┐   │   │
│  │  │ Shaka Player                                       │   │   │
│  │  │ 1. 检查本地缓存 → 有 → 直接播放                      │   │   │
│  │  │ 2. 无缓存 → 流式播放（同时后台下载）                  │   │   │
│  │  │ 3. 拦截密钥请求 → safeStorage 查缓存密钥             │   │   │
│  │  │ 4. 解密播放                                        │   │   │
│  │  └────────────────────────────────────────────────────┘   │   │
│  │                                                            │   │
│  │  ┌────────────────────┐  ┌────────────────────────────┐   │   │
│  │  │ 本地磁盘缓存        │  │ safeStorage (OS 级加密)    │   │   │
│  │  │ C:\VideoCache\     │  │                            │   │   │
│  │  │ ├── video_001\     │  │ - JWT Token               │   │   │
│  │  │ │   ├── .m3u8      │  │ - AES-128 密钥缓存 (7天)   │   │   │
│  │  │ │   ├── seg001.ts  │  │ - 设备 ID                 │   │   │
│  │  │ │   └── ...        │  │ - 播放进度                │   │   │
│  │  │ └── video_002\     │  └────────────────────────────┘   │   │
│  │  └────────────────────┘                                    │   │
│  └────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                      管理后台（Web 浏览器）                        │
│  Vue3 + Vite + ElementPlus + ECharts                             │
│  - 视频上传/授权/分类管理                                          │
│  - 门店/设备管理                                                   │
│  - 数据看板                                                       │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 技术栈总览

| 层级 | 技术选型 | 版本 | 许可证 | 用途 |
|------|---------|------|--------|------|
| **后端框架** | Node.js + Express + TypeScript | 18 + 4 + 5 | MIT | API 服务 |
| **数据库** | MySQL | 8.0 | GPL | 业务数据、加密密钥 |
| **缓存** | Redis | 7.x | BSD | 在线状态、JWT 黑名单、任务队列 |
| **对象存储** | MinIO | Latest | AGPLv3 | 视频文件存储（仅服务端内部） |
| **消息队列** | EMQX | 5.8 | Apache 2.0 | 设备通信、遥测、远程命令 |
| **视频加密** | FFmpeg + OpenSSL | 6.x | LGPL 2.1 | HLS 切片 + AES-128 加密 |
| **管理后台** | Vue3 + Vite + ElementPlus | 3.x | MIT | 管理界面 |
| **图表** | ECharts | 5.x | Apache 2.0 | 数据可视化 |
| **客户端框架** | Electron | 32.x | MIT | 桌面应用容器 |
| **客户端 UI** | Vue3 + Vite | 3.x | MIT | 用户界面 |
| **视频播放** | Shaka Player | 4.x | Apache 2.0 | HLS 播放 + 解密 |
| **客户端更新** | electron-updater | 6.x | MIT | 自动更新 |
| **容器化** | Docker Compose | - | Apache 2.0 | 服务端部署 |

**许可证风险**：无。MinIO AGPLv3 仅服务端内部使用，不对外分发，无商业风险。

---

## 四、功能技术实现详述

### 4.1 视频加密与保护

#### 4.1.1 加密方案：AES-128 HLS

```
上传视频（MP4）
     │
     ▼ FFmpeg
┌─────────────────────────────────────┐
│ ffmpeg -i input.mp4                 │
│   -hls_time 10                      │  ← 每个 ts 分片 10 秒
│   -hls_key_info_file key_info       │  ← 密钥信息文件
│   -hls_playlist_type vod            │  ← 点播类型
│   -hls_segment_filename "seg_%03d.ts"│
│   output.m3u8                       │
└─────────────────────────────────────┘
     │
     ▼ 输出
  output.m3u8     ← 播放清单（含 EXT-X-KEY 指向密钥 URL）
  seg_001.ts      ← 加密的视频分片
  seg_002.ts
  ...
```

**key_info 文件内容**：
```
https://api.example.com/api/v1/videos/{id}/key?device={deviceId}&token={jwt}   ← 密钥获取 URL
encrypt.key                                                                     ← 本地临时密钥文件路径
0x1234567890abcdef1234567890abcdef                                              ← IV（初始化向量）
```

**密钥管理**：
```
生成阶段：
  1. crypto.randomBytes(16) → 生成 128-bit AES 密钥
  2. AES-256 加密密钥（master_key 来自环境变量）→ 存入 MySQL video_keys 表
  3. master_key 不入库，仅存于环境变量 + 部署配置

分发阶段：
  1. 客户端播放 → Shaka Player 读取 m3u8 → 发现 EXT-X-KEY
  2. 请求密钥 URL（含 JWT + deviceId）
  3. 服务端验证：JWT 有效？设备有权限？时间段允许？
  4. 验证通过 → 解密密钥 → 返回 16 字节二进制
  5. Shaka Player 自动解密播放
```

**安全特性**：
| 特性 | 实现 |
|------|------|
| 传输安全 | HTTPS（TLS 1.2+） |
| 密钥保护 | 预签名 URL 绑定 deviceId，24h 过期 |
| 存储安全 | 密钥 AES-256 加密存 MySQL，master_key 仅环境变量 |
| 离线支持 | 密钥缓存至 Electron safeStorage（OS 级加密），7 天 TTL |
| 防拷贝 | safeStorage 绑定 OS 用户 + 机器，换设备无法解密 |
| 防篡改 | JWT 签名验证，密钥请求频率限制 |

#### 4.1.2 离线播放密钥管理

```javascript
// Electron main process: 密钥请求拦截
import { protocol } from 'electron';
import safeStorage from 'electron-safeStorage';

// 自定义协议拦截密钥请求
protocol.handle('https', async (request) => {
  if (request.url.includes('/api/v1/videos/') && request.url.includes('/key')) {
    
    // 1. 检查本地 safeStorage 缓存
    const cached = getFromSafeStorage(request.url);
    if (cached && !isExpired(cached, 7 * 24 * 60 * 60 * 1000)) {
      return new Response(cached.key, { status: 200 });
    }
    
    // 2. 缓存过期或不存在 → 尝试在线获取
    try {
      const response = await fetch(request);
      if (response.ok) {
        const key = await response.arrayBuffer();
        // 存入 safeStorage（OS 级加密）
        saveToSafeStorage(request.url, key);
        return new Response(key, { status: 200 });
      }
    } catch (e) {
      // 网络不可达
    }
    
    // 3. 离线 + 无缓存 → 播放失败，提示联网
    return new Response('License expired', { status: 403 });
  }
});
```

### 4.2 视频分发与边缘缓存

#### 4.2.1 分发架构

```
云端
  ┌──────────────┐    ┌────────────────────────────────────┐
  │ MinIO        │    │ API 服务                            │
  │ - HLS 文件    │    │ - 加密转码                          │
  │ - m3u8       │    │ - 权限验证                          │
  │ - ts 分片     │    │ - /api/v1/videos/:id/playlist      │
  └──────┬───────┘    │   → 返回 m3u8（含认证端点 ts URL）   │
         │            │ - /api/v1/videos/:id/segment/:seq  │
         │            │   → 验证 JWT + 权限 → 返回 ts 数据   │
         │            └────────────────────────────────────┘
         │                           │
         │ HTTPS（预签名 URL）        │ HTTPS（认证端点）
         │ （仅 m3u8 + 封面图）       │ （所有 ts 分片请求）
         │                           │
         ▼                           ▼
门店 PC 本地磁盘（边缘缓存）
  C:\VideoCache\
    ├── campaign_001\              ← 按活动组织
    │   ├── video_101\
    │   │   ├── playlist.m3u8     ← m3u8 中 ts URL 指向认证端点
    │   │   ├── seg_000.ts        ← 本地缓存的分片
    │   │   └── ...
    │   └── video_102\
    │       └── ...
    └── .sync_state.json           ← 同步状态文件（已缓存视频清单）
```

**设计说明**：
- **m3u8 文件**：MinIO 预签名 URL（24h 过期）或公开 bucket
- **ts 分片**：通过 API 认证端点下载（`/api/v1/videos/{id}/segment/{seq}`），每次请求验证 JWT + 设备权限
- **防盗链逻辑**：即使 m3u8 被泄露，ts 分片仍需有效 JWT 和设备绑定才能获取

**高频日更同步策略**：

每天 ~10GB 新增 + 几 GB 删除，1000 门店，意味着同步服务是**核心高频模块**。

| 触发时机 | 动作 | 频率 |
|---------|------|------|
| 应用启动 | 增量同步：上报本地已缓存视频清单 → 服务端返回差异 → 下载/删除 | 每天 1 次 |
| MQTT 推送 | 收到活动变更通知（新增/删除/活动到期）→ 立即同步 | 实时（每天可能多次） |
| 定时检查 | 检查是否有活动即将到期 → 预删除 | 每 2 小时 |
| 播放时无缓存 | 流式播放（通过认证端点逐个获取 ts）+ 同时后台下载 | 按需 |

**增量同步协议（方案 A：客户端上报本地清单）**：

```
客户端                               服务端
  │                                    │
  │ POST /api/v1/devices/me/sync       │
  │   { cachedVideoIds: [101, 102] }   │  ← 上报本地已缓存的视频 ID 列表
  │───────────────────────────────────>│    （gzip 压缩，通常 < 1KB）
  │                                    │
  │ {                                  │
  │   downloads: [                     │  ← 需要下载的
  │     { videoId, playlistUrl,        │
  │       size, campaignId }           │
  │   ],                               │
  │   deletes: [                       │  ← 需要删除的
  │     { videoId, campaignId }        │
  │   ]                                │
  │ }                                  │
  │<───────────────────────────────────│
  │                                    │
  │ 逐个下载/删除                       │
```

**关键设计**：服务端根据门店当前应缓存的视频集合（由活动关联计算）与客户端上报的 `cachedVideoIds` 做 Set 差集，返回差异。无需版本号，逻辑简单可靠。

**带宽估算**：
```
每日新增：~10GB
1000 门店下载：10GB × 1000 = 10TB/天
假设并发下载 3 个视频，单个视频 500MB：
  每门店下载时间 ≈ 10GB ÷ (3 × 5MB/s) ≈ 11 分钟
  1000 门店错峰（MQTT 推送延迟随机 0-30 分钟）：30 分钟内全部完成
  云端出口带宽需求 ≈ 10TB ÷ 86400s ≈ 120MB/s ≈ 1Gbps
```

> 云端带宽 1Gbps 是基线要求，建议 2Gbps 或使用 CDN 加速下载。

#### 4.2.2 同步服务实现（方案 A：客户端上报本地清单）

```javascript
// 后台同步服务（Electron Worker Thread）
class SyncService {
  constructor() {
    this.SYNC_STATE_FILE = path.join(VIDEO_CACHE_DIR, '.sync_state.json');
  }

  async sync() {
    // 0. 磁盘空间检查
    const diskUsage = await getDiskUsage(VIDEO_CACHE_DIR);
    if (diskUsage > 95) {
      // 磁盘满了 → LRU 删除最久未播放的视频
      await this.evictLRU();
    } else if (diskUsage > 85) {
      // 磁盘告警 → 暂停下载，上报告警
      mqttClient.publish(`vdeio/device/${deviceId}/telemetry`, 
        JSON.stringify({ alert: 'disk_full_warning', usage: diskUsage }));
      return;
    }
    
    // 1. 扫描本地已缓存的视频 ID 列表
    const cachedVideoIds = await this.scanLocalVideos();
    
    // 2. 请求增量差异（上报本地清单）
    const diff = await api.post('/api/v1/devices/me/sync', {
      cachedVideoIds: cachedVideoIds  // 通常 < 1000 个，gzip 后 < 1KB
    }, {
      headers: { 'Content-Encoding': 'gzip' }
    });
    
    if (diff.downloads.length === 0 && diff.deletes.length === 0) {
      return; // 无变化
    }
    
    // 3. 下载新增视频（并发 3 个）
    await pMap(diff.downloads, v => this.downloadVideo(v), { concurrency: 3 });
    
    // 4. 删除过期视频
    for (const item of diff.deletes) {
      const dir = path.join(VIDEO_CACHE_DIR, `campaign_${item.campaignId}`, `video_${item.videoId}`);
      await fs.rm(dir, { recursive: true }).catch(() => {});
      // 如果活动目录为空，也删除
      const campaignDir = path.join(VIDEO_CACHE_DIR, `campaign_${item.campaignId}`);
      const files = await fs.readdir(campaignDir).catch(() => null);
      if (files && files.length === 0) {
        await fs.rm(campaignDir, { recursive: true });
      }
    }
    
    // 5. 更新本地状态
    const state = await this.loadState();
    state.lastSyncAt = Date.now();
    state.syncedCount = cachedVideoIds.length + diff.downloads.length - diff.deletes.length;
    await this.saveState(state);
    
    // 6. 通知渲染进程更新视频列表
    mainWindow.webContents.send('sync-complete', diff);
  }
  
  async scanLocalVideos() {
    const videoIds = [];
    const campaigns = await fs.readdir(VIDEO_CACHE_DIR).catch(() => []);
    for (const campaignDir of campaigns) {
      if (!campaignDir.startsWith('campaign_')) continue;
      const videos = await fs.readdir(path.join(VIDEO_CACHE_DIR, campaignDir)).catch(() => []);
      for (const videoDir of videos) {
        if (videoDir.startsWith('video_')) {
          videoIds.push(parseInt(videoDir.replace('video_', '')));
        }
      }
    }
    return videoIds;
  }
  
  async downloadVideo(video) {
    const dir = path.join(VIDEO_CACHE_DIR, `campaign_${video.campaignId}`, `video_${video.id}`);
    await fs.mkdir(dir, { recursive: true });
    
    // 下载 m3u8（MinIO 预签名 URL）
    const playlist = await fetch(video.playlistUrl);
    await fs.writeFile(path.join(dir, 'playlist.m3u8'), await playlist.text());
    
    // 解析 m3u8 获取分片列表
    const segments = parseM3U8(playlist).segments;
    
    // 下载所有 ts 分片（通过认证端点，支持断点续传）
    for (const seg of segments) {
      // seg.url 是认证端点 /api/v1/videos/{id}/segment/{seq}
      await this.downloadWithResume(seg.url, path.join(dir, seg.filename));
    }
    
    // 通知渲染进程下载进度
    mainWindow.webContents.send('download-progress', {
      videoId: video.id, status: 'done', size: video.size
    });
  }
  
  async downloadWithResume(url, filePath) {
    const stat = await fs.stat(filePath).catch(() => null);
    const headers = {};
    if (stat) headers['Range'] = `bytes=${stat.size}-`;  // 断点续传
    
    // 认证端点请求需要携带 JWT
    const response = await fetch(url, { 
      headers: { ...headers, Authorization: `Bearer ${getStoredJWT()}` }
    });
    const fileStream = createWriteStream(filePath, { flags: 'a' });
    await pipeline(response.body, fileStream);
  }
  
  async loadState() {
    const data = await fs.readFile(this.SYNC_STATE_FILE, 'utf-8').catch(() => '{}');
    return JSON.parse(data);
  }
  
  async saveState(state) {
    await fs.writeFile(this.SYNC_STATE_FILE, JSON.stringify(state, null, 2));
  }
  
  // LRU 淘汰：删除最久未播放的视频，释放空间到 80%
  async evictLRU() {
    // 扫描所有本地视频，按最后播放时间排序
    const videos = await this.scanLocalVideosWithAccessTime();
    videos.sort((a, b) => a.lastPlayedAt - b.lastPlayedAt);
    
    let freed = 0;
    const target = getTotalCacheSize() * 0.2;  // 目标释放 20% 空间
    
    for (const video of videos) {
      if (freed >= target) break;
      const dir = path.join(VIDEO_CACHE_DIR, `campaign_${video.campaignId}`, `video_${video.id}`);
      const size = await getDirSize(dir);
      await fs.rm(dir, { recursive: true }).catch(() => {});
      freed += size;
      
      // 通知服务端该视频已被本地删除
      api.post('/api/v1/devices/me/evict', { videoId: video.id });
    }
    
    mainWindow.webContents.send('evict-complete', { freedBytes: freed });
  }
}
```

#### 4.2.3 服务端差异计算

```javascript
// 服务端：增量同步差异计算
async function calculateSyncDiff(storeId, cachedVideoIds) {
  // 1. 查询该门店当前应缓存的视频集合
  const shouldCache = await db.query(`
    SELECT DISTINCT v.id, v.file_size, cv.campaign_id
    FROM videos v
    JOIN campaign_videos cv ON v.id = cv.video_id
    JOIN campaigns c ON cv.campaign_id = c.id
    JOIN campaign_stores cs ON cs.campaign_id = c.id
    WHERE cs.store_id = ?
      AND c.status = 'active'
      AND NOW() BETWEEN c.start_time AND c.end_time
  `, [storeId]);
  
  const shouldSet = new Set(shouldCache.map(v => v.id));
  const cachedSet = new Set(cachedVideoIds);
  
  // 2. 计算差异
  const downloads = shouldCache
    .filter(v => !cachedSet.has(v.id))
    .map(v => ({
      videoId: v.id,
      playlistUrl: getMinioPresignedUrl(v.id),  // m3u8 预签名 URL
      size: v.file_size,
      campaignId: v.campaign_id
    }));
  
  const deletes = [...cachedSet]
    .filter(id => !shouldSet.has(id))
    .map(id => ({ videoId: id, campaignId: null }));  // 可省略 campaignId
  
  return { downloads, deletes };
}
```

#### 4.2.4 MQTT 活动变更推送

```javascript
// 服务端：活动变更时推送
async function onCampaignChange(campaignId, storeIds) {
  // 直接通过 MQTT 通知相关门店的在线设备
  for (const storeId of storeIds) {
    const devices = await db.query(
      'SELECT device_id FROM devices WHERE store_id = ? AND status = "online"',
      [storeId]
    );
    for (const device of devices) {
      mqttClient.publish(
        `vdeio/device/${device.device_id}/sync`,
        JSON.stringify({ type: 'incremental', campaignId, ts: Date.now() }),
        { qos: 1 }
      );
    }
  }
}

// 活动到期自动处理（定时任务，每分钟检查）
async function checkExpiredCampaigns() {
  const expired = await db.query(
    'SELECT id FROM campaigns WHERE status = "active" AND end_time < NOW()'
  );
  for (const campaign of expired) {
    await db.query('UPDATE campaigns SET status = "ended" WHERE id = ?', [campaign.id]);
    const storeIds = await getStoresForCampaign(campaign.id);
    await onCampaignChange(campaign.id, storeIds);  // 触发增量同步 → 门店自动删除
  }
}
```

### 4.3 钉钉扫码登录

```
┌──────────┐         ┌──────────┐         ┌──────────┐
│ Electron │         │ 后端 API  │         │  钉钉    │
│ 客户端    │         │          │         │  OAuth   │
└────┬─────┘         └────┬─────┘         └────┬─────┘
     │                    │                    │
     │ 1. GET /auth/      │                    │
     │    dingtalk/qrcode │                    │
     │───────────────────>│                    │
     │                    │                    │
     │ 2. 返回 QR URL     │                    │
     │    + state         │                    │
     │<───────────────────│                    │
     │                    │                    │
     │ 3. 渲染二维码       │                    │
     │ (钉钉 JS SDK)      │                    │
     │                    │                    │
     │ 4. 轮询            │                    │
     │ GET /auth/         │                    │
     │ poll?state=xxx     │                    │
     │───────────────────>│                    │
     │                    │                    │
     │                    │ 5. 店员扫码        │
     │                    │    钉钉回调        │
     │                    │ POST /auth/        │
     │                    │ dingtalk/callback  │
     │                    │<───────────────────│
     │                    │                    │
     │                    │ 6. authCode 换     │
     │                    │    accessToken     │
     │                    │───────────────────>│
     │                    │                    │
     │                    │ 7. 返回用户信息     │
     │                    │<───────────────────│
     │                    │                    │
     │                    │ 8. 查询用户门店绑定  │
     │                    │    生成 JWT         │
     │                    │                    │
     │ 9. 轮询返回 JWT    │                    │
     │<───────────────────│                    │
     │                    │                    │
     │ 10. JWT 存入       │                    │
     │     safeStorage    │                    │
     │     跳转视频列表    │                    │
```

**技术实现**：
- 钉钉扫码登录使用**企业内部应用**模式
- 后端通过 `state` 参数关联请求（存 Redis，5 分钟过期）
- JWT payload：`{ userId, storeId, deviceId, role, exp, iat }`
- 双 token：accessToken（2h）+ refreshToken（7d）

#### 4.3.1 设备与门店自动绑定（方案 C：钉钉扫码绑定）

```
首次安装 → 设备注册 → 状态"未绑定" → 店员扫码登录
                                              ↓
  登录成功，JWT 包含 storeId ─────────────────→ 设备自动绑定该门店
                                              ↓
                                    后续登录：直接读取已绑定的 storeId
```

**实现细节**：
- 设备首次注册时调用 `POST /api/v1/devices/register`，返回 deviceId + deviceToken
- 设备状态为 `unbound`（未绑定门店）
- 店员首次钉钉扫码登录 → 后端在 JWT payload 中放入 `storeId`
- 客户端收到 JWT → 调用 `POST /api/v1/devices/me/bind` 上报 storeId
- 后端将设备与该 storeId 绑定，状态变为 `bound`
- 后续登录：设备自动从 JWT 获取 storeId，无需再次绑定

**特殊情况处理**：
- 设备已绑定，但登录店员属于不同门店 → 提示"当前设备已绑定 XXX 门店，请联系管理员"
- 设备绑定错误 → 管理员在后台"设备管理"页面手动重新分配门店
- 硬件变更导致 deviceId 变化 → 视为新设备，需要重新绑定
```

### 4.4 设备管理（EMQX）

#### 4.4.1 MQTT 主题设计

```
vdeio/device/{deviceId}/telemetry     ← 设备遥测上报（QoS 0）
vdeio/device/{deviceId}/status        ← 在线状态（Retain，Will 遗嘱）
vdeio/device/{deviceId}/command       ← 远程命令下发（QoS 1）
vdeio/device/{deviceId}/response      ← 命令响应（QoS 1）
vdeio/device/{deviceId}/sync          ← 增量同步通知（QoS 1）
vdeio/campaign/{campaignId}/update    ← 活动变更广播（门店订阅自己的活动）
```

#### 4.4.2 设备认证

```javascript
// EMQX 内置数据库认证（MySQL）
// 查询：SELECT password FROM devices WHERE device_id = ${clientid}
// 密码：bcrypt hash，设备注册时生成

// 客户端连接：
mqtt.connect('mqtts://broker.example.com:8883', {
  clientId: deviceId,
  username: deviceId,
  password: deviceToken,  // 注册时获取的 token
  clean: true,
  will: {
    topic: `vdeio/device/${deviceId}/status`,
    payload: JSON.stringify({ status: 'offline', ts: Date.now() }),
    qos: 1,
    retain: true
  }
});
```

#### 4.4.3 遥测与远程命令

```javascript
// 遥测上报（每 5 分钟）
const telemetry = {
  cpu: os.cpus().loadavg(),
  memory: { total: os.totalmem(), free: os.freemem() },
  disk: getDiskUsage(),
  network: getNetworkInfo(),
  cacheSize: getCacheSize(),
  version: app.getVersion(),
  ts: Date.now()
};

// 断网保护：先存本地队列，联网后批量上报
localQueue.push({ type: 'telemetry', data: telemetry });
if (isOnline()) {
  flushLocalQueue();  // 批量上报本地缓存的所有数据
} else {
  // 保留最近 48h 的数据，超期自动清理
  localQueue.trim(48 * 60 * 60 * 1000);
}

// 远程命令处理
mqttClient.subscribe(`vdeio/device/${deviceId}/command`);
mqttClient.on('message', (topic, message) => {
  const cmd = JSON.parse(message);
  switch (cmd.type) {
    case 'restart': app.relaunch(); app.exit(); break;
    case 'sync': syncService.sync(); break;
    case 'clear-cache': fs.rmSync(VIDEO_CACHE_DIR, { recursive: true }); break;
  }
  // 响应
  mqttClient.publish(`vdeio/device/${deviceId}/response`, 
    JSON.stringify({ cmdId: cmd.id, status: 'done' }));
});
```

### 4.5 数据库设计（11 张表）

```sql
-- 用户表
CREATE TABLE users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  dingtalk_id VARCHAR(64) UNIQUE,       -- 钉钉用户 ID
  name VARCHAR(64),
  phone VARCHAR(20),
  avatar VARCHAR(256),
  role ENUM('admin', 'operator') DEFAULT 'operator',
  status TINYINT DEFAULT 1,             -- 1 启用 0 禁用
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 门店表
CREATE TABLE stores (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(128),
  code VARCHAR(32) UNIQUE,              -- 门店编码
  region VARCHAR(64),                    -- 区域
  address VARCHAR(256),
  status TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 用户-门店绑定
CREATE TABLE user_store_bindings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT REFERENCES users(id),
  store_id BIGINT REFERENCES stores(id),
  UNIQUE KEY (user_id, store_id)
);

-- 设备表
CREATE TABLE devices (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_id VARCHAR(64) UNIQUE,          -- 设备唯一 ID
  store_id BIGINT REFERENCES stores(id),
  device_name VARCHAR(128),
  os_version VARCHAR(64),
  app_version VARCHAR(32),
  last_online_at TIMESTAMP,
  status ENUM('online', 'offline') DEFAULT 'offline',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 视频表
CREATE TABLE videos (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(256),
  description TEXT,
  category_id BIGINT,
  duration INT,                          -- 秒
  file_size BIGINT,                      -- 字节
  resolution VARCHAR(16),
  original_url VARCHAR(512),             -- MinIO 原始文件 URL
  hls_url VARCHAR(512),                  -- MinIO 加密 HLS URL
  cover_url VARCHAR(512),                -- 封面图
  encrypt_status ENUM('pending', 'encrypting', 'done', 'failed') DEFAULT 'pending',
  created_by BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 视频密钥表
CREATE TABLE video_keys (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  video_id BIGINT UNIQUE REFERENCES videos(id),
  key_id VARCHAR(64),                    -- 密钥 ID
  encrypted_key VARCHAR(256),            -- AES-256 加密后的密钥
  iv VARCHAR(64),                        -- 初始化向量
  status ENUM('active', 'expired', 'rotated') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ★ 营销活动表（核心业务实体）
CREATE TABLE campaigns (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(256),                    -- 活动名称，如"2026暑期促销"
  description TEXT,                      -- 活动说明
  status ENUM('draft', 'active', 'ended', 'archived') DEFAULT 'draft',
  start_time TIMESTAMP NOT NULL,         -- 活动开始时间
  end_time TIMESTAMP NOT NULL,           -- 活动结束时间
  created_by BIGINT,                     -- 创建人
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status_time (status, start_time, end_time)
);

-- ★ 活动-视频关联表（一个活动包含多个视频）
CREATE TABLE campaign_videos (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  campaign_id BIGINT REFERENCES campaigns(id),
  video_id BIGINT REFERENCES videos(id),
  sort_order INT DEFAULT 0,              -- 活动内视频排序
  UNIQUE KEY (campaign_id, video_id)
);

-- ★ 活动-门店关联表（一个活动推送给多个门店）
CREATE TABLE campaign_stores (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  campaign_id BIGINT REFERENCES campaigns(id),
  store_id BIGINT REFERENCES stores(id),
  UNIQUE KEY (campaign_id, store_id)
);

-- 分类表
CREATE TABLE categories (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(64),
  parent_id BIGINT REFERENCES categories(id),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 播放日志表
CREATE TABLE play_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT,
  video_id BIGINT,
  campaign_id BIGINT,                    -- ★ 记录从哪个活动播放
  device_id BIGINT,
  store_id BIGINT,
  event ENUM('start', 'pause', 'resume', 'end', 'seek'),
  position INT,                          -- 播放位置（秒）
  duration INT,                          -- 视频总长
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_video_time (video_id, created_at),
  INDEX idx_store_time (store_id, created_at),
  INDEX idx_campaign_time (campaign_id, created_at)
);

-- 管理员表
CREATE TABLE admins (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(64) UNIQUE,
  password_hash VARCHAR(256),            -- bcrypt
  name VARCHAR(64),
  role ENUM('super_admin', 'admin') DEFAULT 'admin',
  login_fail_count INT DEFAULT 0,
  locked_until TIMESTAMP NULL,
  status TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**权限模型变更说明**：

```
原方案：video_auth 表（视频 ← 直接授权 → 门店）
新方案：campaign 表（视频 → 活动 → 门店，两级关联）

好处：
  1. 管理员按"活动"维度操作，不需要逐个视频授权
  2. 活动结束 → 自动回收所有关联视频 → 门店自动删除
  3. 门店看到的视频 = 所有进行中活动中关联的视频合集
  4. 新增/删除视频只需修改活动，MQTT 推送一次变更通知

查询示例（门店看到的视频列表）：
  SELECT DISTINCT v.* FROM videos v
  JOIN campaign_videos cv ON v.id = cv.video_id
  JOIN campaigns c ON cv.campaign_id = c.id
  JOIN campaign_stores cs ON cs.campaign_id = c.id
  WHERE cs.store_id = {storeId}
    AND c.status = 'active'
    AND NOW() BETWEEN c.start_time AND c.end_time
```

---

## 五、安全设计

### 5.1 安全层级

```
┌─────────────────────────────────────────┐
│ L1. 传输安全                             │
│   HTTPS (TLS 1.2+)                      │
│   MQTTS (TLS 双向认证)                   │
├─────────────────────────────────────────┤
│ L2. 内容安全                             │
│   AES-128 HLS 加密                      │
│   密钥 AES-256 加密存储                  │
│   预签名 URL 绑定 deviceId + 24h 过期    │
├─────────────────────────────────────────┤
│ L3. 客户端安全                           │
│   Electron safeStorage (OS 级加密)       │
│   上下文隔离 + 沙箱                      │
│   CSP 策略                              │
│   禁用 DevTools                         │
│   防截图 setContentProtection           │
│   反调试检测                             │
├─────────────────────────────────────────┤
│ L4. 身份与权限                           │
│   JWT (HS512, 2h 过期)                  │
│   Refresh Token (7d 过期)               │
│   API 频率限制 (20s/10次)               │
│   管理员错误锁定 (5次/15min)             │
│   设备 ID 绑定                          │
└─────────────────────────────────────────┘
```

### 5.2 已知安全边界

| 威胁 | 防护 | 残余风险 |
|------|------|---------|
| 普通店员拷贝视频文件 | ✅ AES-128 加密，无密钥打不开 | 无 |
| 拷贝整个缓存目录到其他 PC | ✅ safeStorage 绑定 OS 用户 + 机器 | 无 |
| 网络抓包获取密钥 | ✅ HTTPS + 预签名 URL | 无 |
| 录屏 | ❌ 任何方案都无法防止 | 接受（非目标） |
| 有技术能力者 dump 内存密钥 | ⚠️ AES-128 密钥在内存中短暂存在 | 中等（需专业技能） |
| 逆向 Electron 代码 | ⚠️ 混淆 + asar 加密 + context isolation | 中等（需专业技能） |

**后续升级路径**（MVP 之后）：
- 升级到 ClearKey DRM（W3C EME）→ 密钥不经过 JavaScript，浏览器内核管理
- 升级到 Widevine L3（需 Google 认证）→ 更强内存保护

---

## 六、API 接口清单

### 6.1 认证相关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/auth/dingtalk/qrcode` | 获取钉钉扫码 QR URL |
| POST | `/api/v1/auth/dingtalk/callback` | 钉钉回调 |
| GET | `/api/v1/auth/poll?state=xxx` | 轮询扫码结果 |
| POST | `/api/v1/auth/refresh` | 刷新 JWT |
| POST | `/api/v1/auth/logout` | 登出（JWT 黑名单） |
| POST | `/api/v1/admin/auth/login` | 管理员登录 |

### 6.2 视频相关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/videos/list` | 授权视频列表（分页+筛选） |
| GET | `/api/v1/videos/:id` | 视频详情 |
| GET | `/api/v1/videos/:id/playlist` | 获取 HLS 播放清单（预签名 URL） |
| GET | `/api/v1/videos/:id/key` | 获取 AES-128 密钥（权限验证） |
| POST | `/api/v1/videos/report-play` | 播放日志上报 |

### 6.3 管理后台

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/admin/videos/upload/init` | 初始化分片上传 |
| POST | `/api/v1/admin/videos/upload/chunk` | 上传分片 |
| POST | `/api/v1/admin/videos/upload/complete` | 合并分片 |
| PUT | `/api/v1/admin/videos/:id` | 编辑视频信息 |
| DELETE | `/api/v1/admin/videos/:id` | 删除视频（级联清理活动关联和门店缓存） |
| GET/POST | `/api/v1/admin/campaigns` | 营销活动列表 / 创建活动 |
| GET/PUT/DELETE | `/api/v1/admin/campaigns/:id` | 活动详情 / 编辑 / 删除 |
| POST | `/api/v1/admin/campaigns/:id/videos` | 活动关联视频（批量） |
| DELETE | `/api/v1/admin/campaigns/:id/videos/:videoId` | 取消视频关联 |
| POST | `/api/v1/admin/campaigns/:id/stores` | 活动分配门店（批量，支持按区域） |
| DELETE | `/api/v1/admin/campaigns/:id/stores/:storeId` | 取消门店分配 |
| POST | `/api/v1/admin/campaigns/:id/publish` | 发布活动（触发门店同步） |
| POST | `/api/v1/admin/campaigns/:id/end` | 手动结束活动（触发门店清理） |
| GET/POST/PUT/DELETE | `/api/v1/admin/stores/*` | 门店 CRUD |
| GET/POST/PUT/DELETE | `/api/v1/admin/categories/*` | 分类 CRUD |
| GET | `/api/v1/admin/statistics/*` | 统计数据（含活动维度） |

### 6.4 设备相关

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/devices/register` | 设备注册 |
| GET | `/api/v1/devices/me/videos` | 当前设备授权视频列表（按活动分组） |
| POST | `/api/v1/devices/me/sync` | 增量同步（上报本地清单 → 返回差异） |
| POST | `/api/v1/devices/me/bind` | 设备绑定门店（首次登录后） |
| GET | `/api/v1/videos/:id/segment/:seq` | 获取 ts 分片（认证端点，验证 JWT + 权限） |
| GET | `/api/v1/admin/devices` | 设备列表 |
| POST | `/api/v1/admin/devices/:id/command` | 下发远程命令（含强制同步） |
| GET | `/api/v1/admin/devices/:id/telemetry` | 设备遥测数据 |

---

## 七、项目结构

```
vdeio/
├── deploy/                          # 部署配置
│   ├── docker-compose.yml           # MySQL + Redis + MinIO + EMQX
│   ├── mysql/
│   │   └── my.cnf
│   └── emqx/
│       └── emqx.conf
│
├── server/                          # 后端 API
│   ├── package.json
│   ├── tsconfig.json
│   ├── migrations/
│   │   └── 001_create_tables.sql
│   └── src/
│       ├── app.ts                   # Express 入口
│       ├── config/
│       │   ├── database.ts          # MySQL 连接池
│       │   ├── redis.ts             # Redis 客户端
│       │   ├── minio.ts             # MinIO 客户端
│       │   └── emqx.ts              # EMQX HTTP API
│       ├── middleware/
│       │   ├── auth.ts              # JWT 验证
│       │   ├── admin-auth.ts        # 管理员验证
│       │   └── rate-limit.ts        # 频率限制
│       ├── routes/
│       │   ├── auth.ts              # 认证路由
│       │   ├── video.ts             # 视频路由（客户端）
│       │   ├── admin/
│       │   │   ├── auth.ts          # 管理员认证
│       │   │   ├── video.ts         # 视频管理
│       │   │   ├── campaign.ts      # ★ 营销活动管理
│       │   │   ├── store.ts         # 门店管理
│       │   │   ├── category.ts      # 分类管理
│       │   │   ├── device.ts        # 设备管理
│       │   │   └── statistics.ts    # 统计
│       │   └── device.ts            # 设备注册 + 同步
│       ├── services/
│       │   ├── dingtalk.ts          # 钉钉 SDK
│       │   ├── encryption.ts        # AES-128 加密
│       │   ├── upload.ts            # 分片上传
│       │   ├── key-manager.ts       # 密钥管理
│       │   ├── campaign.ts      # ★ 活动服务（生命周期 + 变更推送）
│       │   ├── sync-service.ts    # ★ 增量同步差异计算
│       │   ├── device-monitor.ts    # 设备监控
│       │   ├── alert.ts             # 告警
│       │   └── mqtt-publisher.ts    # MQTT 发布
│       ├── utils/
│       │   └── jwt.ts               # JWT 工具
│       └── models/                  # 数据模型
│           ├── user.ts
│           ├── store.ts
│           ├── video.ts
│           ├── device.ts
│           └── ...
│
├── admin/                           # 管理后台
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.ts
│       ├── App.vue
│       ├── router/
│       ├── stores/
│       ├── views/
│       │   ├── Login.vue
│       │   ├── Dashboard.vue
│       │   ├── campaign/
│       │   │   ├── CampaignList.vue    # ★ 活动列表
│       │   │   ├── CampaignCreate.vue  # ★ 创建/编辑活动
│       │   │   └── CampaignDetail.vue  # ★ 活动详情（关联视频+门店）
│       │   ├── video/
│       │   │   ├── VideoList.vue
│       │   │   └── VideoUpload.vue
│       │   ├── store/
│       │   ├── device/
│       │   └── alert/
│       ├── components/
│       └── utils/
│           └── request.ts           # Axios 封装
│
├── client/                          # Electron 客户端
│   ├── package.json
│   ├── electron-builder.yml
│   ├── electron/
│   │   ├── main.ts                  # Electron 主进程
│   │   ├── preload.ts               # 预加载脚本
│   │   ├── security.ts              # 安全策略
│   │   ├── sync-service.ts          # 后台同步服务
│   │   ├── key-interceptor.ts       # 密钥请求拦截
│   │   ├── mqtt-bridge.ts           # MQTT 桥接
│   │   └── update-handler.ts        # 自动更新
│   └── src/                         # Vue3 渲染进程
│       ├── main.ts
│       ├── App.vue
│       ├── views/
│       │   ├── Login.vue
│       │   ├── VideoList.vue           # 按活动 tab 分组展示
│       │   ├── Player.vue
│       │   ├── Settings.vue
│       │   └── SyncStatus.vue          # ★ 同步状态页（下载进度、缓存大小）
│       ├── composables/
│       │   ├── usePlayer.ts         # Shaka Player 封装
│       │   ├── useDingTalkAuth.ts
│       │   └── useNetworkStatus.ts
│       ├── stores/
│       │   ├── auth.ts
│       │   └── videos.ts
│       └── services/
│           ├── api.ts
│           └── license.ts
│
└── docs/                            # 文档
    └── MVP技术方案.md               # 本文档
```

---

## 八、MVP 4 周开发计划

### Week 1：基础设施 + 核心后端

| 任务 | 内容 | 技术点 |
|------|------|--------|
| T01 | Docker Compose 部署 MySQL + Redis + MinIO + EMQX | Docker Compose、各组件配置 |
| T02 | 后端项目骨架 + 12 张数据库表 | Node.js + Express + TypeScript、MySQL DDL |
| T03 | JWT 工具 + 认证中间件 + 频率限制 | JWT (HS512)、bcrypt、express-rate-limit |
| T04 | 钉钉 OAuth 扫码登录 | 钉钉开放平台 SDK、Redis state 存储 |

### Week 2：视频加密 + 活动管理 + 播放 API

| 任务 | 内容 | 技术点 |
|------|------|--------|
| T05 | FFmpeg HLS 切片 + AES-128 加密 Worker | FFmpeg、crypto.randomBytes、AES-256 密钥加密 |
| T06 | 视频播放 API（预签名 URL + 密钥下发） | MinIO presignedUrl、权限验证、密钥解密返回 |
| T07 | **营销活动 CRUD + 生命周期管理** | **活动状态机（draft/active/ended）、定时检查过期活动** |
| T08 | **增量同步 API + MQTT 变更推送** | **客户端上报清单 → 服务端计算差异、MQTT 推送、ts 认证端点** |
| T09 | 管理后台 Vue3 框架 + 视频上传 + **活动管理页** | Vue3 + ElementPlus、分片上传、活动创建/编辑 |

### Week 3：Electron 客户端

| 任务 | 内容 | 技术点 |
|------|------|--------|
| T10 | Electron + Vue3 客户端框架 + 安全加固 | Electron 32、contextIsolation、CSP、防截图 |
| T11 | 钉钉扫码登录 + **按活动分组的视频列表** | 钉钉 JS SDK、safeStorage、活动 tab 切换 |
| T12 | Shaka Player 加密视频播放 + 密钥拦截 | Shaka Player、protocol.handle、safeStorage 密钥缓存 |
| T13 | **增量同步服务 + 同步状态页** | **Worker Thread、版本号同步、HTTP Range 断点续传、进度 UI** |

### Week 4：联调 + 交付

| 任务 | 内容 | 技术点 |
|------|------|--------|
| T14 | EMQX 设备遥测 + 远程命令 + 活动推送测试 | MQTT.js、Will 遗嘱、QoS、Retain |
| T15 | 3-5 台门店 PC 全流程联调 | 端到端：上传→活动→同步→播放→到期删除 |
| T16 | 部署文档 + 演示环境 | 安装包、部署脚本、用户手册 |

---

## 九、与原方案的差异

| 项目 | 原方案 | 当前 MVP | 变更原因 |
|------|--------|---------|---------|
| 加密 | Widevine DRM | AES-128 HLS | Widevine 需 Google 认证，不可行 |
| 分发 | Syncthing P2P | HTTP 直下载 | 1000 节点 hub-and-spoke 不适合 |
| 边缘设备 | ARM 盒子 | Windows PC | 用户实际环境是普通 PC |
| 客户端安全 | Widevine L1 | safeStorage + AES-128 | 软件级防护，MVP 够用 |
| 离线播放 | 持久化许可证 | safeStorage 密钥缓存 7 天 | AES-128 模式下的离线方案 |
| 同步协议 | Syncthing REST API | 自建 HTTP 同步 | 不依赖 Syncthing，简化架构 |
| **权限模型** | **video_auth 按门店授权** | **campaign 活动分组授权** | **业务场景是营销活动驱动** |
| **同步机制** | **全量对比** | **客户端上报本地清单 → 服务端计算差异** | **简单可靠，无需版本号** |
| **设备绑定** | **MAC 地址预绑定** | **钉钉扫码自动绑定（方案 C）** | **无需管理员手动分配** |
| **视频下载** | **MinIO 预签名 URL** | **ts 认证端点（方案 B）** | **防盗链更强** |
| **数据库** | **9 张表** | **11 张表** | **新增 campaigns / campaign_videos / campaign_stores** |

---

## 十、后续迭代方向

| 阶段 | 内容 | 预计周期 |
|------|------|---------|
| MVP 后 v1.1 | 升级 ClearKey DRM（W3C EME） | 1-2 周 |
| v1.2 | 视频水印（播放时叠加门店/店员信息） | 1 周 |
| v1.3 | 播放统计报表导出 | 3 天 |
| v1.4 | CDN 加速下载（降低云端带宽压力） | 3 天 |
| v2.0 | ARM 缓存节点支持（作为可选扩展） | 2 周 |
| v2.1 | 区域管理员（分区域权限管理） | 1 周 |
| v2.2 | 活动模板（快速复制历史活动配置） | 3 天 |
| v2.3 | 视频评论/笔记功能 | 1 周 |

---

## 附录 A：营销活动操作流程

```
管理员操作流程：

1. 上传视频
   管理后台 → 视频管理 → 分片上传 → 自动加密 → 状态变为"就绪"

2. 创建营销活动
   管理后台 → 活动管理 → 创建活动
   ├─ 填写：活动名称、描述、开始时间、结束时间
   ├─ 选择视频：从视频库勾选（支持批量）
   ├─ 分配门店：按区域选择 / 按门店逐个选择 / 全部门店
   └─ 保存为草稿

3. 发布活动
   点击"发布"
   ├─ 状态：draft → active
   ├─ 后端递增相关门店的 sync_version
   ├─ MQTT 推送同步通知到所有相关门店
   └─ 门店自动开始下载活动视频

4. 活动进行中
   管理员可随时：
   ├─ 增删活动中的视频 → 触发增量同步
   ├─ 增减参与的门店 → 触发增量同步
   └─ 修改活动时间

5. 活动结束
   ├─ 自动：到达 end_time → 定时任务自动将状态改为 ended → 触发门店删除
   └─ 手动：管理员手动点"结束"→ 立即触发

6. 店员视角
   扫码登录 → 首页按活动分组展示视频
   ├─ 活动A tab：[视频1] [视频2] [视频3]
   ├─ 活动B tab：[视频4] [视频5]
   └─ 活动C tab：[视频6] [视频7] [视频8]
   
   活动结束后 → 对应 tab 消失，视频自动从本地缓存删除
```
