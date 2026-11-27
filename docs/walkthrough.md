# 引力套件 (`Gravity Suite v2.2.0`) 功能特性与实测验证报告

## 一、`v2.2.0` 核心升级概览

### 1. 引力中枢新增「📚 历史目录」与前缀缓存命中雷达（0 额外模型调用）
- **真增量字节偏移索引**（[history-index.mjs](../plugins/gravity-hub/sidecars/dashboard/history-index.mjs)）：
  - 基于 Node 22 原生 `node:sqlite`（WAL 模式），使用 `session_cursors` 记录 `file_identity` 与 `byte_offset`，仅读取新增完整 JSONL 行并同事务提交；支持半行截断保护、文件截断单会话原子重建以及缺失 `transcript.jsonl` 优雅降级。
  - `thinking` 与超长工具日志不入索引，浏览、搜索、校验、展开全程 **0 新增模型请求、0 自动发送**。
- **四路混合检索**：
  - B-Tree 精确实体通道（文件路径、符号、错误码）+ FTS5 `unicode61`（驼峰/下划线拆分）+ 本地中文双字 `CJK Bigram` 副列（解决 `unicode61`/`trigram` 无法匹配两字中文词的问题）+ 单字兜底与指纹去重。
- **防幻读四级证据与 0 Token 文件漂移校验**：
  - 严格区分 `user_confirm`（用户确认）、`tool_verified`（有真实成功返回）、`tool_called`（无返回/被截断/非零退出码，绝不标为已实测）、`assistant_note`（助手历史陈述）；
  - 展开或打包时实时对比首次记录的 `(mtime, size, exists)` 快照并联动 `gravity-vault` `pins.json`，标出 `文件未变` / `⚠ 文件已变更·待复核` / `✕ 来源缺失`。
- **稳定前缀摘录打包器 & 缓存雷达**：
  - 默认上限 **3 条 / 1,200 UTF-8 字节**，确定性升序输出无动态时间戳纯文本与行号出处，保护新会话 Prompt Prefix Cache；
  - 依据 `transcript.jsonl` 真实字段按 `cache_read_tokens / (input_tokens + cache_read_tokens)` 计算真实前缀缓存命中率，在历史目录与宿主遥测浮窗展示热缓存保护 / 冷缓存高上下文建议开新会话提醒。
- **可控同项目跨会话 & 4 档静态节俭护栏**：
  - 默认关闭跨会话，开启后按规范化工作区路径（兼容 Windows `file:///C:/`、盘符大小写与 UNC 路径）或有效 `project_id` 匹配同项目会话，切号递增 `accountEpoch` 清空旧视图；
  - [suite-extensions.mjs](../plugins/gravity-hub/sidecars/dashboard/suite-extensions.mjs) 新增极简 `lite` 护栏，精简 `standard` / `strict` 常驻体积并融入「大文件定位行号切片读、长日志截断、不重读未变文件」节俭检索纪律。

### 2. 引力目录新增代码/Markdown 骨架大纲与精确 `@行段引用`
- [explorer-core.mjs](../plugins/gravity-explorer/sidecars/panel/explorer-core.mjs)、[preview.js](../plugins/gravity-explorer/sidecars/panel/preview.js)、[app.js](../plugins/gravity-explorer/sidecars/panel/app.js)：
  - 按 `mtime:size` 缓存解析 JS/TS/ESM（含 Sidecar API 路由）、Markdown（跳过代码块围栏）、Python、Go、Java、Vue 的符号与标题起止行号（`POST /api/outline`）；
  - 预览抽屉支持一键展开大纲、点击滚动高亮目标行段，以及一键复制 `@relPath#L起-L止`（统一正斜杠相对路径）。

### 3. 全套小问号 `?` 交互说明与视觉/多账号基线
- 在引力中枢「历史目录」和「护栏与系统中枢」6 处关键控件与引力目录大纲栏补充 `?` 悬浮/点击说明提示；
- 完整保留 `v2.1.x` 的 Google 五色高精度 OKLab 51 节点流光、零遮挡遥测玻璃舱、120+ 双语斜杠技能、多账号双限额自动轮换与无侵入启动器能力。

---

## 二、本机实测验证记录（macOS · Node.js 22+）

1. **语法与资产一致性校验（全部 exit 0）**：
   - 全部核心 JS/MJS 文件通过 `node --check`；`install-mac.sh` 通过 `bash -n`；
   - `diff -u` 确认双份 `custom.js`（`plugin_data/` 与 `plugins/`）及 3 份 `version.json` / `suite-version.json` 完全一致；全仓无遗漏旧版本号 `2.1.5`。
2. **全量自动化测试与压测（`node --test tests/history-index.test.mjs tests/explorer-outline.test.mjs tests/release-v220-verify.test.mjs`，17/17 通过，fail 0，skipped 0）**：
   - **高容量压测（10,000 轮 + 500 轮增量 + 100 次检索 + 30 次切片详情）**：
     - 10,000 轮首次建库：`10027.62 ms`
     - 追加 500 轮增量同步：`1142.22 ms`（仅读取尾部 `290,317 B`，非全量重建）
     - 100 次混合检索：`searchP50 = 13.52 ms`、`searchP95 = 15.67 ms`、`searchP99 = 17.4 ms`（远低于 `200 ms` 目标）
     - 30 次按字节偏移定点展开：`detailP50 = 0.05 ms`、`detailP95 = 0.16 ms`
   - **防幻读审计矩阵**：
     - 无返回调用 / 截断输出 / 非零退出码 / 口头“已修复”全部 **0 误标**为 `tool_verified`（`falseVerified = 0`）；
     - 文件未变 / 修改漂移 / 删除缺失全部准确识别并在摘录中附带 `⚠` / `✕` 警示；
     - 跨项目检索串漏 `= 0`、越权跨项目打包拒绝 `= true`、切号 `accountEpoch` 递增隔离 `= true`。
   - **检索命中率与鲁棒性审计**：
     - 12 类正样本（中文双字「跨月/幻觉/缓存」、多字「额度重置」、路径、API 路由、驼峰、POSIX/HTTP 错误码、单字兜底）命中 **`12/12`（召回率 100%）**；
     - `thinking` 独有词与 FTS5 特殊字符查询（`a-b:c*d/e"f(g)`、`OR AND NOT *`）误报 **`0`**、异常 **`0`**。
3. **本机真实数据只读冒烟测试（已验证）**：
   - 真实 `transcript.jsonl` 同步 `15.56 ms`，按真实口径计算出 `lastHitRatePct = 98.3%`（`hot`）、`avgHitRatePct = 87.4%`，3 条稳定前缀包 `1028 B`（估算约 `245 tok`）；
   - 同项目跨会话识别当前项目 `antigravity-ui-suggestion` 下 `2` 个会话并命中关键词；仓库 `suite-extensions.mjs` 提取 `106` 项大纲，`README.md` 提取 `16` 项标题大纲。

> [!NOTE]
> **Windows 真机说明（未验证范围）**：Windows 路径/URI 归一化（`file:///C:/...`、盘符大小写、UNC）、CRLF 换行解析及 `dev/ino=0` 回退已在 macOS 上通过显式 `platform="win32"` 单元测试验证；Windows 客户端真机联调与 `install-win.ps1` 实机运行待在 Windows 环境实测确认。
