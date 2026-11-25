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
| **一体式流光玻璃遥测舱** | 重构输入框底栏为单条 **一体式流光毛玻璃驾驶舱条**（`.nb-cockpit-bar`），分段展示：<br>• **`⚡ XX tok/s`**（谷歌蓝 `#8ab4f8` + 呼吸状态圆点）<br>• **`⏱ 首字 X.Xs`**（星云紫 `#c58af9`）<br>• **`🧠 上下文 XXXk/512k`**（含 `26px` 迷你实时进度水位槽，翡翠绿 / 预警黄 / 高位红自适应变色）<br>• **`✦ 输出 X.Xk`**（清爽冷灰蓝），点击直接展开右侧「星云中枢」驾驶舱。 |
| **星云中枢** (`nebula-hub` v2.0) | • **全自研「三舱 Bento 网格」原生中文控制台**：彻底去 Aura 化，划分为 **「🚀 额度与算力舱」「🎨 视觉与流光舱」「🛡 护栏与系统中枢」**，顶栏配备 **`✦ 星云`、`↻ 更新`、`>_ CLI`** 三枚快捷胶囊，底层采用 Node 22 原生 `node:sqlite` 引擎（零第三方 wasm 依赖）。<br>• **斜杠命令 (`/`) 与 120+ 技能全量双语汉化**：所有内置命令、MCP 提示词与技能统一展示为 **`中文名称 (英文原名)`** + 中文描述（如 `计划 (plan)`、`目标 (goal)`），个人专属研发技能自动点亮 **`★`** 鎏金星标，菜单选中态采用 Gemini 蓝紫流光指示条。<br>• **官方热更新后全自动激活星云主题**：客户端完成官方热更新重启后，Sidecar 自动检测并在 2 秒内通过 `Antigravity Nebula.app` 无感切入 CDP 主题模式，既 100% 保护 macOS 官方苹果代码签名，又无需手动干预。<br>• **多模型额度池监控 & 低额度自动轮换切号**：实时展示 Gemini / Claude / Argon 每周与 5 小时共享额度池百分比与重置倒计时，支持多账号顺位自动切号。<br>• **内建全平台防幻觉护栏规则**（`rules/AGENTS.md`）：5 大工程护栏可一键切换 `关闭 / 标准 / 严格`。<br>• **左侧对话轮次阶梯波浪导航栏**：常态平整收起为 `5px` 刻度，悬停 60ms 零延迟跟手呈阶梯波浪展开。 |
| **项目文件** (`workspace-file-tree`) | • 1:1 还原 **macOS 访达（Finder）四栏列表视图**（`名称 \| 修改日期 \| 大小 \| 种类`）。<br>• 加大至 `32px` 舒适行高、`13.5px` 字体、`18px` **macOS 立体水蓝渐变文件夹图标**与**彩色文稿角标图标**（`M`、`S`、`SH`、`TS`、`JS`、`PY` 等）。<br>• 奇偶行圆角斑马纹交替底色 + 底部访达文件夹路径面包屑 + 项目总数状态栏。<br>• 补齐 macOS / Windows 双端双击在主标签页打开、一键复制 `@引用`、在访达/资源管理器中定位、移至废纸篓/回收站。 |
| **文件启动器** (`file-launcher`) | • 标签栏与菜单全中文命名（`文件启动器`），修复 `plugin://` 深色主题自适应为 Google Gemini `#131314`。<br>• **彻底关闭每次 AI 回复后自动弹出侧边栏**，仅在手动点开时加载。<br>• **修复 502 卡死 & 极致提速（冷启 158ms / 热响应 < 7ms）**：修复 `conv_project_map` 字典键崩溃、新增缺失文件目录倒排索引缓存与增量签名缓存。 |
| **热更新与版本升级不丢失** | 所有插件、防幻觉规则与配置均位于 `~/.gemini/` 用户目录下，零二进制改盘，Antigravity 客户端热刷新或大版本升级后自动保持生效。 |

---

## 🔔 套件版本发布与推送更新提醒（给维护者）

