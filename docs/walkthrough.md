# 引力套件 (`Gravity Suite v2.1.2`) 功能特性与实测验证报告

## 一、`main` 主分支核心能力与升级概览

### 1. Google 五色高精度 OKLab 渐变色彩系统
- **核心锚点与精确节点**（[custom.css](../plugin_data/gravity-hub/custom.css)、[styles.css](../plugins/gravity-hub/sidecars/dashboard/styles.css)）：
  - 保留固定五色顺序：**蓝 `#4285F4` → 紫 `#9B72CB` → 红 `#EA4335` → 黄 `#FBBC05` → 绿 `#34A853`**；
  - 采用 **OKLab 色彩空间算法** 在每两个主色之间细分 10 个过渡区间，生成 **41 节点线性色带**（`--ai-stops-linear`）与 **51 节点环形闭环色带**（`--ai-stops-loop`，绿色经青色 `#36B9C5` 自然闭环回蓝色）。
- **渐变与动效能力**：
  - 统一导出 CSS 变量 `--ai-blue` ~ `--ai-green`、`--ai-gradient`、`--ai-gradient-vertical`、`--ai-gradient-diag`、`--ai-gradient-flow`、`--ai-gradient-conic`；
  - 输入框流光边框、发送按钮、语音胶囊、扩展图标环与遥测进度条全面升级；聚焦/悬停态采用低对比度五色呼吸光晕（不泛白、不刺眼），并提供完整的 `@supports (... in oklab)` 渐进增强与 `@media (prefers-reduced-motion: reduce)` 降级。

### 2. 账号 Token 用量分布与早期历史一键归属
- **真实口径与去重统计**（[app.js](../plugins/gravity-hub/sidecars/dashboard/app.js)、[index.html](../plugins/gravity-hub/sidecars/dashboard/index.html)）：
  - 顶部汇总统计真实已登录账号数，并通过 `conversationIds` 并集对跨账号会话严格去重；
  - 支持 **近 30 天 / 近 90 天 / 近 1 年** 紧凑活跃热力图及清晰的 `5h 估算` / `7d 估算` 标识。
- **早期未跟踪历史偏好与一键归属**（[suite-extensions.mjs](../plugins/gravity-hub/sidecars/dashboard/suite-extensions.mjs) `GET/POST /api/suite-account-prefs`）：
  - Antigravity 本地会话库本身不记录历史账号邮箱，`account_timeline.json` 自首次启用日起开始记录；早期历史行支持在面板直接隐藏、下拉指定归属，或通过右侧 **「一键归属」** 按钮合并至当前在线主账号。

### 3. 上下文超阈值自动压缩 (`/compact`)
- **会话记忆区配置与安全监听**（[suite-extensions.mjs](../plugins/gravity-hub/sidecars/dashboard/suite-extensions.mjs) `GET/POST /api/suite-auto-compact`、[custom.js](../plugin_data/gravity-hub/custom.js)）：
  - 在 **引力中枢 → 护栏与系统中枢 → 会话记忆、CLI 终端与在线热更新中心** 提供开关与阈值设置（默认 `500k Token`，支持 `100`~`1000`）；
  - 宿主窗口实时监听 `window.__ag_last_metrics.ctxTok`：仅当位于会话页、智能体连续空闲 ≥ `2.5s`、输入框无用户草稿且处于冷却/签名去重保护之外时，自动填入 `/compact` 并提交释放上下文空间。

### 4. 输入框窄屏零遮挡自适应与右侧分栏高斯模糊过渡
- **真实右边界硬碰撞求解**：实时探测右侧控制组（`极速模式` / 语音 / 发送）左边界，按 `full -> compact -> no-labels -> core -> ctx-only -> docked-top` 自动缩放，极窄宽度下自动切换至底栏上方独立迷你信息条 (`#nb-docked-metrics-strip`)，全程零遮挡。
- **GPU 高斯模糊柔和过渡**：展开/收起右侧分栏或点击 `✦ 引力` 瞬间，为左侧对话视图施加柔和模糊过渡，消除排版挤压卡顿感。

---

## 二、实测验证记录

1. **静态与语法一致性校验**：
   - `plugins/gravity-hub/sidecars/dashboard/{suite-extensions.mjs,app.js,main.mjs}` 与 `plugin_data/gravity-hub/custom.js` 等全部 JS/MJS 文件 `node --check` 退出码均为 `0`；`install-mac.sh` 通过 `bash -n` 校验。
   - `README.md`、`docs/`、`plugins/gravity-*/README.md` 已清理无关历史品牌、旧工具残留及冗余修饰。
   - CSS 色彩系统校验：5 个核心锚点 `#4285F4`、`#9B72CB`、`#EA4335`、`#FBBC05`、`#34A853` 原样保留，`--ai-stops-linear` 含 41 节点、`--ai-stops-loop` 含 51 节点（含青色 `#36B9C5` 闭环）。
2. **功能与本机同步安装校验 (`bash install-mac.sh`)**：
   - Node.js 隔离测试验证 `/api/suite-account-prefs` 与 `/api/suite-auto-compact` 读写持久化与边界裁剪（`100`~`1000` k）全部通过。
   - `bash install-mac.sh` 同步完成并通过 `diff -q` 校验本机安装目录与仓库 100% 一致；通过 `POST /api/suite-reload` 热重载后经 live CDP 验证宿主窗口样式、CSS 变量及自动压缩监听器生效且无报错。

---

## 三、手动复测清单

1. 完全退出 Antigravity（`Cmd + Q`）后通过 `/Applications/Antigravity Gravity.app` 重新打开。
2. 观察对话框五色流光边框与发送按钮流光：蓝→紫→红→黄→绿→青→蓝整圈连续过渡平滑，无灰暗断层或接缝跳变。
3. 打开右上角 **`✦ 引力`**：在「账号 Token 用量分布」测试早期历史一键归属与热力图切换；在「护栏与系统中枢 → 会话记忆区」确认上下文自动 `/compact`（默认 `500k`）可读写保存。
4. 在「扩展」菜单打开 **`引力目录`** 与 **`引力文库`**：确认目录浏览、轻量预览、原生 `fileView` 直开与一键 `@引用` 正常。
