# VDEIO 前端界面重构实施计划

> **For Claude/Sisyphus:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** 将 vdeio 的 admin（Vue3 + Element Plus）和 client（Vue3 + Electron）两个前端包统一重构为“深色工业风”设计系统，消除默认模板感，建立可复用的设计 token 与共享组件。

**Architecture:**
1. 在两个包内分别建立 `src/styles/design-tokens.css`（共享相同的 CSS 变量命名，但各自文件维护，避免跨包耦合）。
2. admin 通过覆盖 Element Plus CSS 变量 + 新增布局/卡片/图表组件实现深色主题。
3. client 通过纯 CSS 变量替换现有硬编码颜色，并新增通用组件。
4. 先完成 admin，再迁移 client，保证 token 和组件模式可被复用。

**Tech Stack:** Vue3, TypeScript, Vite, Element Plus, ECharts, Pinia, Electron, Shaka Player, CSS Variables.

---

## 前置检查

### Task 0: 验证开发环境

**Files:**
- Read: `admin/package.json`
- Read: `client/package.json`

**Step 1: 检查依赖是否已安装**

Run: `cd D:\work\vdeio\admin; Test-Path -PathType Container node_modules`
Expected: `True`

Run: `cd D:\work\vdeio\client; Test-Path -PathType Container node_modules`
Expected: `True`

**Step 2: 确认当前构建基线**

Run: `cd D:\work\vdeio\admin; npm run build`
Expected: 成功退出（`dist/` 生成）

Run: `cd D:\work\vdeio\client; npm run typecheck`
Expected: 成功退出（无 TS 错误）

**Step 3: Commit 当前状态（如需要）**

```bash
cd D:\work\vdeio
git add -A
git commit -m "chore: baseline before frontend redesign"
```

---

## 第一阶段：设计基础设施

### Task 1: 创建 admin 设计 token 文件

**Files:**
- Create: `admin/src/styles/design-tokens.css`
- Modify: `admin/src/main.ts`

**Step 1: 写入 token 文件**

```css
:root {
  /* Background */
  --bg-base: #0b0f14;
  --bg-elevated: #111820;
  --bg-sunken: #080b0e;
  --bg-hover: #1a2330;
  --bg-active: #223044;

  /* Text */
  --text-primary: #f0f4f8;
  --text-secondary: #94a3b8;
  --text-tertiary: #64748b;
  --text-inverse: #0b0f14;

  /* Accent */
  --accent: #3b82f6;
  --accent-hover: #60a5fa;
  --accent-subtle: rgba(59, 130, 246, 0.12);

  /* Semantic */
  --success: #22c55e;
  --warning: #f59e0b;
  --error: #ef4444;
  --info: #38bdf8;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.25);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.35);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.45);

  /* Borders */
  --border-subtle: 1px solid rgba(148, 163, 184, 0.12);
  --border-default: 1px solid rgba(148, 163, 184, 0.20);
  --border-strong: 1px solid rgba(148, 163, 184, 0.30);

  /* Motion */
  --duration-fast: 150ms;
  --duration-normal: 200ms;
  --duration-slow: 300ms;
  --ease-default: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* Typography */
  --font-sans: 'Inter', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', 'Sarasa Mono SC', monospace;
}
```

**Step 2: 在 main.ts 中导入 token（在 Element Plus CSS 之前）**

Modify `admin/src/main.ts`:

```typescript
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import zhCn from 'element-plus/dist/locale/zh-cn.mjs';
import App from './App.vue';
import router from './router';

// Design tokens MUST be imported before Element Plus CSS so EP variables can be overridden.
import './styles/design-tokens.css';
import 'element-plus/dist/index.css';

const app = createApp(App);
const pinia = createPinia();

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

app.use(pinia);
app.use(router);
app.use(ElementPlus, { locale: zhCn });
app.mount('#app');
```

**Step 3: 验证 admin 构建**

Run: `cd D:\work\vdeio\admin; npm run build`
Expected: 成功退出

**Step 4: Commit**

