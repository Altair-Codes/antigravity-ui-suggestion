# 引力套件 (Gravity Suite v2.1.0) 全自研重构与体验修复验证报告

## 一、v2.1.0 核心升级与修复（`main` 主分支）

### 1. 统一品牌重塑：引力套件 (`Gravity Suite v2.1.0`)
- 契合 **Antigravity（反重力 / 引力）** 宿主命名，全面升级为纯 Node.js 22+（ESM + 原生 `node:sqlite`，零 Python、零外部依赖）三扩展家族：
  - **引力中枢 ([`gravity-hub`](../plugins/gravity-hub/README.md))**（由 `nebula-hub` 升级更名，保留 `plugin_data/gravity-hub` 与 `sidecar_data/gravity-hub/dashboard`，无损迁移 `nebula-hub` / `aura-dashboard` 历史账号库与偏好）
  - **引力目录 ([`gravity-explorer`](../plugins/gravity-explorer/README.md))**（全自研纯 Node.js 替代原 `workspace-file-tree`，彻底移除 `highlight.min.js`、`pdf.min.js`、`pele.global.js` 等第三方大文件）
  - **引力文库 ([`gravity-vault`](../plugins/gravity-vault/README.md))**（全自研纯 Node.js 22+ `node:sqlite` 替代原 `file-launcher`，彻底清除 5,600+ 行 Python 与 `file_capsules.html` / `18765` 端口旧机制）
- macOS 无侵入启动器同步更名为 `/Applications/Antigravity Gravity.app`（`install-mac.sh` 自动清理旧版 `Antigravity Aura.app` 与 `Antigravity Nebula.app`，100% 保护官方苹果代码签名）。
- [README.md](../README.md) 与各插件文档已**彻底清理全部外部致谢与第三方仓库链接**，版本号升级至 `2.1.0`。

### 2. 修复「账号 Token 用量分布」统计与热力图
- **口径修正**（[app.js](../plugins/gravity-hub/sidecars/dashboard/app.js)、[index.html](../plugins/gravity-hub/sidecars/dashboard/index.html)）：
  - 顶部汇总改为统计 **真实已登录账号数**，不再把「早期未跟踪历史」误算为第 3 个真实账号；
  - 通过全局 `conversationIds` 并集对跨账号会话严格 **去重**；
  - 早期历史行补齐 `Token` 总量显示，确保各分项与顶部总计口径一致。
- **早期历史持久化偏好与一键归属**（[suite-extensions.mjs](../plugins/gravity-hub/sidecars/dashboard/suite-extensions.mjs) `GET/POST /api/suite-account-prefs`）：
  - 支持在面板勾选 **「隐藏早期未跟踪历史」**、通过下拉框或早期历史行右侧 **「一键归属」** 按钮合并至指定主账号（含每日明细、近 30/90 天/1 年热力图及去重会话合并，随时可撤回），并说明「Antigravity 本地库未记录历史邮箱，此为开启账号追踪前的历史记录」。

### 3. 输入框窄屏/分屏零遮挡自适应 & 右侧分栏高斯模糊柔和过渡
- **真实右边界硬碰撞求解**（[custom.js](../plugin_data/gravity-hub/custom.js)、[custom.css](../plugin_data/gravity-hub/custom.css)、[main.mjs](../plugins/gravity-hub/sidecars/dashboard/main.mjs)）：
  - `ensureComposerResponsiveObserver()` 实时探测右侧控制组（`极速模式` / 语音 / 发送按钮）的最小 `getBoundingClientRect().left` 作为硬碰撞右边界；
  - 升级适应序列为 `full -> compact -> no-labels -> core -> ctx-only -> docked-top`；当屏幕过窄时自动将遥测条停靠到输入框底栏正上方 `22px` 独立迷你信息条 (`#nb-docked-metrics-strip`)，并在 `main.mjs` 写入 `m.dataset.nbDocked !== "1"` 保护防止闪烁拉回；窗口拉宽后自动恢复单行内联。
  - 展开/收起右侧分栏（或点击顶部 `✦ 引力` / 关闭辅助标签）瞬间为 `[data-testid="conversation-view"]` 添加 `data-nb-pane-morphing="1"`，启用 GPU 高斯模糊过渡与防抖重排，消除比例缩放卡顿感。

