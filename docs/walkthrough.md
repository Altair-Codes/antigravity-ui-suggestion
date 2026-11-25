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
