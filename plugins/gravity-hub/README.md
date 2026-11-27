# 引力中枢 (`gravity-hub` v2.2.0)

**引力中枢 (Gravity Hub)** 是为 Google Antigravity 桌面端打造的原生插件与 Sidecar 驾驶舱，由 `Altair-Codes` 面向全中文研发场景构建（仓库：[`Altair-Codes/antigravity-ui-suggestion`](https://github.com/Altair-Codes/antigravity-ui-suggestion)）。

---

## 核心特性

1. **「四舱 Bento 网格」原生中文控制台**（[`sidecars/dashboard/index.html`](./sidecars/dashboard/index.html) / [`app.js`](./sidecars/dashboard/app.js)）
   - **🚀 额度与算力舱**：实时同步 Gemini / Claude / Argon 每周与 5 小时剩余额度，支持多账号备选金库管理、顺位轮换与低额度自动切号；基于 Node 22+ 原生 `node:sqlite` 解析会话遥测，支持真实账号数去重统计、早期未跟踪历史隐藏或一键归属到指定主账号，并提供近 30/90 天/1 年紧凑活跃热力图。
   - **📚 历史目录与前缀缓存雷达**（[`history-index.mjs`](./sidecars/dashboard/history-index.mjs)）：
     - **0 额外模型调用 & 真增量**：基于 `file_identity` + `byte_offset` 增量读取 `transcript.jsonl`（带半行截断保护与单会话截断原子重建）；排除 `thinking` 与冗长日志，仅索引轮次骨架、实体与中文双字（CJK Bigram + FTS5 + 精确通道）。
     - **防幻读四级证据与漂移校验**：区分 `用户确认` / `工具实测` / `曾调用·结果未核` / `助手陈述`，展开或引用前 0 Token 实时核对本地文件是否 `未变 / ⚠已变更待复核 / ✕来源缺失`，并联动 `gravity-vault` 收藏标记。
     - **稳定前缀摘录打包器**：默认上限 3 条 / 1,200 UTF-8 字节，确定性顺序拼接无动态时间戳纯文本与行号出处，帮助新会话快速建立高复用 Prefix Cache。
     - **可控同项目跨会话 & 切号隔离**：默认关闭跨会话，开启后按规范化工作区路径（兼容 Windows `file:///C:/` 与 UNC 路径）或非默认 `project_id` 匹配同项目会话，切号自动递增 `accountEpoch` 清空旧视图。
   - **🎨 视觉与流光舱**：内置引力深空、曜石碳灰、星尘暖曜等主题预设、系统字体排版选择器、字号微调及 Google 五色高精度 OKLab 流光边框实时调节（41 线性节点 / 51 环形闭环节点，支持减速降级与温和呼吸光晕）。
   - **🛡 护栏与系统中枢**：一键切换 4 档静态节俭防幻觉护栏（`关闭` / `极简 Lite` / `标准` / `严格`，同步写入 [`rules/AGENTS.md`](./rules/AGENTS.md)）、退出自动恢复上次会话页面、可选上下文超阈值自动 `/compact`、`>_ agy CLI` 代理注入启动及 GitHub 在线更新检查。

2. **零遮挡自适应「一体式流光玻璃遥测舱」(`.nb-cockpit-bar`)**
   - 在输入框底栏集中呈现 `⚡ 速率 tok/s` ｜ `⏱ 首字延迟` ｜ `🧠 上下文水位 (内嵌进度条)` ｜ `✦ 输出 Token`，悬停浮窗新增 **前缀缓存命中率** 与热/冷状态决策提醒；极窄分屏自动切换为底栏上方独立迷你信息条 (`docked-top`)。

3. **斜杠命令 (`/`) 与 120+ 技能全量双语引擎**
   - 自动将内置命令、MCP 提示词与全部技能格式化为 **`中文名称 (英文原名)`** 并翻译描述与悬停卡片，为个人专属研发技能点亮 **`★`** 鎏金星标，同时完整保留英文模糊过滤高亮与指令注入能力。

4. **零侵入保护官方热更新**
   - macOS 下不修改 `Antigravity.app` 核心包与签名，配合 `Antigravity Gravity.app` 启动器与 `autoEnsureCdpModeOnStartup()`，在官方热更新重开后 2 秒内自动恢复引力主题模式。

---

## 常用 Sidecar HTTP API

- `GET /api/status`：查看 CDP 连接状态、已挂载窗口数与当前一体式遥测快照
- `GET / POST /api/config`：读取或热更新引力视觉、字体、语言与遥测开关配置
- `POST /api/reload`：重新加载 `user/*` 并通过 CDP 热推送到所有窗口
- `GET /api/analytics/overview` & `/api/analytics/session`：获取全局与当前会话的 `node:sqlite` 算力遥测数据
- `GET /api/suite-history/overview` & `/search` & `/turn` & `/verify`：读取历史目录概览、四路混合检索、按字节切片展开单轮与实时文件漂移校验
- `POST /api/suite-history/pin` & `/pack` & `/sync` & `/reset`：轮次收藏置顶、生成 ≤1,200B 稳定前缀摘录包、增量同步与重建索引
- `GET / POST /api/suite-history/prefs` & `/navigate`：同项目跨会话开关/账号 `accountEpoch` 状态与原轮定位导航
- `GET / POST /api/suite-account-prefs`：读取或持久化账号分布隐藏/归属及 30/90 天/1 年热力图偏好
- `GET / POST /api/suite-auto-compact`：读取或配置对话上下文超阈值自动 `/compact` 策略与最近触发记录
- `GET / POST /api/suite-quota` & `/api/suite-auto-switch`：读取/更新模型额度缓存与多账号顺位自动切号策略
- `GET / POST /api/suite-guardrails`：查询或切换防幻觉节俭工程护栏等级（`off` / `lite` / `standard` / `strict`）
- `POST /api/suite-relaunch-cdp`：通过 `Antigravity Gravity.app` 无感重启并切入主题模式
