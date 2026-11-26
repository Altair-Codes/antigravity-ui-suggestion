# Antigravity 引力套件 (Gravity Suite v2.1.0) 全中文纯 Node.js 三扩展 (`antigravity-ui-suggestion`)

> [!NOTE]
> **主分支：`main`（Gravity Suite `v2.1.0` · 纯 Node.js 22+ 架构）**
> 套件由三大核心扩展组成：**引力中枢 (`gravity-hub`)**、**引力目录 (`gravity-explorer`)**、**引力文库 (`gravity-vault`)**，全套基于原生 **Node.js 22+ ESM + `node:sqlite`** 构建，无外部运行时依赖。

将 **Google Antigravity 2.x** 桌面端与 3 个核心扩展深度整合为 **「引力套件 (`Gravity Suite`)」**：配备 Google Gemini 五色高精度 OKLab 流体视觉、全量简体中文与 120+ 技能双语引擎、零遮挡自适应遥测驾驶舱、访达风格项目目录树及极速会话文库，支持 **macOS 与 Windows 一键安装与同步更新**。所有插件与配置均存放在用户目录 `~/.gemini/` 下，**不改动官方二进制文件，完整保留 macOS 苹果代码签名与客户端热更新**（官方升级重开后 2 秒内自动激活主题）。

---

## 📚 文档与详情入口

- **重构实施计划**：[`docs/implementation_plan.md`](./docs/implementation_plan.md)
- **验收与实测报告**：[`docs/walkthrough.md`](./docs/walkthrough.md)
- **引力中枢 (`gravity-hub`)**：[`plugins/gravity-hub/README.md`](./plugins/gravity-hub/README.md)
- **引力目录 (`gravity-explorer`)**：[`plugins/gravity-explorer/README.md`](./plugins/gravity-explorer/README.md)
- **引力文库 (`gravity-vault`)**：[`plugins/gravity-vault/README.md`](./plugins/gravity-vault/README.md)

---

## 🚀 一键同步安装（`main` 主分支 · macOS & Windows 通用）

> **前置环境**：已安装 Antigravity、`Node.js >= 20`（推荐 `v22+` 原生 `node:sqlite`）、`Git`。

### 方式一：发给 Antigravity AI 一句话全自动安装（最省心）

在任意一台电脑打开 Antigravity，直接复制下面这段话发给对话框里的 AI 即可完成克隆与安装：

```text
请帮我克隆 https://github.com/Songh0918/antigravity-ui-suggestion.git 主分支到临时目录，并根据我当前操作系统自动执行仓库里的安装脚本（macOS 运行 bash install-mac.sh，Windows 运行 powershell -ExecutionPolicy Bypass -File install-win.ps1），为我一键同步安装整套引力套件 (Gravity Suite v2.1.0)、Google Gemini 五色流光主题、全量简体中文与三个中文扩展（引力中枢、引力目录、引力文库）。全程不要在会话内强杀正在运行的 Antigravity 进程，装完校验插件状态并提示我重启客户端生效。
```

---

### 方式二：终端一行命令在线一键同步

- **macOS（打开终端粘贴执行）**：
  ```bash
  git clone --depth 1 https://github.com/Songh0918/antigravity-ui-suggestion.git /tmp/ag-ui-sync && bash /tmp/ag-ui-sync/install-mac.sh && rm -rf /tmp/ag-ui-sync
  ```

- **Windows（先完全退出 Antigravity 含右下角托盘图标，打开 PowerShell 粘贴执行）**：
  ```powershell
  $d="$env:TEMP\ag-ui-sync"; if(Test-Path $d){Remove-Item -Recurse -Force $d}; git clone --depth 1 https://github.com/Songh0918/antigravity-ui-suggestion.git $d; powershell -ExecutionPolicy Bypass -File "$d\install-win.ps1"; Remove-Item -Recurse -Force $d
  ```

---

### 方式三：克隆到本地 & 日后随时同步更新

```bash
git clone https://github.com/Songh0918/antigravity-ui-suggestion.git
cd antigravity-ui-suggestion

# macOS 安装 / 更新：
./install-mac.sh

# Windows PowerShell 安装 / 更新：
powershell -ExecutionPolicy Bypass -File .\install-win.ps1
```

---

## ✨ 包含组件与核心特性

