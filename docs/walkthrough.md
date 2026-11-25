# 星云中枢 (Nebula Hub v2.0.0) 重构与验证报告

## 1. 完成的核心变更

1. **全新品牌重塑：`星云中枢 (nebula-hub v2.0.0)`**
   - 底层插件目录与配置目录全面切换为 `nebula-hub`（[plugin.json](../plugins/nebula-hub/plugin.json) 署名升级为 `Songh0918`）；
   - 顶栏快捷按钮升级为 **`✦ 星云`**，macOS 无侵入启动器升级为 **`/Applications/Antigravity Nebula.app`**，技能升级为 **`nebula-theme`（`★ 星云中枢控制`）**；
   - 自动将旧版 `aura-dashboard` 下的多账号备选金库（`accounts_vault.json`）、自动切号策略（`suite-auto-switch.json`）与路由记忆无损迁移至 `nebula-hub`。

2. **彻底移除借用黑盒与第三方二进制包（减重 > 880KB）**
   - 删除了 688KB 的 `sql-wasm.wasm` 与 44KB 的 `sql.js` 混淆加载器，全面改用 Node 22 原生内置 `node:sqlite` (`DatabaseSync`)；
   - 剥离了 191KB 的旧版英文 `Aura Dashboard` 内嵌面板与 `suite-panel-addon.js` 外挂补丁，重写为 100% 原生中文的 **「三舱 Bento 网格控制台」**：
     - **`🚀 额度与算力舱`**：多模型每周/5h额度池实时进度卡片 + 多账号顺位自动轮换切号中心 + SQLite 会话与近 30 天吞吐率看板；
     - **`🎨 视觉与流光舱`**：星云专属视觉预设（星云深空 / 曜石碳灰 / 星尘暖曜）、中英与代码字体排版、120+ 斜杠技能双语开关；
     - **`🛡 护栏与系统中枢`**：5 大防幻觉工程护栏（关闭 / 标准 / 严格）一键切换、退出自动恢复会话路由、`>_ agy CLI` 启动器与 GitHub 在线热更新。

3. **输入框底部「一体式流光玻璃舱」(`.nb-cockpit-bar`)**
   - 将原本零散的 4 个小胶囊整合为单条圆角流光毛玻璃驾驶舱条，内部分段展示：
     `⚡ 速率 tok/s` ｜ `⏱ 首字延迟` ｜ `🧠 上下文水位 (内嵌 26px 实时进度槽)` ｜ `✦ 输出 Token`。

4. **独立 Git 新分支隔离保护（`new-ui-project` / `feat/nebula-hub-v2`）**
   - 所有 `v2.0.0` 重构改动均提交在独立新分支（`new-ui-project`），原 `main` 分支（`v1.2.8`，Commit `b36735b`）完好保留，随时可一键切换对比或回滚。

---

## 2. 实测验证结果

- **语法与模块校验**：`main.mjs`、`suite-extensions.mjs`、`app.js`、`custom.js` 全部通过 `node --check`。
- **Language Server 插件发现校验**：`GetAllPlugins` 已确认识别并启用 `nebula-hub`（含 `nebula-theme` 技能），旧 `aura-dashboard` 已清理无冲突。
- **数据无损迁移校验**：`~/.gemini/antigravity/plugin_data/nebula-hub/accounts_vault.json`（13,146 字节）及全部策略文件已 100% 迁移就绪。
- **CDP 实时热更新校验**：已热推送至当前打开的 Antigravity 窗口，顶栏按钮已实时切换为 **`✦ 星云`**，底部遥测条已切换为 **一体式流光玻璃舱**。

---

## 3. 主题工坊与全量中文统计升级

1. **主题外观与流光引擎补齐**（[styles.css](../plugins/nebula-hub/sidecars/dashboard/styles.css)、[index.html](../plugins/nebula-hub/sidecars/dashboard/index.html)、[app.js](../plugins/nebula-hub/sidecars/dashboard/app.js)）
   - 新增完整 `html[data-theme="light"]` 极光浅色变量体系，支持 `跟随系统 / 深空暗夜 / 极光浅色` 实时切换与本地状态持久化。
   - 拆分为独立暗夜预设（`星云深空 / 曜石碳灰 / 星尘暖曜`）与日间预设（`极光原生 / 高对比暖白 / 极光纯白`），并将流光边框转速、粗细、开关暴露为实时 CSS 变量零重启热推送。
   - [version.json](../version.json) 与 [suite-version.json](../plugin_data/nebula-hub/suite-version.json) 均写入 `"branch": "new-ui-project"`，锁定测试阶段检查更新分支以防误覆盖回 `main`。
