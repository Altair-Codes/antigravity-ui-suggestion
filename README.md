# Antigravity Google Gemini 流体主题与全中文三扩展优化套件 (`antigravity-ui-suggestion`)

将 **Google Antigravity 2.x** 桌面端与 3 个核心扩展深度整合为统一的 **Google Gemini 视觉基调 + 全量简体中文界面**，支持 **macOS 与 Windows 一键同步安装**。所有插件与配置均存放在用户目录 `~/.gemini/` 下，**完全不影响 Antigravity 官方热更新或版本升级**（升级后自动自愈保持中文主题与扩展不变）。

---

## 🚀 一键同步安装（macOS & Windows 通用）

> **前置环境**：已安装 Antigravity、`Node.js >= 20`、`Python 3`、`Git`。

### 方式一：发给 Antigravity AI 一句话全自动同步（最省心）

在任意一台电脑打开 Antigravity，直接复制下面这段话发给对话框里的 AI 即可全自动完成克隆、安装与系统路径适配：

```text
请帮我克隆 https://github.com/Songh0918/antigravity-ui-suggestion.git 到临时目录，并根据我当前操作系统自动执行仓库里的安装脚本（macOS 运行 bash install-mac.sh，Windows 运行 powershell -ExecutionPolicy Bypass -File install-win.ps1），为我一键同步安装整套 Google Gemini 四色流体主题、全量简体中文与三个中文扩展（Aura 控制台、项目文件、文件启动器）。全程不要在会话内强杀正在运行的 Antigravity 进程，装完校验插件状态并提示我重启客户端生效。
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

如果你希望保留仓库以便后续随时 `git pull` 同步最新主题微调：

```bash
git clone https://github.com/Songh0918/antigravity-ui-suggestion.git
cd antigravity-ui-suggestion

# macOS 安装 / 更新：
./install-mac.sh

# Windows PowerShell 安装 / 更新：
powershell -ExecutionPolicy Bypass -File .\install-win.ps1
```

---

## ✨ 包含组件与深度定制亮点

| 模块 | 定制效果与核心优化 |
| :--- | :--- |
| **Google Gemini 四色流体输入框** | 采用 CSS `@property --gemini-angle` + `conic-gradient` 实现 Google Gemini 彩星四色（蓝 `#4285F4` → 紫 `#9B72CB` → 红 `#EA4335` → 黄 `#FBBC05` → 绿 `#34A853`）360° 连续滚动变色流光边框，发送按钮与语音按钮同步采用 Gemini 动态流动渐变，彻底去除原版橙红火漆残留。 |
| **底部 Token 速度彩色微胶囊** | 去除原版左侧弯曲括号残影，重构为 4 枚 Google Gemini 配色中文微胶囊：<br>• **`● XX tok/s`**（谷歌蓝 `#8ab4f8` + 呼吸状态圆点）<br>• **`首字 X.Xs`**（星云紫 `#c58af9`）<br>• **`上下文 XXXk/512k`**（翡翠绿 `#81c995` / 预警黄 `#fdd663` / 高位红 `#f28b82` 自适应变色）<br>• **`输出 X.Xk`**（清爽冷灰蓝） |
| **Aura 控制台** (`aura-dashboard`) | • 标签栏与菜单全中文命名（`Aura 控制台`），面板内部全面切换为 **Google Gemini 深空灰蓝主题**（`#131314` / `#1e1f20` / `#8ab4f8`）。<br>• 修复了切换模型思考档位（低/中/高）时底部按钮文字不刷新的 `WeakMap` 缓存 Bug。<br>• 补全账户弹窗、浏览器设置与图表趋势等漏翻中文词条。 |
| **项目文件** (`workspace-file-tree`) | • 1:1 还原 **macOS 访达（Finder）四栏列表视图**（`名称 \| 修改日期 \| 大小 \| 种类`）。<br>• 加大至 `32px` 舒适行高、`13.5px` 字体、`18px` **macOS 立体水蓝渐变文件夹图标**与**彩色文稿角标图标**（`M`、`S`、`SH`、`TS`、`JS`、`PY` 等）。<br>• 奇偶行圆角斑马纹交替底色 + 底部访达文件夹路径面包屑 + 项目总数状态栏。<br>• 补齐 macOS / Windows 双端双击在主标签页打开、一键复制 `@引用`、在访达/资源管理器中定位、移至废纸篓/回收站。 |
| **文件启动器** (`file-launcher`) | • 标签栏与菜单全中文命名（`文件启动器`），视觉配色对齐 Google Gemini。<br>• **彻底关闭每次 AI 回复后自动弹出侧边栏**，仅在手动点开时加载。<br>• **加载速度提升 800 倍（秒开）**：修复活跃会话 `not is_cur` 缓存失效问题，新增 `transcript.jsonl` 增量签名缓存、项目目录树 20s 缓存与 `/api/state` 快照缓存，热响应耗时从 `~770ms` 降至 **`< 1ms`**。 |
| **热更新与版本升级不丢失** | 所有插件与配置均位于 `~/.gemini/` 用户目录下，Antigravity 客户端热刷新或大版本升级后会自动幂等自愈并重注入中文主题，无需重新配置。 |

