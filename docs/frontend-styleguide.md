# VDEIO 前端设计系统指南

> 本指南说明 vdeio 前端（admin / client）在 2026-06 重构后建立的设计系统约定。新增页面、组件或样式时，请遵循本文规则，保持两套前端视觉一致。

## 1. 设计系统目标

- **统一浅色清爽主题**：`#f5f7fa` 页面底色、`#ffffff` 卡片、`#3b82f6` 单主色、深灰文本色。
- **无模板感**：移除 Element Plus 默认蓝/白风格，覆盖全部 EP CSS 变量。
- **可维护性**：所有颜色、间距、圆角、阴影通过 CSS Variables（design tokens）管理，组件内禁止写死品牌色。

## 2. Design Tokens

### 2.1 文件位置

- `admin/src/styles/design-tokens.css`
- `client/src/styles/design-tokens.css`

两份文件**命名完全一致**，但独立维护，避免跨包耦合。修改时应同步检查另一份是否需要保持一致。

### 2.2 Token 分类

| 分类 | 变量示例 | 用途 |
|---|---|---|
| 背景 | `--bg-base`, `--bg-elevated`, `--bg-sunken`, `--bg-hover`, `--bg-active`, `--video-bg` | 页面、卡片、悬停、激活态 |
| 文本 | `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-inverse` | 标题、正文、辅助文本、按钮反色 |
| 强调 | `--accent`, `--accent-hover`, `--accent-subtle` | 主按钮、链接、聚焦环 |
| 语义 | `--success`, `--warning`, `--error`, `--info` | 状态标签、消息提示 |
| 间距 | `--space-1` ~ `--space-12` | 统一 4px 基栅格 |
| 圆角 | `--radius-sm` ~ `--radius-full` | 组件圆角 |
| 阴影 | `--shadow-sm` ~ `--shadow-lg` | 卡片、浮层 |
| 边框 | `--border-subtle`, `--border-default`, `--border-strong` | 1px 半透明边框 |
| 动效 | `--duration-fast/normal/slow`, `--ease-default/spring` | 过渡动画 |
| 字体 | `--font-sans`, `--font-mono` | 界面字体、等宽字体（日志） |

### 2.3 使用规则

- 组件样式**必须**使用 token，禁止在 `.vue` / `.css` 中直接写 `#rrggbb`、`rgb(...)` 等品牌色。
- 唯一例外：
  - `admin/src/utils/chart-theme.ts` 中的 ECharts 颜色常量，它们镜像 token，用于 JS 图表配置。
  - `--video-bg: #000000` 用于客户端视频播放区域，因为视频播放需要纯黑背景（这是设计需求而非品牌色）。

## 3. admin 包约定

### 3.1 Element Plus 覆盖

- `admin/src/styles/element-variables.css` 在 `element-plus/dist/index.css` 之后导入，覆盖 EP 变量。
- 覆盖范围：主色、背景色、文本色、边框色、圆角、阴影。
- EP 组件（按钮、输入框、表格、弹窗等）原则上不再单独写样式覆盖；如需覆盖，优先改 `element-variables.css` 或全局样式，而非组件内 hack。

### 3.2 共享组件

新增通用 UI 应先在 `admin/src/components/` 创建共享组件：

- `PageHeader.vue`：页面标题 + 操作区插槽。
- `StatCard.vue`：仪表盘 KPI 卡片。
- `ChartCard.vue`：图表容器。
- `EmptyState.vue`：空状态插画。
- `SkeletonList.vue`：列表加载骨架。

这些组件只接受 props 和 slots，**不接收颜色 prop**，颜色全部来自 token。

### 3.3 列表/表单视图

- 页面顶部使用 `PageHeader`。
- 筛选器统一放在 `PageHeader` 的 actions 插槽中，输入框使用 `.filter-input`，下拉框使用 `.filter-select`。
- 表格不添加 `border stripe`，hover 背景通过 EP 变量统一覆盖为 `--bg-hover`。

## 4. client 包约定

### 4.1 纯 CSS 变量驱动