2. **全量中文统计与「模型 Token 用量分布」双语/API 折算**
   - 全面汉化 KPI 单位（`次调用`、`轮`、`秒`）、图表标题与图例（`Token 活跃趋势（近 30 天）`、`模型生成速率趋势（流式 · 端到端回退）`、`单轮耗时与首字延迟分布`、`缓存读取`）、`M/D` 数字日期刻度（修复模型速率曲线时间轴排序）、`TOOL_META` 工具分类/名称与工作区/账号汇总区。
   - 新增 `formatModelDisplay()` 与 `calcCacheSavings()`（`USD_TO_CNY = 7.25`）：模型行展示「`英文原名 (中文定位)`」（如 `Gemini 4 Neon (霓虹·高阶推理)`、`Gemini 3.8 Flash N (闪速轻量)`、`Claude Opus 5.5 (旗舰·高)`），自动隐藏 `0 Token` 重复行，并在 `#nb-models-summary` 与每行展示折算美元/人民币费用及 Prompt 缓存节省估算；同时对齐后台账户账单口径优先计算总价值。

---

## 4. 多账号每周余额同步与过期重置自动恢复

1. **结构化池快照与到期自动回满**（[suite-extensions.mjs](../plugins/nebula-hub/sidecars/dashboard/suite-extensions.mjs)）
   - 新增 `resolveEffectivePoolSnapshot()` 与 `formatAccountPools()`：`evaluateAutoSwitch()` 保存带 `weeklyResetTime` 的结构化 `pools` 快照（同时兼容旧版扁平键）；`pickNextCandidate()` 判定当 `now > Date.parse(weeklyResetTime)` 时按已重置恢复至 `100%`（`resetRecovered: true`）纳入轮换，未到期低余额候选才严格按顺位跳过。
2. **多端同步节奏提速**（[app.js](../plugins/nebula-hub/sidecars/dashboard/app.js)、[custom.js](../plugin_data/nebula-hub/custom.js)）
   - 控制台每 `15s` 自动刷新 `syncAutoSwitch()`，并在每个备选账号下方展示 `.nb-acct-pool-tags`（`.nb-pool-chip` 每池周余 `%` / `已重置 ≈100%`）与 `fmtSyncAgo()` 相对同步时间。
   - 宿主端加入启动阶梯快同步（`800ms -> 3200ms -> 8000ms`），并收紧非强制轮询与回合结束触发节流（`7000ms` / `8000ms`，延迟 `1200ms`）。

---

## 5. 模型入口额度整合、流光玻璃模型胶囊与 5 级零裁切底栏

1. **彻底移除底栏独立额度胶囊，整合进模型入口**（[custom.js](../plugin_data/nebula-hub/custom.js)、[custom.css](../plugin_data/nebula-hub/custom.css)）
   - 移除 `#nb-live-quota-pill`（热更新时自动 `.remove()` 清理旧节点），释放底栏横向空间。
   - **模型按钮双态悬停浮窗**：空闲态悬停 `[data-testid="model-selector-trigger"]` 经 `180ms` 延迟在正上方弹出 `#nb-live-quota-popover`；智能体运行中按钮禁用态同样支持悬停/点击只读查额度；浮窗底部加 `14px` 透明悬停桥接（`::after`）与 `220ms` 离焦缓冲，点击打开原生模型菜单瞬间互斥隐藏浮窗。
   - **原生「模型」下拉菜单内嵌实时余量**（`enhanceOpenModelMenu()` + `matchQuotaGroupForLabel()`）：菜单顶部注入 `.nb-menu-qheader`（各池 `周/5h` 速览 + 本会话扣减 + 不关闭菜单的 `↻` 刷新按钮）；在不改写 React 文本的前提下于每行尾端箭头/勾选前插入右对齐 `.nb-menu-qbadge`（兼容无箭头行与底部 `查看用量` 行 `5h XX%` 摘要，自动跳过二级思考深度子菜单）。