```bash
cd D:\work\vdeio
git add admin/src/styles/design-tokens.css admin/src/main.ts
git commit -m "feat(admin): add design tokens foundation"
```

---

### Task 2: 创建 admin Element Plus 变量覆盖

**Files:**
- Create: `admin/src/styles/element-variables.css`
- Modify: `admin/src/main.ts`

**Step 1: 写入 EP 覆盖文件**

```css
:root {
  /* Element Plus variable overrides */
  --el-color-primary: var(--accent);
  --el-color-primary-light-3: var(--accent-hover);
  --el-color-primary-light-5: #93c5fd;
  --el-color-primary-light-7: #bfdbfe;
  --el-color-primary-light-8: #dbeafe;
  --el-color-primary-light-9: var(--accent-subtle);
  --el-color-primary-dark-2: #2563eb;

  --el-bg-color: var(--bg-base);
  --el-bg-color-page: var(--bg-base);
  --el-bg-color-overlay: var(--bg-elevated);
  --el-fill-color: var(--bg-elevated);
  --el-fill-color-light: var(--bg-sunken);
  --el-fill-color-lighter: var(--bg-hover);
  --el-fill-color-extra-light: var(--bg-active);
  --el-fill-color-dark: var(--bg-sunken);
  --el-fill-color-darker: var(--bg-base);
  --el-fill-color-blank: var(--bg-elevated);

  --el-text-color-primary: var(--text-primary);
  --el-text-color-regular: var(--text-secondary);
  --el-text-color-secondary: var(--text-tertiary);
  --el-text-color-placeholder: var(--text-tertiary);
  --el-text-color-disabled: var(--text-tertiary);

  --el-border-color: rgba(148, 163, 184, 0.20);
  --el-border-color-light: rgba(148, 163, 184, 0.12);
  --el-border-color-lighter: rgba(148, 163, 184, 0.08);
  --el-border-color-extra-light: rgba(148, 163, 184, 0.06);

  --el-border-radius-base: var(--radius-md);
  --el-border-radius-small: var(--radius-sm);
  --el-border-radius-round: var(--radius-full);

  --el-box-shadow: var(--shadow-md);
  --el-box-shadow-light: var(--shadow-sm);
  --el-box-shadow-lighter: var(--shadow-sm);
  --el-box-shadow-dark: var(--shadow-lg);

  --el-font-size-extra-large: 18px;
  --el-font-size-large: 16px;
  --el-font-size-base: 14px;
  --el-font-size-small: 13px;
  --el-font-size-extra-small: 12px;
}
```

**Step 2: 在 main.ts 中导入（在 EP CSS 之后）**

```typescript
import './styles/design-tokens.css';
import 'element-plus/dist/index.css';
import './styles/element-variables.css';
```

**Step 3: 验证 admin 构建**

Run: `cd D:\work\vdeio\admin; npm run build`
Expected: 成功退出

**Step 4: Commit**

```bash
cd D:\work\vdeio
git add admin/src/styles/element-variables.css admin/src/main.ts
git commit -m "feat(admin): override Element Plus theme variables"
```

---

### Task 3: 创建 client 设计 token 文件

**Files:**
- Create: `client/src/styles/design-tokens.css`
- Modify: `client/src/main.ts`

**Step 1: 复制与 admin 相同的 token 内容到 client**

内容同 Task 1 的 `design-tokens.css`。

**Step 2: 在 client main.ts 中导入**

```typescript
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './styles/design-tokens.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.mount('#app');
```

**Step 3: 更新 App.vue 使用 token**

Modify `client/src/App.vue` style block:

