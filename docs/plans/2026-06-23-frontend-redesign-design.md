# VDEIO 前端界面重构设计文档

## 1. 设计读取（Design Read）

**"Reading this as: B2B 连锁门店视频运营平台，面向管理员/运营人员（admin）和门店播放环境（client）；admin 侧偏信任优先的专业 SaaS，client 侧偏暗色沉浸的视频终端；整体走向统一设计 token + 克制动效的现代工业风。"**

- 业务属性：加密视频分发、门店播放、连锁管理。
- 用户画像：
  - admin：运营人员、IT 管理员，长时间使用后台，重视效率与信息密度。
  - client：门店现场播放终端，环境光线复杂，需要高对比、大触控目标、视频内容优先。
- 审美方向：统一深色工业风（Dark Industrial），传递安全、专业、基础设施感。
- taste-skill dials：
  - `DESIGN_VARIANCE: 5` — 以对称/网格为主，关键页面加入少量非对称焦点。
  - `MOTION_INTENSITY: 3` — 克制：只有 hover、focus、加载、页面进入过渡。
  - `VISUAL_DENSITY: 6` — 后台信息密度中高，播放终端留白充足。

## 2. 范围与阶段

### 2.1 范围

同时覆盖两个前端包：

| 包 | 技术栈 | 页面数 | 当前状态 |
|---|---|---|---|
| `admin/` | Vue3 + Element Plus + Pinia + ECharts | ~11 个视图 + 1 布局 + 1 组件 | 零定制 Element Plus，硬编码 hex，无 token |
| `client/` | Vue3 + Electron + Shaka Player + 纯 CSS | 4 个视图 + 1 组件 | 无 UI 框架，手写 CSS，深蓝海军渐变 login |

### 2.2 阶段

1. **阶段一：设计基础设施**（两个包共享设计 token，但各自落地）
   - 建立 CSS 变量层。
   - 确定字体、圆角、阴影、动效参数。
2. **阶段二：admin 重构**
   - Element Plus 变量覆盖为深色主题。
   - 重绘 Login、Dashboard、MainLayout。
   - 统一列表/表单/图表样式。
3. **阶段三：client 重构**
   - 统一暗色播放终端风格。
   - 重绘 Login、Home、SyncStatus。
   - Player 页保持纯黑，优化 overlay。

**先做 admin，再做 client。** admin 改动对品牌影响最大，且能沉淀出可复用的 token 供 client 沿用。

## 3. 设计系统

### 3.1 色彩

采用单一深色背景 + 单强调色策略，避免 AI 默认的紫蓝渐变和 oversaturated accent。

#### 背景色阶

| Token | 色值 | 用途 |
|---|---|---|
| `--bg-base` | `#0b0f14` | 页面最底层背景 |
| `--bg-elevated` | `#111820` | 卡片、面板、侧边栏 |
| `--bg-sunken` | `#080b0e` | 输入框、凹陷区域 |
| `--bg-hover` | `#1a2330` | hover 状态 |
| `--bg-active` | `#223044` | active/selected 状态 |

#### 前景色阶

| Token | 色值 | 用途 |
|---|---|---|
| `--text-primary` | `#f0f4f8` | 主标题、重要正文 |
| `--text-secondary` | `#94a3b8` | 次要说明、标签 |
| `--text-tertiary` | `#64748b` | placeholder、禁用 |
| `--text-inverse` | `#0b0f14` | 浅色按钮上的文字 |

#### 强调色（唯一）

| Token | 色值 | 用途 |
|---|---|---|
| `--accent` | `#3b82f6` | 主按钮、active nav、进度条、chart primary |
| `--accent-hover` | `#60a5fa` | hover 状态 |
| `--accent-subtle` | `rgba(59, 130, 246, 0.12)` | 选中背景、badge 背景 |

#### 语义色（去饱和）

| Token | 色值 | 用途 |
|---|---|---|
| `--success` | `#22c55e` | 成功、在线 |
| `--warning` | `#f59e0b` | 警告、暂停 |
| `--error` | `#ef4444` | 错误、离线 |
| `--info` | `#38bdf8` | 信息提示 |

**原则：**
- 不使用 `#000000` 纯黑；最接近黑的是 `#080b0e`。
- 不使用紫色/霓虹渐变。
- 阴影使用背景色色相的黑色，不使用纯黑阴影。

### 3.2 字体

中文优先，西文辅助。

```css
--font-sans: 'Inter', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
--font-mono: 'JetBrains Mono', 'SF Mono', 'Sarasa Mono SC', monospace;
```

