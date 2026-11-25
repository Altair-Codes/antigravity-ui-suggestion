# Antigravity 星云中枢 (Nebula Hub v2.0) 与全中文三扩展优化套件 (`antigravity-ui-suggestion`)

> [!NOTE]
> **当前分支：`new-ui-project`（Nebula Hub `v2.0.0` 全自研架构重构分支）**
> 原稳定版 `v1.2.8`（旧 `aura-dashboard` 架构）完整保留在 `main` 分支中，随时可无损切回对比或回滚。

将 **Google Antigravity 2.x** 桌面端与 3 个核心扩展深度重构整合为 **「星云中枢 (`nebula-hub`)」+ Google Gemini 四色流光视觉 + 全量简体中文与 120+ 技能双语体系**，支持 **macOS 与 Windows 一键同步安装与旧版配置无损迁移**。所有插件与配置均存放在用户目录 `~/.gemini/` 下，**零二进制改盘，100% 保护 macOS 官方苹果代码签名与客户端热更新**（官方升级重开后 2 秒内全自动激活星云主题）。

---

## 📚 重构文档与交接入口

- **重构实施计划与架构对比**：[`docs/implementation_plan.md`](./docs/implementation_plan.md)
- **验收与实测验证报告**：[`docs/walkthrough.md`](./docs/walkthrough.md)
- **星云中枢插件说明**：[`plugins/nebula-hub/README.md`](./plugins/nebula-hub/README.md)

---

## 🚀 一键同步安装（`new-ui-project` 分支 · macOS & Windows 通用）

> **前置环境**：已安装 Antigravity、`Node.js >= 20`（推荐 `v22+` 原生 `node:sqlite`）、`Python 3`、`Git`。

### 方式一：发给 Antigravity AI 一句话全自动同步（最省心）

在任意一台电脑打开 Antigravity，直接复制下面这段话发给对话框里的 AI 即可全自动完成克隆、安装与旧版账号库迁移：

```text
请帮我克隆 https://github.com/Songh0918/antigravity-ui-suggestion.git 的 new-ui-project 分支到临时目录，并根据我当前操作系统自动执行仓库里的安装脚本（macOS 运行 bash install-mac.sh，Windows 运行 powershell -ExecutionPolicy Bypass -File install-win.ps1），为我一键同步安装整套星云中枢 (Nebula Hub v2.0)、Google Gemini 四色流体主题、全量简体中文与三个中文扩展（星云中枢、项目文件、文件启动器）。全程不要在会话内强杀正在运行的 Antigravity 进程，装完校验插件状态并提示我重启客户端生效。
```

---

### 方式二：终端一行命令在线一键同步

- **macOS（打开终端粘贴执行）**：
  ```bash
  git clone -b new-ui-project --depth 1 https://github.com/Songh0918/antigravity-ui-suggestion.git /tmp/ag-ui-sync && bash /tmp/ag-ui-sync/install-mac.sh && rm -rf /tmp/ag-ui-sync
  ```

- **Windows（先完全退出 Antigravity 含右下角托盘图标，打开 PowerShell 粘贴执行）**：
  ```powershell
  $d="$env:TEMP\ag-ui-sync"; if(Test-Path $d){Remove-Item -Recurse -Force $d}; git clone -b new-ui-project --depth 1 https://github.com/Songh0918/antigravity-ui-suggestion.git $d; powershell -ExecutionPolicy Bypass -File "$d\install-win.ps1"; Remove-Item -Recurse -Force $d
  ```

---

### 方式三：克隆到本地 & 日后随时同步更新

如果你希望保留仓库以便后续随时 `git pull` 同步最新开发：

```bash
git clone -b new-ui-project https://github.com/Songh0918/antigravity-ui-suggestion.git
cd antigravity-ui-suggestion

# macOS 安装 / 更新（自动清理旧 aura-dashboard 并无损迁移账号库）：
./install-mac.sh

# Windows PowerShell 安装 / 更新：
powershell -ExecutionPolicy Bypass -File .\install-win.ps1
```

---

## ✨ 包含组件与深度定制亮点