```css
html, body, #app {
  width: 100%;
  height: 100%;
  font-family: var(--font-sans);
  background: var(--bg-base);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

**Step 4: 验证 client typecheck**

Run: `cd D:\work\vdeio\client; npm run typecheck`
Expected: 成功退出

**Step 5: Commit**

```bash
cd D:\work\vdeio
git add client/src/styles/design-tokens.css client/src/main.ts client/src/App.vue
git commit -m "feat(client): add design tokens and apply to app shell"
```

---

## 第二阶段：admin 重构

### Task 4: 重构 admin MainLayout

**Files:**
- Modify: `admin/src/layouts/MainLayout.vue`

**Step 1: 重写布局样式**

目标：
- sidebar：`--bg-elevated`，宽度 220px，右侧 1px 分隔线。
- topbar：与 sidebar 同高 60px，`--bg-elevated`。
- active nav item：左侧 3px accent rail + `--bg-active` 背景。
- 移除硬编码 `#1d1e1f`、`#bfcbd9` 等颜色。

**Step 2: 验证 typecheck**

Run: `cd D:\work\vdeio\admin; npx vue-tsc --noEmit`
Expected: 无错误

**Step 3: Commit**

```bash
cd D:\work\vdeio
git add admin/src/layouts/MainLayout.vue
git commit -m "feat(admin): redesign main layout with dark theme tokens"
```

---

### Task 5: 新增 admin 通用组件

**Files:**
- Create: `admin/src/components/PageHeader.vue`
- Create: `admin/src/components/StatCard.vue`
- Create: `admin/src/components/ChartCard.vue`
- Create: `admin/src/components/EmptyState.vue`
- Create: `admin/src/components/SkeletonList.vue`

**Step 1: 实现每个组件**

每个组件使用 design tokens，不接受 props 硬编码颜色。

示例 `StatCard.vue` props：`title`, `value`, `trend?`, `icon`。

**Step 2: 验证 typecheck**

Run: `cd D:\work\vdeio\admin; npx vue-tsc --noEmit`
Expected: 无错误

**Step 3: Commit**

```bash
cd D:\work\vdeio
git add admin/src/components/PageHeader.vue admin/src/components/StatCard.vue admin/src/components/ChartCard.vue admin/src/components/EmptyState.vue admin/src/components/SkeletonList.vue
git commit -m "feat(admin): add shared dark-theme components"
```

---

### Task 6: 重构 admin Login.vue

**Files:**
- Modify: `admin/src/views/Login.vue`

**Step 1: 移除深蓝渐变，改用分屏/居中暗色卡片**

- 全页 `--bg-base`。
- 登录卡片：`--bg-elevated`、`--radius-xl`、`--shadow-lg`。
- 标题/副标题使用 token。
- 输入框/按钮自动继承 EP 暗色主题。

**Step 2: 验证 typecheck + build**

Run: `cd D:\work\vdeio\admin; npm run build`
Expected: 成功退出

**Step 3: Commit**

```bash
cd D:\work\vdeio
git add admin/src/views/Login.vue
git commit -m "feat(admin): redesign login page with dark theme"
```

---

### Task 7: 重构 admin Dashboard.vue

**Files:**
- Modify: `admin/src/views/Dashboard.vue`
- Modify/Create: `admin/src/utils/chart-theme.ts`

**Step 1: 创建 chart 主题文件**

```typescript
import * as echarts from 'echarts';

export const chartColors = {
  primary: '#3b82f6',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#38bdf8',
};

export const commonChartOptions = {
  backgroundColor: 'transparent',
  textStyle: { color: '#94a3b8' },
  title: { textStyle: { color: '#f0f4f8' } },
  legend: { textStyle: { color: '#94a3b8' } },
  tooltip: {
    backgroundColor: '#111820',
    borderColor: 'rgba(148, 163, 184, 0.20)',
    textStyle: { color: '#f0f4f8' },
  },
};
```

**Step 2: 重写 Dashboard**

- 使用 `StatCard` 替代 4 个等宽卡。
- 使用 `ChartCard` 包裹图表。
- 一个折线/面积图 + 一个 donut 图。
- 移除硬编码 `#409eff`/`#67c23a`/`#f56c6c`。

**Step 3: 验证 admin 构建**

Run: `cd D:\work\vdeio\admin; npm run build`
Expected: 成功退出

**Step 4: Commit**

