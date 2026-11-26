# 引力套件 (`Gravity Suite v2.1.1`) 架构与五色 OKLab 渐变系统设计

## 一、整体定位与套件组成

**引力套件 (`Gravity Suite v2.1.1`)** 面向 Google Antigravity 桌面端打造，完全基于原生 **Node.js 22+（ESM + `node:sqlite`）** 运行，所有插件与配置均存放在用户目录 `~/.gemini/` 下，完整保留官方客户端代码签名与热更新能力。

| 扩展标识 | 中文名称 | 核心职责 |
| :--- | :--- | :--- |
| `gravity-hub` | **引力中枢** | 三舱 Bento 中文控制台、`node:sqlite` 会话算力与账号统计、上下文超阈值自动 `/compact`、Google 五色 OKLab 视觉引擎、120+ 技能双语及 5 项防幻觉工程护栏 |
| `gravity-explorer` | **引力目录** | macOS 访达风格四栏项目目录浏览器、轻量分栏预览、原生 `fileView` 标签打开与跨窗口 `@引用` 拖拽 |
| `gravity-vault` | **引力文库** | 基于 `node:sqlite` + 增量扫描的会话交付文档管理，支持三层范围隔离、一键 `@引用` 复制与 `★` 收藏保护 |

---

## 二、Google 五色高精度 OKLab 渐变色彩系统

为解决直接 RGB 插值导致的紫红发灰、黄绿发暗及首尾跳色问题，主题系统严格保留 5 个固定品牌色锚点（**蓝 `#4285F4` → 紫 `#9B72CB` → 红 `#EA4335` → 黄 `#FBBC05` → 绿 `#34A853`**），在 **OKLab 色彩空间**下以静态 CSS 变量固化过渡色带：

- **线性色带 (`--ai-stops-linear`)**：每两主色间细分 10 个区间，共 **41 个精确节点**；
- **闭环流光色带 (`--ai-stops-loop`)**：在前 41 节点基础上，绿色与蓝色之间经青色 `#36B9C5` 再细分 10 个区间平滑闭环，共 **51 个精确节点**；
- **核心 CSS 变量**：`--ai-blue` ~ `--ai-green`、`--ai-gradient`、`--ai-gradient-vertical`、`--ai-gradient-diag`、`--ai-gradient-flow`、`--ai-gradient-conic`；
- **兼容与动效规范**：以静态 OKLab HEX 停点保障所有 sRGB 渲染一致，并在 `@supports (... in oklab)` 支持环境中叠加原生 OKLab 亚像素插值；所有旋转流光与呼吸光晕均遵循 `prefers-reduced-motion`。

---

## 三、关键交互与守护设计

1. **账号统计与早期历史归属**：由于 Antigravity 本地会话库不记录邮箱，`account_timeline.json` 自首次启用后开始追踪实时切号区间；之前未标记的历史记录支持一键归属至主账号（含每日明细与近 30/90 天/1 年活跃热力图）。
2. **上下文超阈值自动压缩 (`/compact`)**：宿主监听 `window.__ag_last_metrics.ctxTok` 与空闲状态，仅在智能体空闲、输入框无草稿且未触发去重冷却时自动提交 `/compact` 释放上下文空间。
3. **零遮挡自适应与分栏柔和过渡**：以右侧控制组真实左边界为硬碰撞线求解多级缩放档位，极窄宽度自动切为上方独立迷你信息条；展开/收起右侧分栏同步启用 GPU 高斯模糊柔和过渡。
4. **macOS 无侵入启动器 (`Antigravity Gravity.app`)**：不改动官方 `Antigravity.app` 包体与苹果代码签名；官方热更新无参重启后，Sidecar 会在 2 秒内自动引导切入引力主题模式。
