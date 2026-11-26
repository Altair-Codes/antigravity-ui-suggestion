---
name: gravity-theme
description: 控制、检查与配置 Antigravity 引力中枢 (gravity-hub) 插件——涵盖 Google Gemini 流体主题预设、字体排版、全量中英双语与斜杠技能汉化、零遮挡一体式流光遥测玻璃舱、多账号周额度自动轮换、防幻觉工程护栏、CDP 热重载与 Sidecar HTTP API。
---

# Antigravity 引力中枢 (`gravity-hub`) 控制与技术参考

- 打开右侧引力中枢面板：`[引力中枢](sidecar://gravity-hub/dashboard/)`
- 打开插件管理详情页：`[引力中枢](customization://gravity-hub)`

## 1. 数据目录与配置层 (`PLUGIN_DATA`)
默认路径：`~/.gemini/antigravity/plugin_data/gravity-hub/`
- `config.json`：引力中枢主配置文件（主题预设、字体排版、遥测间隔、双语开关）。
- `custom.css`：Google Gemini 四色流光输入框、零遮挡一体式遥测玻璃舱与斜杠菜单样式。
- `custom.js`：顶栏 `>_ CLI` / `✦ 引力` / `↻ 更新` 按钮、额度实时采集、路由记忆及 120+ 技能双语引擎。
- `i18n.override.json`：自定义汉化覆盖词典。
- `suite-account-prefs.json`：账号 Token 分布隐藏/归属及近 30/90 天热力图偏好。

## 2. 核心 HTTP 接口
- `GET /api/status`：CDP 连接状态、一体式遥测实时数据与当前预设。
- `GET / POST /api/config`：读取或热更新引力视觉与字体配置。
- `POST /api/reload`：重新编译 `user/*` 并通过 CDP 热推送到所有宿主窗口。
- `GET /api/analytics/overview` & `/api/analytics/session`：全局与当前会话的 `node:sqlite` 算力统计。
- `GET / POST /api/suite-account-prefs`：账号统计隐藏/归属与热力图窗口偏好。
- `GET / POST /api/suite-quota` & `/api/suite-auto-switch`：模型周/5h额度池与多账号顺位自动轮换策略。
- `GET / POST /api/suite-guardrails`：防幻觉工程纪律护栏（`off` / `standard` / `strict`）实时切换。
- `GET /api/suite-uninstall/preview` & `POST /api/suite-uninstall`：预览或彻底清除引力套件三扩展、配置数据与启动器并还原原生 Antigravity（支持 `confirm` / `dryRun` / `relaunchNative`）。