---

## 📁 仓库目录结构

```text
antigravity-ui-suggestion/
├── plugins/
│   ├── aura-dashboard/        # Aura 控制台（Gemini 主题 + 中文微胶囊 + 动态文本缓存修复）
│   ├── workspace-file-tree/   # 项目文件（macOS 访达四栏列表视图 + 双端原生能力）
│   └── file-launcher/         # 文件启动器（极速增量缓存 + 禁自动弹窗 + Gemini 配色）
├── plugin_data/
│   └── aura-dashboard/        # 预置 config.json、Gemini 流体流光 custom.css、custom.js、i18n.override.json
├── install-mac.sh             # macOS 一键同步脚本（自动探测 Homebrew / nvm Node 与 Python3 路径）
├── install-win.ps1            # Windows PowerShell 一键同步脚本
└── README.md                  # 本说明文档
```

---

## 🤝 开源致谢与上游项目引用 (Upstream Credits & Acknowledgements)

本套件基于以下优秀的开源项目进行整合、主题重塑、性能优化与跨平台适配，特此向原作者致谢：

| 上游仓库 | 原作者 | 原始能力与本仓库二次优化内容 |
| :--- | :--- | :--- |
| **[sayakaho/Antigravity-Aura](https://github.com/sayakaho/Antigravity-Aura)** | [@sayakaho](https://github.com/sayakaho) (Aura Team) | 提供原生 Plugin + Sidecar 注入架构、多语言本地化引擎与实时性能看板（`Aura Dashboard`）。<br>**本仓库优化**：定制 Google Gemini 四色流体流光输入框与按钮、重构底部 4 枚彩色中文微胶囊、将面板改为 Gemini 深空灰蓝主题、补全漏翻词条，并修复了动态文本切换（如模型低/中/高档位）的 `WeakMap` 缓存不刷新 Bug。 |
| **[arco651749/workspace-file-tree](https://github.com/arco651749/workspace-file-tree)** | [@arco651749](https://github.com/arco651749) | 提供右侧栏工作区目录树、文件分栏预览与拖拽 `@` 引用基础框架（`Workspace File Tree`）。<br>**本仓库优化**：重写为 **macOS 访达（Finder）四栏列表视图**（`名称 \| 修改日期 \| 大小 \| 种类`、32px 行高、18px 立体水蓝文件夹与彩色文稿角标、奇偶斑马纹行、底部路径面包屑与项目统计），并补齐了 macOS 原生剪贴板、主标签页打开、访达定位与废纸篓支持。 |
| **[ZOU2850/antigravity-file-launcher](https://github.com/ZOU2850/antigravity-file-launcher)** | [@ZOU2850](https://github.com/ZOU2850) | 提供会话交付物与项目文件隔离发现、多维筛选、内嵌预览与防压缩收藏（`File Launcher`）。<br>**本仓库优化**：统一 Google Gemini 深浅色主题与中文命名、关闭每次回复后自动弹窗，并新增活跃会话 `transcript.jsonl` 增量签名缓存、目录树 TTL 缓存与 `/api/state` 快照缓存（热加载提速约 800 倍）及 macOS/POSIX 路径解析修复。 |
| **[elviscjn-cjn/antigravity-context-viewer](https://github.com/elviscjn-cjn/antigravity-context-viewer)** | [@elviscjn-cjn](https://github.com/elviscjn-cjn) (ELVISCHEN) | 提供顶栏圆环模型配额、上下文监控与 `>_ CLI` 快捷启动；可通过其免改盘守护模式（`node cli.js watch`）与本套件提供的 CDP 环境零冲突共存。 |