2. **同款流光玻璃模型胶囊 & 遥测驾驶舱扩宽 + 5 级真实像素零裁切引擎**
   - 为 `[data-testid="model-selector-trigger"]` 配备与右侧遥测胶囊同款的 `24px` 圆角玻璃背景、悬停/展开蓝紫光晕及动态配额健康呼吸点（`data-nb-quota-level="ok|warn|crit"`）。
   - 将 `.nb-cockpit-bar` 扩宽至 `24px` 等高、`10px` 段间距与 `38px` 上下文进度槽；`ensureComposerResponsiveObserver()` 改为在 `requestAnimationFrame` 内基于真实像素溢出逐级求解 `data-nb-metrics-tier`（`full -> no-labels -> core -> ctx-only -> hidden`，计入 `::before` 宽并隐藏 `hidden` 时孤立竖线分隔符），做到任意窗口/侧栏宽度下零裁切。

---

## 6. macOS 无侵入自动切入主题模式修复

- **根因**：macOS 上 `pgrep` 默认忽略自身祖先进程，导致由 `Antigravity -> language_server` 拉起的 `nebula-hub` sidecar 内 `autoEnsureCdpModeOnStartup()` 执行 `pgrep` 恒返回空并静默退出。
- **修复**：在 [suite-extensions.mjs](../plugins/nebula-hub/sidecars/dashboard/suite-extensions.mjs) 新增 `findDarwinAntigravityProcess()` 并重写 [install-mac.sh](../install-mac.sh) 中 `Antigravity Nebula.app/Contents/MacOS/launch` 的 `get_main_pid()`，全面改用 `/bin/ps -axo pid=,command=` 精准定位主进程，直接检查命令行 `--remote-debugging-port` 参数并完善 `kill -TERM` 退出等待，**全程不改动 `/Applications/Antigravity.app` 与 `app.asar`**（保留官方热更新与签名）。

---

## 7. 公司电脑接力指南（Office Handoff）

### 一键同步命令
- **macOS（如果还没克隆）**：
  ```bash
  git clone -b new-ui-project https://github.com/Songh0918/antigravity-ui-suggestion.git
  cd antigravity-ui-suggestion && bash install-mac.sh
  ```
- **macOS（如果已有仓库）**：
  ```bash
  git fetch origin && git checkout new-ui-project && git pull origin new-ui-project && bash install-mac.sh
  ```
- **Windows PowerShell**：
  ```powershell
  git fetch origin; git checkout new-ui-project; git pull origin new-ui-project
  powershell -ExecutionPolicy Bypass -File .\install-win.ps1
  ```

### 核心开发约定（继续开发必读）
1. **双副本强一致**：修改 `plugin_data/nebula-hub/{custom.js,custom.css,i18n.override.json,suite-version.json}` 后，**必须**同步复制到 `plugins/nebula-hub/sidecars/dashboard/user/` 对应文件，提交前用 `diff -q` 校验一致。
2. **零改包原则**：绝不修改 `/Applications/Antigravity.app/Contents/Resources/app.asar`（例如 macOS `Cmd + Q` 原生退出框硬编码在主进程 `dialog.showMessageBox` 中，保持原版才能保障官方热更新与苹果签名）。
3. **提交前快速校验**：
   ```bash
   node --check plugins/nebula-hub/sidecars/dashboard/app.js && \
   node --check plugins/nebula-hub/sidecars/dashboard/suite-extensions.mjs && \
   node --check plugin_data/nebula-hub/custom.js && \
   bash -n install-mac.sh && \
   diff -q plugin_data/nebula-hub/custom.js plugins/nebula-hub/sidecars/dashboard/user/custom.js && \
   diff -q plugin_data/nebula-hub/custom.css plugins/nebula-hub/sidecars/dashboard/user/custom.css
   ```

### 公司电脑后续待办（Next Steps）
- [ ] 在公司电脑（Windows / 另一台 Mac）拉取并实装，联调验证 `install-win.ps1`、模型悬停浮窗、原生模型下拉菜单行内周余徽章与同款流光玻璃模型胶囊效果。
- [ ] 检查浅色主题与极窄窗口下模型菜单徽章对齐及 5 级遥测缩放细节。
- [ ] 实机观察多账号周额度过期重置恢复（`已重置 ≈100%`）与低阈值自动轮换切号。
- [ ] 全部验收无误后，从 `new-ui-project` 合入 `main` 并更新 `version.json` 触发端内热更新提醒。