| 模块 | 定制效果与核心优化 |
| :--- | :--- |
| **Google Gemini 四色流体输入框** | 采用 CSS `@property --gemini-angle` + `conic-gradient` 实现 Google Gemini 彩星四色（蓝 `#4285F4` → 紫 `#9B72CB` → 红 `#EA4335` → 黄 `#FBBC05` → 绿 `#34A853`）360° 连续滚动变色流光边框，发送按钮与语音按钮同步采用 Gemini 动态流动渐变，彻底去除原版橙红火漆残留。 |
| **一体式流光玻璃遥测舱 & 模型胶囊** | 重构输入框底栏视觉体系：<br>• **同款流光玻璃模型胶囊**：`[data-testid="model-selector-trigger"]` 配备 `24px` 圆角渐变玻璃边框、悬停蓝紫光晕与按当前模型池剩余额度实时变色的呼吸脉冲点；悬停 180ms（含运行禁用态）即弹出完整额度详情卡，打开原生模型下拉菜单时自动互斥隐藏，并在菜单顶部与每个模型行右侧直接内嵌各池实时周余徽章。<br>• **一体式流光玻璃遥测舱**（`.nb-cockpit-bar`）：`24px` 等高展示 `⚡ XX tok/s` ｜ `⏱ 首字 X.Xs` ｜ `🧠 上下文 XXXk/512k`（`38px` 实时水位条）｜ `✦ 输出 X.Xk`；采用基于真实像素溢出的 **5 级无闪烁自适应引擎**（`full -> no-labels -> core -> ctx-only -> hidden`），任何窗口宽度下零裁切。 |
| **星云中枢** (`nebula-hub` v2.0) | • **全自研「三舱 Bento 网格」原生中文控制台**：彻底去 Aura 化，划分为 **「🚀 额度与算力舱」「🎨 视觉与流光舱」「🛡 护栏与系统中枢」**，支持跟随系统/深空暗夜/极光浅色双主题切换与流光边框滑块热调节；全量汉化统计图表、`M/D` 时间轴、工具生态分布，并提供**双语模型命名 (`英文原名 (中文定位)`) 与商业 API 美元/人民币折算及缓存节省估值**。<br>• **斜杠命令 (`/`) 与 120+ 技能全量双语汉化**：统一展示 **`中文名称 (英文原名)`** + 中文描述，个人专属研发技能自动点亮 **`★`** 鎏金星标。<br>• **官方热更新后全自动激活星云主题**：Sidecar 与 `Antigravity Nebula.app` 采用 `/bin/ps` 精确检测主进程与 CDP 状态，无参启动时 1.5 秒内自动无侵入重拉切入主题模式，100% 保护 macOS 官方代码签名。<br>• **多模型额度池监控 & 过期重置自动恢复**：持久化各账号每周重置时间快照，到期自动恢复为 `≈100%` 纳入顺位轮换，15s 同步展示各备选账号每池周余芯片。<br>• **内建全平台防幻觉护栏规则**（`rules/AGENTS.md`）+ **左侧对话轮次阶梯波浪导航栏**。 |
| **项目文件** (`workspace-file-tree`) | • 1:1 还原 **macOS 访达（Finder）四栏列表视图**（`名称 \| 修改日期 \| 大小 \| 种类`）。<br>• 加大至 `32px` 舒适行高、`13.5px` 字体、`18px` **macOS 立体水蓝渐变文件夹图标**与**彩色文稿角标图标**（`M`、`S`、`SH`、`TS`、`JS`、`PY` 等）。<br>• 奇偶行圆角斑马纹交替底色 + 底部访达文件夹路径面包屑 + 项目总数状态栏。<br>• 补齐 macOS / Windows 双端双击在主标签页打开、一键复制 `@引用`、在访达/资源管理器中定位、移至废纸篓/回收站。 |
| **文件启动器** (`file-launcher`) | • 标签栏与菜单全中文命名（`文件启动器`），修复 `plugin://` 深色主题自适应为 Google Gemini `#131314`。<br>• **彻底关闭每次 AI 回复后自动弹出侧边栏**，仅在手动点开时加载。<br>• **修复 502 卡死 & 极致提速（冷启 158ms / 热响应 < 7ms）**：修复 `conv_project_map` 字典键崩溃、新增缺失文件目录倒排索引缓存与增量签名缓存。 |
| **无损迁移 & 版本升级不丢失** | 安装脚本自动清理旧版 `aura-dashboard` / `Antigravity Aura.app`，将已保存的账号金库（`accounts_vault.json`）、切号策略与路由记忆无损迁移至 `~/.gemini/antigravity/plugin_data/nebula-hub/`。 |

---

## 🔔 套件版本发布与推送更新提醒（给维护者）

本仓库内置了基于 [`version.json`](./version.json) 的轻量级自动更新提醒机制：
1. 每次优化主题或扩展代码后，只需修改根目录 [`version.json`](./version.json) 中的 `version`（当前为 `"2.0.0"`）和 `highlights` 更新说明并推送。
2. 所有已安装本套件的 macOS / Windows 用户在打开 Antigravity 时（每 6 小时静默检查一次，或在顶栏点击 **`↻ 更新`** / 星云中枢点击 **「检查更新」**），会自动收到新版本提示卡片，可自由选择 **「立即一键更新」** 或 **「忽略此版本」**。

---

## 📁 仓库目录结构