```bash
cd D:\work\vdeio
git add admin/src/views/Dashboard.vue admin/src/utils/chart-theme.ts
git commit -m "feat(admin): redesign dashboard with stat cards and themed charts"
```

---

### Task 8: 统一 admin 列表/表单/表格样式

**Files:**
- Modify: `admin/src/views/video/VideoList.vue`
- Modify: `admin/src/views/campaign/CampaignList.vue`
- Modify: `admin/src/views/device/DeviceList.vue`
- Modify: `admin/src/views/store/StoreList.vue`
- Modify: `admin/src/views/campaign/CampaignCreate.vue`
- Modify: `admin/src/views/video/VideoUpload.vue`

**Step 1: 批量替换硬编码颜色**

搜索并替换 admin/src 中的硬编码 hex：
- `#409eff` → `var(--accent)` 或删除（由 EP 变量处理）
- `#67c23a` → `var(--success)`
- `#e6a23c` → `var(--warning)`
- `#f56c6c` → `var(--error)`
- `#909399`/`#606266`/`#303133` → `var(--text-secondary)` / `var(--text-primary)`
- `#f5f7fa` → `var(--bg-base)`
- `#fff` → `var(--bg-elevated)`（在深色背景下）

**Step 2: 表格样式**

- 移除 `border stripe`。
- 在 `element-variables.css` 或全局样式中覆盖 `.el-table` 行 hover 背景为 `--bg-hover`。

**Step 3: 验证 typecheck + build**

Run: `cd D:\work\vdeio\admin; npm run build`
Expected: 成功退出

**Step 4: Commit**

```bash
cd D:\work\vdeio
git add admin/src/views/
git commit -m "feat(admin): apply design tokens across list and form views"
```

---

### Task 9: 重构 admin NotFound.vue

**Files:**
- Modify: `admin/src/views/NotFound.vue`

**Step 1: 使用 token 重写 404**

- 大数字使用 `--text-tertiary`。
- 按钮使用 EP primary（已被覆盖为 accent）。
- 背景 `--bg-base`。

**Step 2: Commit**

```bash
cd D:\work\vdeio
git add admin/src/views/NotFound.vue
git commit -m "feat(admin): redesign 404 page"
```

---

## 第三阶段：client 重构

### Task 10: 新增 client 通用组件

**Files:**
- Create: `client/src/components/AppHeader.vue`
- Create: `client/src/components/VideoCard.vue`
- Create: `client/src/components/CampaignTabs.vue`
- Create: `client/src/components/StatusBadge.vue`
- Create: `client/src/components/ProgressBar.vue`
- Create: `client/src/components/LoadingOverlay.vue`

**Step 1: 实现组件**

所有组件基于 design tokens，无硬编码颜色。

**Step 2: 验证 typecheck**

Run: `cd D:\work\vdeio\client; npm run typecheck`
Expected: 无错误

**Step 3: Commit**

```bash
cd D:\work\vdeio
git add client/src/components/
git commit -m "feat(client): add shared dark-theme components"
```

---

### Task 11: 重构 client Login.vue

**Files:**
- Modify: `client/src/views/Login.vue`

**Step 1: 移除深蓝渐变**

- 全页 `--bg-base`。
- 登录卡片 `--bg-elevated`、`--radius-xl`。
- 移除 emoji（🔧）。
- 按钮使用 `--accent`。

**Step 2: 验证 typecheck**

Run: `cd D:\work\vdeio\client; npm run typecheck`
Expected: 无错误

**Step 3: Commit**

```bash
cd D:\work\vdeio
git add client/src/views/Login.vue
git commit -m "feat(client): redesign login page with dark theme"
```

---

### Task 12: 重构 client Home.vue

**Files:**
- Modify: `client/src/views/Home.vue`

**Step 1: 使用新组件和 token 重写**

- 使用 `AppHeader`。
- 使用 `CampaignTabs` 替代手写 tabs。
- 使用 `VideoCard` 替代手写 video card。
- 缩略图占位：深灰 + 播放图标，移除海军蓝渐变。
- badge 使用 `StatusBadge`，移除 emoji。
- 空状态/错误/加载使用统一暗色风格。

