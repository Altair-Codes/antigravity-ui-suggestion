---
name: nebula-theme
description: 控制、检查与配置 Antigravity 星云中枢 (nebula-hub) 插件——涵盖 Google Gemini 流体主题预设、字体排版、全量中英双语与斜杠技能汉化、一体式流光遥测玻璃舱、多账号周额度自动轮换、防幻觉工程护栏、CDP 热重载与 Sidecar HTTP API。
---

# Antigravity 星云中枢 (`nebula-hub`) 控制与技术参考

- 打开右侧星云中枢面板：`[星云中枢](sidecar://nebula-hub/dashboard/)`
- 打开插件管理详情页：`[星云中枢](customization://nebula-hub)`

## 1. 数据目录与配置层 (`PLUGIN_DATA`)
默认路径：`~/.gemini/antigravity/plugin_data/nebula-hub/`
- `config.json`：星云中枢主配置文件（主题预设、字体排版、遥测间隔、双语开关）。
- `custom.css`：Google Gemini 四色流光输入框、一体式流光遥测玻璃舱与斜杠菜单样式。
- `custom.js`：顶栏 `>_ CLI` / `✦ 星云` / `↻ 更新` 按钮、额度实时采集、路由记忆及 120+ 技能双语引擎。
- `i18n.override.json`：自定义汉化覆盖词典。

## 2. 核心 HTTP 接口
- `GET /api/status`：CDP 连接状态、一体式遥测实时数据与当前预设。
- `GET / POST /api/config`：读取或热更新星云视觉与字体配置。
- `POST /api/reload`：重新编译 `user/*` 并通过 CDP 热推送到所有宿主窗口。
- `GET /api/analytics/overview` & `/api/analytics/session`：全局与当前会话的 `node:sqlite` 算力统计。
- `GET / POST /api/suite-quota` & `/api/suite-auto-switch`：模型周/5h额度池与多账号顺位自动轮换策略。
- `GET / POST /api/suite-guardrails`：防幻觉工程纪律护栏（`off` / `standard` / `strict`）实时切换。