```text
antigravity-ui-suggestion/ (branch: new-ui-project)
├── docs/
│   ├── implementation_plan.md # 星云中枢 v2.0 全自研模块化重构计划与架构对比
│   └── walkthrough.md         # v2.0 重构变更总结与实测验证报告
├── plugins/
│   ├── nebula-hub/            # 星云中枢（原生中文三舱 Bento 面板 + node:sqlite 遥测 + 扩展服务）
│   ├── workspace-file-tree/   # 项目文件（macOS 访达四栏列表视图 + 双端原生能力）
│   └── file-launcher/         # 文件启动器（极速增量缓存 + 禁自动弹窗 + Gemini 配色）
├── plugin_data/
│   └── nebula-hub/            # 预置 config.json、一体式流光玻璃舱 custom.css、斜杠双语 custom.js、i18n.override.json
├── enable-cdp.mjs             # 跨平台 CDP 调试端口自愈脚本（Windows 文件锁后台自愈）
├── install-mac.sh             # macOS 一键同步脚本（生成 Antigravity Nebula.app 无侵入启动器 + 自动迁移旧账号库）
├── install-win.ps1            # Windows PowerShell 一键同步脚本（含快捷方式注入与旧账号库自动迁移）
├── version.json               # 套件版本清单 (v2.0.0)
└── README.md                  # 本说明文档
```

> [!TIP]
> **macOS 用户说明（`Antigravity Nebula.app`）**：
> 为 100% 保护 `/Applications/Antigravity.app` 的苹果官方代码签名（确保官方热更新永远畅通），`install-mac.sh` 会生成无侵入启动器 `/Applications/Antigravity Nebula.app`；同时若官方热更新重开客户端时未携带调试参数，星云中枢 Sidecar 会在 2 秒内自动触发切入主题模式。
>
> **Windows 用户特别说明（为什么刚跑完脚本还没变中文？）**：
> Windows 系统在 `Antigravity.exe` 运行期间会独占锁定 `resources\app.asar`。本仓库的 `install-win.ps1` 与 `enable-cdp.mjs` 已内置 **Windows 文件锁后台自愈**：只要关掉一次 Antigravity 窗口，后台会在进程退出的 0.5 秒内自动完成 CDP 解锁并重新打开 Antigravity！

---

## 🤝 开源致谢与上游项目引用 (Upstream Credits & Acknowledgements)

本套件参考整合了以下优秀开源项目的架构思路与基础能力，并在 `new-ui-project` 分支完成了面向星云中枢的全面重塑与二次研发，特此向原作者致谢：

| 上游仓库 | 原作者 | 原始能力与本仓库重构优化内容 |
| :--- | :--- | :--- |
| **[sayakaho/Antigravity-Aura](https://github.com/sayakaho/Antigravity-Aura)** | [@sayakaho](https://github.com/sayakaho) (Aura Team) | 提供早期 Sidecar + CDP 注入参考。<br>**本仓库 v2.0 重构**：重塑为自有品牌 **「星云中枢 (`nebula-hub`)」**，移除 688KB `sql-wasm.wasm`（全面改用 Node 22 原生 `node:sqlite`）、剥离 191KB 旧版英文面板与外挂补丁、重写原生中文「三舱 Bento 网格控制台」、定制 Google Gemini 四色流光边框与「一体式流光玻璃遥测舱」、新增 120+ 斜杠技能 `中文 (id)` + `★` 星标引擎与官方热更新后自动激活机制。 |
| **[arco651749/workspace-file-tree](https://github.com/arco651749/workspace-file-tree)** | [@arco651749](https://github.com/arco651749) | 提供右侧栏工作区目录树、文件分栏预览与拖拽 `@` 引用基础框架（`Workspace File Tree`）。<br>**本仓库优化**：重写为 **macOS 访达（Finder）四栏列表视图**（`名称 \| 修改日期 \| 大小 \| 种类`、32px 行高、18px 立体水蓝文件夹与彩色文稿角标、奇偶斑马纹行、底部路径面包屑与项目统计），并补齐了 macOS 原生剪贴板、主标签页打开、访达定位与废纸篓支持。 |
| **[ZOU2850/antigravity-file-launcher](https://github.com/ZOU2850/antigravity-file-launcher)** | [@ZOU2850](https://github.com/ZOU2850) | 提供会话交付物与项目文件隔离发现、多维筛选、内嵌预览与防压缩收藏（`File Launcher`）。<br>**本仓库优化**：统一 Google Gemini 深浅色主题与中文命名、关闭每次回复后自动弹窗，并新增活跃会话 `transcript.jsonl` 增量签名缓存、目录树 TTL 缓存与 `/api/state` 快照缓存及 macOS/POSIX 路径解析修复。 |
| **[elviscjn-cjn/antigravity-context-viewer](https://github.com/elviscjn-cjn/antigravity-context-viewer)** & **PR #4 (@Jia131313)** | [@elviscjn-cjn](https://github.com/elviscjn-cjn) / [@Jia131313](https://github.com/Jia131313) | 提供防幻觉工程护栏提示词理念、`>_ CLI` 终端快捷启动与模型额度池监控思路。<br>**本仓库融合优化**：将其防幻觉提示词整理升级为跨平台原生插件规则（[`plugins/nebula-hub/rules/AGENTS.md`](./plugins/nebula-hub/rules/AGENTS.md)，无需二进制改盘，支持 macOS Intel / Apple Silicon 与 Windows），并将 `>_ CLI` 启动器与模型额度自动轮换直接整合进 **星云中枢**。 |