**Step 2: 验证 typecheck**

Run: `cd D:\work\vdeio\client; npm run typecheck`
Expected: 无错误

**Step 3: Commit**

```bash
cd D:\work\vdeio
git add client/src/views/Home.vue
git commit -m "feat(client): redesign video list with shared components"
```

---

### Task 13: 重构 client SyncStatus.vue

**Files:**
- Modify: `client/src/views/SyncStatus.vue`

**Step 1: 使用 token 重写**

- 页面背景 `--bg-base`。
- 卡片 `--bg-elevated`、`--radius-md`。
- 进度条使用 `ProgressBar`。
- 状态 badge 使用 `StatusBadge`。
- 日志区使用 `--font-mono`。

**Step 2: 验证 typecheck**

Run: `cd D:\work\vdeio\client; npm run typecheck`
Expected: 无错误

**Step 3: Commit**

```bash
cd D:\work\vdeio
git add client/src/views/SyncStatus.vue
git commit -m "feat(client): redesign sync status page"
```

---

### Task 14: 重构 client Player.vue

**Files:**
- Modify: `client/src/views/Player.vue`

**Step 1: 优化播放页 overlay**

- 保持视频区域纯黑。
- header：半透明 `--bg-base` + blur。
- 序列号面板：`--bg-elevated` + `backdrop-filter: blur(12px)`。
- 按钮/输入框使用 token。

**Step 2: 验证 typecheck**

Run: `cd D:\work\vdeio\client; npm run typecheck`
Expected: 无错误

**Step 3: Commit**

```bash
cd D:\work\vdeio
git add client/src/views/Player.vue
git commit -m "feat(client): polish player overlay with tokens"
```

---

### Task 15: 清理 client 旧组件

**Files:**
- Delete: `client/src/components/CodeUnlock.vue`（如已被 Player.vue 内联替代）
- 或保留并重构：如果仍需复用，则迁移到 token。

**说明：** `CodeUnlock.vue` 当前未被任何视图引用（Player.vue 已内联实现）。可安全删除，或在重构后真正投入使用。建议删除以减少重复代码。

**Step 1: 删除未使用组件**

```bash
Remove-Item -Path D:\work\vdeio\client\src\components\CodeUnlock.vue
```

**Step 2: Commit**

```bash
cd D:\work\vdeio
git rm client/src/components/CodeUnlock.vue
git commit -m "chore(client): remove unused CodeUnlock component"
```

---

## 第四阶段：验证与收尾

### Task 16: admin 全量构建与诊断

**Step 1: TypeScript 检查**

Run: `cd D:\work\vdeio\admin; npx vue-tsc --noEmit`
Expected: 无错误

**Step 2: 构建**

Run: `cd D:\work\vdeio\admin; npm run build`
Expected: `dist/` 生成，退出码 0

**Step 3: 运行测试**

Run: `cd D:\work\vdeio\admin; npm test`
Expected: 全部通过（允许已有的预先失败用例，但需列出）

**Step 4: Commit（如只生成 dist）**

```bash
cd D:\work\vdeio
git add admin/dist/
git commit -m "build(admin): rebuild dist after redesign"
```

---

### Task 17: client 全量构建与诊断

**Step 1: TypeScript 检查**

Run: `cd D:\work\vdeio\client; npm run typecheck`
Expected: 无错误

**Step 2: 构建**

Run: `cd D:\work\vdeio\client; npm run build`
Expected: `dist/renderer/` 生成，退出码 0

**Step 3: 运行测试**

Run: `cd D:\work\vdeio\client; npm test`
Expected: 全部通过

**Step 4: Commit（如只生成 dist）**

```bash
cd D:\work\vdeio
git add client/dist/
git commit -m "build(client): rebuild dist after redesign"
```

---

### Task 18: 全局硬编码颜色审计