### 4. 上下文超阈值自动压缩 (`/compact`)
- **会话记忆区配置与跨窗口监听**（[suite-extensions.mjs](../plugins/gravity-hub/sidecars/dashboard/suite-extensions.mjs) `GET/POST /api/suite-auto-compact`、[index.html](../plugins/gravity-hub/sidecars/dashboard/index.html)、[app.js](../plugins/gravity-hub/sidecars/dashboard/app.js)、[custom.js](../plugin_data/gravity-hub/custom.js)）：
  - 在 **引力中枢 → 护栏与系统中枢 → 会话记忆、CLI 终端与在线热更新中心** 提供 **「当前对话上下文超阈值自动压缩 (/compact)」** 开关与阈值设置（默认 `500k Token`，支持 `100`~`1000`）。
  - 宿主窗口实时监听 `window.__ag_last_metrics.ctxTok`：仅当命中对话页、智能体空闲超过 `2.5s`、输入框无用户草稿且未在冷却期/重复签名内时，自动填入 `/compact` 并提交释放上下文。

---

## 二、实测验证记录

1. **全量语法检查**：
   - `node --check` 全部 14 个 `.js` / `.mjs` 文件（含 `enable-cdp.mjs`、`custom.js`、`gravity-hub`、`gravity-explorer`、`gravity-vault`）全部退出码 `0`。
   - `bash -n install-mac.sh` 退出码 `0`。
   - 外部致谢检索：`README.md` 与 `plugins/gravity-*/README.md` 零外部作者与仓库致谢残留。
2. **Node.js 模块功能实测**：
   - `gravity-explorer/sidecars/panel/explorer-core.mjs`：`listDirectory`（返回 8 个根条目）、`searchTree`、路径穿越拦截（`../outside -> null`）、Markdown/代码预览读取全部通过。
   - `gravity-vault/sidecars/dock/{store.mjs,scanner.mjs}`：旧版 `file_launcher_config.json` 迁移（正确忽略 Windows 盘符并迁移收藏）、防重名无覆盖归档（自动生成 `(2)` 后缀）、以及基于原生 `node:sqlite` 读取真实 `conversation_summaries.db`（65 个会话）与当前会话扫描（29 个条目）全部通过。
   - `gravity-hub/sidecars/dashboard/suite-extensions.mjs`：隔离启动桥接服务验证 `GET / POST /api/suite-account-prefs` 读写持久化通过。
3. **本机同步安装校验 (`bash install-mac.sh`)**：
   - 已安装插件清单仅包含 `gravity-hub`、`gravity-explorer`、`gravity-vault`，旧版 `aura-dashboard`、`nebula-hub`、`workspace-file-tree`、`file-launcher` 已全部清除；
   - `/Applications/Antigravity Gravity.app/Contents/MacOS/launch` 已生成并可执行，旧版 `Antigravity Nebula.app` / `Antigravity Aura.app` 已移除；
   - 全部核心文件及 3 个 `gravity-hub` 数据目录经 `diff -q` 校验与仓库 100% 一致，全部 3 个 `sidecar.json` 已适配本机 Node.js v22.22.3。

---

## 三、手动复测清单（重启 Antigravity 后建议体验）

1. 完全退出 Antigravity（`Cmd + Q`），通过 `/Applications/Antigravity Gravity.app` 重新打开。
2. 打开右上角 **`✦ 引力`** → **账号 Token 用量分布**：核对真实账号计数、去重会话数，并试切「隐藏早期未跟踪」「归属主账号」及「近 30 天 / 近 90 天」热力图。
3. 拖动缩放窗口宽度至窄屏/分屏：确认输入框遥测胶囊自动收缩并平稳切入上方独立迷你信息条 (`docked-top`)，与 `极速模式` / 语音 / 发送按钮零遮挡。
4. 在右侧「扩展」菜单打开 **`引力目录`** 与 **`引力文库`**：确认访达四栏浏览、底部轻量预览、原生 `fileView` 标签直开、一键复制 `@引用` 与按日归档正常。