说明：
- `Inter` 用于数字、英文标签；中文回退到系统字体。
- 数据密集处（设备 ID、文件大小、统计数字）使用 `font-variant-numeric: tabular-nums`。
- 标题字重：600–700；正文：400；标签/小字：500。

### 3.3 字号与行高

| 级别 | 大小 | 行高 | 字重 | 用途 |
|---|---|---|---|---|
| Display | 32px | 1.2 | 700 | 登录页标题、大数字 |
| H1 | 24px | 1.3 | 600 | 页面标题 |
| H2 | 18px | 1.4 | 600 | 区块标题 |
| H3 | 15px | 1.4 | 600 | 卡片标题 |
| Body | 14px | 1.6 | 400 | 正文 |
| Caption | 12px | 1.5 | 500 | 标签、辅助说明 |
| Small | 11px | 1.4 | 500 | badge、时间戳 |

### 3.4 间距

以 4px 为基数的 8px 网格：

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
```

### 3.5 圆角

```css
--radius-sm: 6px;   /* 输入框、小按钮 */
--radius-md: 8px;   /* 卡片、大按钮 */
--radius-lg: 12px;  /* 面板、弹窗 */
--radius-xl: 16px;  /* 登录卡片 */
--radius-full: 9999px; /* badge、avatar */
```

### 3.6 阴影与边框

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.25);
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.35);
--shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.45);

--border-subtle: 1px solid rgba(148, 163, 184, 0.12);
--border-default: 1px solid rgba(148, 163, 184, 0.20);
--border-strong: 1px solid rgba(148, 163, 184, 0.30);
```

### 3.7 动效