| 模块 | 核心特性与视觉效果 |
| :--- | :--- |
| **Google Gemini 五色高精度 OKLab 流体视觉** | 严格保留 **蓝 `#4285F4` → 紫 `#9B72CB` → 红 `#EA4335` → 黄 `#FBBC05` → 绿 `#34A853`** 五大核心锚点，在 **OKLab 色彩空间**下每两色间细分 10 个过渡区间（线性 **41 节点**、环形闭环经青色 `#36B9C5` 共 **51 节点**），消除红紫发灰与黄绿发暗断层；支持线/环双态、`prefers-reduced-motion` 降级与柔和呼吸光晕。 |
| **零遮挡遥测玻璃舱 & 模型胶囊** | • **流光玻璃模型胶囊**：`[data-testid="model-selector-trigger"]` 配备呼吸额度脉冲点、悬停实时额度详情浮窗、下拉菜单互斥隐藏及内嵌周余徽章，窄屏自动弹性省略文本避免碰撞。<br>• **零遮挡一体式遥测舱**（`.nb-cockpit-bar`）：展示 `⚡ 速率` ｜ `⏱ 首字` ｜ `🧠 上下文水位条` ｜ `✦ 输出`；以右侧控制组（`极速模式` / 语音 / 发送）真实左边界为硬碰撞线，极窄分屏下自动无缝切换为底栏上方独立迷你信息条 (`docked-top`)，展开/收起右侧分栏同步触发 GPU 高斯模糊柔和过渡，全程零遮挡不生硬。 |
| **引力中枢** (`gravity-hub`) | • **三舱 Bento 原生中文控制台** + **Node 22 原生 `node:sqlite` 算力统计**：真实账号数与会话去重计数，支持隐藏或一键归属「早期未跟踪历史数据」，近 30/90 天/1 年活跃热力图，以及明确标注估算口径的 5h/7d 预算提示。<br>• **上下文超阈值自动 `/compact`**：「会话记忆区」支持自定义阈值（默认 `500k`），监听当前对话上下文水位并在智能体空闲、输入框无草稿时自动执行 `/compact` 释放空间（含冷却与去重保护）。<br>• **斜杠命令 (`/`) 与 120+ 技能全量双语引擎**：统一呈现 **`中文名称 (英文原名)`** 并为个人专属技能点亮 **`★`** 星标。<br>• **官方热更新自动激活** + **5 项防幻觉工程护栏 (`rules/AGENTS.md`)** + **多账号周额度顺位自动轮换**。 |
| **引力目录** (`gravity-explorer`) | • **纯 Node.js ESM**：零外部前端打包依赖，呈现 macOS 访达四栏列表视图（`名称 \| 修改日期 \| 大小 \| 种类`）、水蓝立体文件夹与彩色文稿角标、圆角奇偶斑马纹与路径面包屑。<br>• **轻量分栏预览**：秒开代码语法高亮、Markdown 排版、CSV 表格与棋盘格图片尺寸查看；支持双击在原生 `fileView` 标签打开、多选、跨窗口拖拽 `@引用`、访达定位与安全移至废纸篓。 |
| **引力文库** (`gravity-vault`) | • **纯 Node.js 22+ (`node:sqlite`)**：毫秒级冷启扫描会话产物与交付物，精准隔离 **当前会话 / 当前项目 / 全部范围**，支持来源 × 类型复合筛选。<br>• **一键 `复制引用`、`★` 防压缩收藏清单与按日整理**：点击文件名支持右侧 `fileView` 分栏直开或内置轻量预览，并严格遵循零弹窗不打扰规范。 |

---

## 📁 仓库目录结构

```text
antigravity-ui-suggestion/ (branch: main)
├── docs/
│   ├── implementation_plan.md # 套件架构与五色 OKLab 视觉设计
│   └── walkthrough.md         # v2.1.0 功能说明与实测验证报告
├── plugins/
│   ├── gravity-hub/           # 引力中枢（中文三舱 Bento 控制台 + node:sqlite 遥测 + 扩展服务）
│   ├── gravity-explorer/      # 引力目录（访达四栏目录树 + 轻量分栏预览）
│   └── gravity-vault/         # 引力文库（会话产物与交付文档管理）
├── plugin_data/
│   └── gravity-hub/           # 预置 config.json、OKLab 五色流光 custom.css、斜杠双语 custom.js、i18n.override.json
├── enable-cdp.mjs             # 跨平台 CDP 调试端口自愈脚本
├── install-mac.sh             # macOS 一键安装脚本（生成 Antigravity Gravity.app 无侵入启动器）
├── install-win.ps1            # Windows PowerShell 一键安装脚本
├── version.json               # 套件版本清单 (v2.1.0)
└── README.md                  # 本说明文档
```

> [!TIP]
> **macOS 用户说明（`Antigravity Gravity.app`）**：
> 为 100% 保护 `/Applications/Antigravity.app` 的苹果官方代码签名（确保官方热更新永远畅通），`install-mac.sh` 会生成无侵入启动器 `/Applications/Antigravity Gravity.app`；同时若官方热更新重开客户端时未携带调试参数，引力中枢 Sidecar 会在 2 秒内自动触发切入主题模式。