本仓库内置了基于 [`version.json`](./version.json) 的轻量级自动更新提醒机制：
1. 每次优化主题或扩展代码后，只需修改根目录 [`version.json`](./version.json) 中的 `version`（例如改为 `"1.2.1"`）和 `highlights` 更新说明并 `git push` 到 `main` 分支。
2. 所有已安装本套件的 macOS / Windows 用户在打开 Antigravity 时（每 6 小时静默检查一次，或在 Aura 控制台点击「检查更新」），会自动收到新版本提示卡片，可自由选择 **「立即一键更新」** 或 **「忽略此版本」**。

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
├── enable-cdp.mjs             # 跨平台 CDP 调试端口自愈脚本（含 Windows 退出瞬间自动解锁替换与自动重开机制）
├── install-mac.sh             # macOS 一键同步脚本（自动探测 Homebrew / nvm Node 与 Python3 路径）
├── install-win.ps1            # Windows PowerShell 一键同步脚本（含快捷方式注入与文件锁自愈）
└── README.md                  # 本说明文档
```

> [!TIP]
> **Windows 用户特别说明（为什么刚跑完脚本还没变中文？）**：
> Windows 系统在 `Antigravity.exe` 运行期间会独占锁定 `resources\app.asar`。本仓库的 `install-win.ps1` 与 `enable-cdp.mjs` 已内置 **Windows 文件锁后台自愈**：如果是在打开的 Antigravity 里让 AI 执行安装，脚本会自动在后台挂起轻量监听，**只要你关掉一次 Antigravity 窗口，后台会在进程退出的 0.5 秒内自动完成 CDP 解锁并自动帮你重新打开 Antigravity**，重开即 100% 呈现全套简体中文与 Google Gemini 四色流体流光！

---

## 🤝 开源致谢与上游项目引用 (Upstream Credits & Acknowledgements)

本套件基于以下优秀的开源项目进行整合、主题重塑、性能优化与跨平台适配，特此向原作者致谢：

| 上游仓库 | 原作者 | 原始能力与本仓库二次优化内容 |
| :--- | :--- | :--- |
| **[sayakaho/Antigravity-Aura](https://github.com/sayakaho/Antigravity-Aura)** | [@sayakaho](https://github.com/sayakaho) (Aura Team) | 提供原生 Plugin + Sidecar 注入架构、多语言本地化引擎与实时性能看板（`Aura Dashboard`）。<br>**本仓库优化**：定制 Google Gemini 四色流体流光输入框与按钮、重构底部 4 枚彩色中文微胶囊、将面板改为 Gemini 深空灰蓝主题、补全漏翻词条，并修复了动态文本切换（如模型低/中/高档位）的 `WeakMap` 缓存不刷新 Bug。 |
| **[arco651749/workspace-file-tree](https://github.com/arco651749/workspace-file-tree)** | [@arco651749](https://github.com/arco651749) | 提供右侧栏工作区目录树、文件分栏预览与拖拽 `@` 引用基础框架（`Workspace File Tree`）。<br>**本仓库优化**：重写为 **macOS 访达（Finder）四栏列表视图**（`名称 \| 修改日期 \| 大小 \| 种类`、32px 行高、18px 立体水蓝文件夹与彩色文稿角标、奇偶斑马纹行、底部路径面包屑与项目统计），并补齐了 macOS 原生剪贴板、主标签页打开、访达定位与废纸篓支持。 |
| **[ZOU2850/antigravity-file-launcher](https://github.com/ZOU2850/antigravity-file-launcher)** | [@ZOU2850](https://github.com/ZOU2850) | 提供会话交付物与项目文件隔离发现、多维筛选、内嵌预览与防压缩收藏（`File Launcher`）。<br>**本仓库优化**：统一 Google Gemini 深浅色主题与中文命名、关闭每次回复后自动弹窗，并新增活跃会话 `transcript.jsonl` 增量签名缓存、目录树 TTL 缓存与 `/api/state` 快照缓存（热加载提速约 800 倍）及 macOS/POSIX 路径解析修复。 |
| **[elviscjn-cjn/antigravity-context-viewer](https://github.com/elviscjn-cjn/antigravity-context-viewer)** & **PR #4 (@Jia131313)** | [@elviscjn-cjn](https://github.com/elviscjn-cjn) / [@Jia131313](https://github.com/Jia131313) | 提供防幻觉工程护栏提示词理念（`meter-enhance.js`）、`>_ CLI` 终端快捷启动与模型额度池监控思路。<br>**本仓库融合优化**：将其防幻觉提示词整理升级为跨平台原生插件规则（`plugins/aura-dashboard/rules/AGENTS.md`，无需二进制改盘，支持 macOS Intel / Apple Silicon 与 Windows），并将 `>_ CLI` 启动器与模型额度速览直接整合进 `Aura 控制台`。 |