**Step 1: 搜索 admin 中的残留 hex**

Run: `cd D:\work\vdeio\admin; Select-String -Path src -Pattern '#[0-9a-fA-F]{3,6}' -Recurse`
Expected：仅剩 EP 变量文件中合理的 fallback 值，或图片 URL 中的 hex。视图文件中不应出现新的品牌/语义色硬编码。

**Step 2: 搜索 client 中的残留 hex**

Run: `cd D:\work\vdeio\client; Select-String -Path src -Pattern '#[0-9a-fA-F]{3,6}' -Recurse`
Expected：视频/图表等确实需要固定色值的除外，其余应使用 token。

**Step 3: 搜索 emoji**

Run: `cd D:\work\vdeio; Select-String -Path admin/src,client/src -Pattern '[\x{1F300}-\x{1F9FF}]' -Recurse`
Expected：无匹配（或仅剩测试/注释中）。

**Step 4: Commit 任何修复**

```bash
cd D:\work\vdeio
git add -A
git commit -m "refactor: audit and remove remaining hardcoded colors and emojis"
```

---

### Task 19: 文档更新

**Files:**
- Modify: `docs/技术说明.md`（如有前端章节，补充设计系统说明）
- 或创建：`docs/frontend-styleguide.md`

**Step 1: 添加前端设计系统说明**

简要说明：
- token 文件位置。
- 颜色/字体/圆角/阴影的使用规则。
- admin EP 变量覆盖方式。
- client 纯 CSS 约定。

**Step 2: Commit**

```bash
cd D:\work\vdeio
git add docs/
git commit -m "docs: add frontend design system guide"
```

---

## 执行方式选择

**计划已完成并保存至 `docs/plans/2026-06-23-frontend-redesign-plan.md`。**

两种执行方式：

1. **Subagent-Driven（本会话）**：我为每个 Task 派发独立子代理并行/串行执行，并在关键节点复核。适合想快速推进且能持续交互的情况。
2. **Parallel Session（新会话）**：用 `superpowers:executing-plans` 在新会话中按 Task 批量执行，适合长任务后台跑。

**建议方式 1（Subagent-Driven）**，因为视觉重构需要频繁验收效果。

---

## 附录：关键文件清单

### admin

- `src/styles/design-tokens.css`（新增）
- `src/styles/element-variables.css`（新增）
- `src/main.ts`（修改导入顺序）
- `src/layouts/MainLayout.vue`（重构）
- `src/views/Login.vue`（重构）
- `src/views/Dashboard.vue`（重构）
- `src/views/NotFound.vue`（重构）
- `src/views/video/VideoList.vue`（修改）
- `src/views/video/VideoUpload.vue`（修改）
- `src/views/campaign/CampaignList.vue`（修改）
- `src/views/campaign/CampaignCreate.vue`（修改）
- `src/views/campaign/CampaignDetail.vue`（修改）
- `src/views/device/DeviceList.vue`（修改）
- `src/views/store/StoreList.vue`（修改）
- `src/components/PageHeader.vue`（新增）
- `src/components/StatCard.vue`（新增）
- `src/components/ChartCard.vue`（新增）
- `src/components/EmptyState.vue`（新增）
- `src/components/SkeletonList.vue`（新增）
- `src/utils/chart-theme.ts`（新增）

### client

- `src/styles/design-tokens.css`（新增）
- `src/main.ts`（修改导入）
- `src/App.vue`（修改全局样式）
- `src/views/Login.vue`（重构）
- `src/views/Home.vue`（重构）
- `src/views/SyncStatus.vue`（重构）
- `src/views/Player.vue`（修改 overlay）
- `src/components/AppHeader.vue`（新增）
- `src/components/VideoCard.vue`（新增）
- `src/components/CampaignTabs.vue`（新增）
- `src/components/StatusBadge.vue`（新增）
- `src/components/ProgressBar.vue`（新增）
- `src/components/LoadingOverlay.vue`（新增）
- `src/components/CodeUnlock.vue`（删除）