- client 不使用 Element Plus，所有组件基于 `design-tokens.css` 纯手写。
- 全局样式入口：`client/src/App.vue` 设置 `html, body, #app` 的背景、文字、字体。

### 4.2 共享组件

- `AppHeader.vue`：顶部标题栏。
- `VideoCard.vue`：视频卡片。
- `CampaignTabs.vue`：活动标签切换。
- `StatusBadge.vue`：状态徽标。
- `ProgressBar.vue`：进度条。
- `LoadingOverlay.vue`：加载遮罩。

### 4.3 页面约定

- 页面背景：`--bg-base`。
- 卡片/面板：`--bg-elevated` + `--radius-md` + `--shadow-md`。
- 按钮：主按钮 `background: var(--accent)`，文字 `var(--text-inverse)`；次级按钮透明底 + 边框。
- 输入框：`background: var(--bg-sunken)` + `border: var(--border-default)`，focus 边框 `var(--accent)`。

## 5. 图标与表情

- **全站禁止 emoji**。状态、按钮、空状态统一使用 SVG 图标或文字。
- 图标颜色使用 `currentColor`，跟随父级 `color: var(--text-*)`。

## 6. 硬编码颜色审计

### 6.1 允许出现的位置

- `design-tokens.css`：token 定义本身。
- `admin/src/styles/element-variables.css`：EP 覆盖的 fallback 值。
- `admin/src/utils/chart-theme.ts`：JS 图表颜色常量（与 token 镜像）。
- `client/src/styles/design-tokens.css`：`--video-bg: #000000`。

### 6.2 不允许出现的位置

- `admin/src/views/**/*.vue` 中不应有 `#rrggbb` / `rgb(...)` 等品牌/语义色。
- `client/src/views/**/*.vue` 中除 `--video-bg` 相关外，不应有硬编码颜色。

### 6.3 审计命令

```powershell
# admin
cd admin
Get-ChildItem -Recurse -File -Path src -Include *.vue,*.css,*.scss |
  Select-String -Pattern '#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\('

# client
cd client
Get-ChildItem -Recurse -File -Path src -Include *.vue,*.css,*.scss |
  Select-String -Pattern '#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\('
```

发现新的硬编码颜色时，应：
1. 若属于已有语义，替换为对应 token。
2. 若为新场景，先在 `design-tokens.css` 中新增 token，再在组件中使用。

## 7. 新增页面/组件 checklist

- [ ] 颜色全部来自 `design-tokens.css`，无新硬编码色值。
- [ ] 无 emoji。
- [ ] 优先复用共享组件（admin: PageHeader/StatCard/...；client: AppHeader/VideoCard/...）。
- [ ] 间距使用 `--space-*`，圆角使用 `--radius-*`，阴影使用 `--shadow-*`。
- [ ] 动效时长使用 `--duration-*`、缓动使用 `--ease-*`。
- [ ] 运行 `npm run build` / `npm test`（admin）或 `npm run typecheck && npm run build` / `npm test`（client）通过。

## 8. 相关文件速查

| 用途 | admin | client |
|---|---|---|
| Tokens | `src/styles/design-tokens.css` | `src/styles/design-tokens.css` |
| EP 覆盖 | `src/styles/element-variables.css` | 无 |
| 全局入口 | `src/main.ts` | `src/main.ts` / `src/App.vue` |
| 图表主题 | `src/utils/chart-theme.ts` | 无 |
| 共享组件 | `src/components/{PageHeader,StatCard,ChartCard,EmptyState,SkeletonList}.vue` | `src/components/{AppHeader,VideoCard,CampaignTabs,StatusBadge,ProgressBar,LoadingOverlay}.vue` |
| 设计文档 | `docs/plans/2026-06-23-frontend-redesign-design.md` | 同上 |
| 实施计划 | `docs/plans/2026-06-23-frontend-redesign-plan.md` | 同上 |

## 8. 历史记录

- **2026-06-23**：完成 admin + client 重构，建立浅色设计系统，修复全部测试，产出本文档。
