# 引力套件 (`Gravity Suite v2.2.0`) 架构与核心引擎设计

## 一、整体定位与套件组成

**引力套件 (`Gravity Suite v2.2.0`)** 面向 Google Antigravity 桌面端打造，完全基于原生 **Node.js 22+（ESM + `node:sqlite`）** 运行，所有插件与配置均存放在用户目录 `~/.gemini/` 下，完整保留官方客户端代码签名与热更新能力。

| 扩展标识 | 中文名称 | 核心职责 |
| :--- | :--- | :--- |
| `gravity-hub` | **引力中枢** | 四舱 Bento 中文控制台、**「📚 历史目录」真增量索引与前缀缓存雷达**、`node:sqlite` 会话算力与账号统计、可选上下文超阈值自动 `/compact`、Google 五色 OKLab 视觉引擎、120+ 技能双语及 4 档节俭防幻觉工程护栏 |
| `gravity-explorer` | **引力目录** | macOS 访达风格四栏项目目录浏览器、轻量分栏预览、**按 `mtime` 缓存的代码/Markdown 骨架大纲与 `@行段引用`**、原生 `fileView` 标签打开与跨窗口拖拽 |
| `gravity-vault` | **引力文库** | 基于 `node:sqlite` + 增量扫描的会话交付文档管理，支持三层范围隔离、一键 `@引用` 复制与 `★` 收藏保护（联动历史目录） |

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

---

## 四、`v2.2.0` 历史目录、防幻读、缓存命中守护与大纲架构

1. **字节偏移真增量索引 (`history-index.mjs`)**：
   - 使用 `session_cursors` 保存 `file_identity`、`byte_offset`、`line_no`、`schema_status`，仅读取新增完整 JSONL 行并在同一 SQLite 事务内提交；文件截断/替换自动单会话原子重建，缺失转录文件优雅降级；`thinking` 与超长工具 stdout 不入库。
2. **四路混合检索**：
   - 精确通道（B-Tree 匹配路径/符号/错误码）+ FTS5 `unicode61`（英文与驼峰拆分）+ 本地中文双字 `CJK Bigram` 副列（解决 `unicode61`/`trigram` 无法命中两字中文的问题）+ 单字兜底，并按内容指纹去重。
3. **防幻读证据分级 & 稳定前缀摘录**：
   - 严格区分 `user_confirm`、`tool_verified`、`tool_called`（截断或非零退出码禁止晋升）、`assistant_note`；首次索引记录本地文件 `(mtime, size, exists)` 快照，展开与打包前执行 0 Token 漂移校验；打包器默认上限 3 条 / 1,200 UTF-8 字节，按固定轮次升序输出无动态时间戳的纯文本，保护新会话 Prompt Prefix Cache。
4. **前缀缓存命中雷达 & 静态护栏瘦身**：
   - 依据 `transcript.jsonl` 真实计量口径按 `cache_read_tokens / (input_tokens + cache_read_tokens)` 计算真实前缀缓存命中率，区分热缓存保护（`≥75%`）与冷缓存高水位建议开新会话（`<40%` 且 `≥120k`）；新增 `lite` 护栏并精简 `standard`/`strict` 常驻体积（保持纯静态零缓存破坏）。
5. **可控同项目跨会话与 Windows 兼容**：
   - 默认仅检索当前会话；开启 `crossSessionEnabled` 后按 `toPathCompareKey` 归一化的工作区路径（支持 Windows `file:///C:/...`、盘符大小写、UNC 与 `dev/ino=0` 回退）或有效 `project_id` 匹配同项目会话，切号递增 `accountEpoch` 强制清空旧视图；过滤 `/api/...`、`/c/...` 路由噪音。
6. **引力目录骨架大纲 (`explorer-core.mjs`)**：
   - 按 `mtime:size` 缓存解析 JS/TS/ESM/API 路由/Python/Go/Java/Vue/Markdown 大纲，支持预览抽屉定位高亮与一键复制 `@relPath#L起-L止`。