```css
--duration-fast: 150ms;
--duration-normal: 200ms;
--duration-slow: 300ms;
--ease-default: cubic-bezier(0.4, 0, 0.2, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

允许的动效：
- hover：background/translate/scale（`transform` 优先）。
- focus：ring 展开。
- 页面进入：opacity + translateY(8px) → 0。
- 加载：骨架屏脉冲、spinner rotate（transform）。

禁止：
- 无限循环的装饰动效。
- 使用 `top/left/width/height` 做动画。
- 过于夸张的 scroll hijack。

## 4. admin 重构要点

### 4.1 Element Plus 主题覆盖

通过 `src/styles/element-variables.css` 覆盖 EP 的 CSS 变量，实现深色主题：

```css
:root {
  --el-color-primary: var(--accent);
  --el-bg-color: var(--bg-base);
  --el-bg-color-page: var(--bg-base);
  --el-bg-color-overlay: var(--bg-elevated);
  --el-text-color-primary: var(--text-primary);
  --el-text-color-regular: var(--text-secondary);
  --el-text-color-secondary: var(--text-tertiary);
  --el-border-color: var(--border-default);
  --el-fill-color: var(--bg-elevated);
  --el-fill-color-light: var(--bg-sunken);
  --el-fill-color-blank: var(--bg-elevated);
  --el-border-radius-base: var(--radius-md);
  --el-box-shadow: var(--shadow-md);
}
```

### 4.2 布局（MainLayout）

当前：60px 深色 sidebar + 60px 白色 topbar + 浅灰内容区。

改造后：
- 侧边栏：宽度 220px，背景 `--bg-elevated`，右侧 1px 细线分隔。
- 顶部栏：与 sidebar 同高 60px，背景 `--bg-elevated`，左侧显示页面标题，右侧用户菜单。
- 内容区：背景 `--bg-base`，统一内边距 `--space-6`。
- 导航 active：左侧 3px accent rail + subtle 背景。

### 4.3 登录页

当前：深蓝渐变 + 白色圆角居中卡片（典型 AI slop）。

改造后：
- 全页 `--bg-base`。
- 左侧品牌区：大标题 + 一句话价值主张 + 装饰性几何图形（无需真实图片）。
- 右侧登录卡片：`--bg-elevated`、`--radius-xl`、subtle shadow。
- 二维码/模拟登录容器：统一卡片内部区域，加载/错误状态内联展示。

### 4.4 Dashboard

当前：4 个等宽统计卡 + 两个默认饼图。

改造后：
- 顶部 KPI 行：3–4 个不等宽指标卡，关键数字用 Display 字号，趋势/标签用 badge。
- 中间：一个主要趋势图（折线/面积）替代单一饼图，展示播放/同步趋势。
- 底部：设备状态用环形图（donut），列表用 mini table。
- 避免“4 等宽卡片” cliché。

### 4.5 列表/表单/表格

- 表格：`el-table` 去掉 `border stripe`，使用 `--border-subtle` 分隔行，hover 行用 `--bg-hover`。
- 表单：标签位于输入框上方，统一 `--radius-sm`。
- 按钮：Primary 用 `--accent`；Ghost/Secondary 用 `--bg-elevated` + border。
- 空状态/加载：骨架屏替代 spinner（列表），插画式空状态（暂无数据）。

### 4.6 ECharts 主题

建立 `src/utils/chart-theme.ts`，统一：
- 背景透明。
- 文字色 `--text-secondary`。
- 色板：`[--accent, --success, --warning, --error, --info]`。
- tooltip 背景 `--bg-elevated`，边框 `--border-default`。

## 5. client 重构要点

### 5.1 整体风格

client 与 admin 共享 token，但 client 更暗、更沉浸：
- 页面背景 `--bg-base`。
- 卡片/面板 `--bg-elevated`。
- 强调色同样使用 `--accent`。

### 5.2 登录页

当前与 admin 几乎相同的深蓝渐变 + 白卡片。

改造后：
- 全页 `--bg-base`。
- 居中登录卡片：`--bg-elevated`、宽 360px、大圆角。
- 钉钉二维码区域：无边框内嵌，加载/错误内联。
- 模拟登录按钮：仅在 mock 模式下突出显示，正常模式收敛为底部 text link。

### 5.3 视频列表（Home）

当前：浅色 header + 浅色卡片 + 海军蓝渐变缩略图占位。

改造后：
- header：暗色 `--bg-elevated`，左侧标题，右侧门店名 + 退出按钮。
- campaign tabs：暗色 pill 风格，active 带 accent 背景。
- 视频卡片：`--bg-elevated`、`--radius-md`、16:10 缩略图占位（深灰 + 播放图标）。
- badge：去饱和语义色，**移除 emoji**，改用文字或图标。
- 空状态/错误/加载：统一暗色风格。

### 5.4 播放器（Player）

保持纯黑背景，优化 overlay：
- 序列号输入面板：`--bg-elevated` + 玻璃拟态（`backdrop-blur`）。
- 顶部 header：半透明黑 + 返回/标题/ID。
- 错误/加载 overlay：居中大图标 + 文字 + 按钮。

### 5.5 同步状态（SyncStatus）

当前：浅色卡片堆叠。

改造后：
- 暗色卡片纵向排列，max-width 600px 居中。
- 进度条：track `--bg-sunken`，fill `--accent`。
- 状态 badge：pill 形状，语义色背景。
- 日志区：等宽字体、时间戳弱化。

## 6. 组件策略

### 6.1 admin 新增/改造组件

| 组件 | 用途 |
|---|---|
| `PageHeader` | 统一页面标题 + 操作区 |
| `StatCard` | Dashboard KPI 卡片 |
| `ChartCard` | 带标题的图表容器 |
| `DataTable` | 封装 `el-table` 暗色样式 |
| `EmptyState` | 插画空状态 |
| `SkeletonList` | 列表骨架屏 |

### 6.2 client 新增/改造组件

| 组件 | 用途 |
|---|---|
| `AppHeader` | 统一暗色 header |
| `VideoCard` | 视频列表卡片 |
| `CampaignTabs` | campaign 切换 |
| `StatusBadge` | 状态标签 |
| `ProgressBar` | 同步进度条 |
| `LoadingOverlay` | 全页/局部加载遮罩 |

## 7. 可访问性与工程约束

- 所有交互元素必须有 `:focus-visible` ring。
- 主按钮对比度 ≥ 4.5:1。
- 支持 `prefers-reduced-motion`：关闭非必要动效。
- 不引入新的重型 UI 框架；admin 继续用 Element Plus，client 继续纯 CSS。
- 不删除现有功能；只改视觉。
- 所有新增颜色必须来自 token，禁止硬编码 hex。

## 8. 验收标准

1. admin 所有页面视觉风格统一，无可见的 Element Plus 默认浅色残留。
2. client 所有页面视觉风格统一，与 admin 共享同一套颜色和字体。
3. Login、Dashboard（admin）、Home（client）三个门面页面无“AI 默认模板感”。
4. 无 emoji 作为 UI 图标；统一使用图标库或纯文字 badge。
5. 所有新增/修改样式通过 `lsp_diagnostics` / `vue-tsc --noEmit`。
6. admin `npm run build` 通过，client `npm run typecheck` 通过。
7. 设计 token 文件被两个包复用（或至少各自保持同步）。

## 9. 待用户确认

- [ ] 是否确认方案 A（统一深色工业风）？
- [ ] 是否有现有品牌色/logo/VI 需要纳入？
- [ ] admin 是否必须保持浅色主题？（若否，继续方案 A；若是，切换方案 B）
- [ ] 是否需要优先处理某个具体页面（如 Login）作为试点？
