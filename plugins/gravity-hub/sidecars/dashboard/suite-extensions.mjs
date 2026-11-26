import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { spawn, execFile, execFileSync } from "node:child_process";

const REPO_URL = "https://github.com/Songh0918/antigravity-ui-suggestion";
const REPO_GIT_URL = `${REPO_URL}.git`;
const DEFAULT_UPDATE_BRANCH = "main";
const UPDATE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 小时

function buildRemoteVersionUrl(branch = DEFAULT_UPDATE_BRANCH) {
  const safeBranch = String(branch || DEFAULT_UPDATE_BRANCH).trim() || DEFAULT_UPDATE_BRANCH;
  return `https://raw.githubusercontent.com/Songh0918/antigravity-ui-suggestion/${encodeURIComponent(safeBranch)}/version.json`;
}

const GUARDRAIL_TEMPLATES = {
  strict: `# 防幻觉与工程纪律护栏规则 (Anti-Hallucination & Engineering Guardrails)

<!-- aura-guardrail-tier: strict -->

在所有对话与代码任务中，严格遵守以下 5 项工程护栏（适用于 macOS 与 Windows 全平台）：

## 1. 证据优先・未读禁猜 (Evidence-First Grounding)
- 严禁把调用处、注释、过往摘要或 Mock 当作 API、符号、配置项或文件存在的证据。
- 在解释、修改或依赖任何不熟悉的代码、接口签名、配置结构或运行时状态前，必须先通过 \`read_file\` 或 \`run_command\` 实查源码或真实输出。
- 任何未经直接读取或实测验证的信息，必须明确标注「未验证」，绝不凭印象猜测编造。

## 2. 外科手术式最小改动 (Surgical Minimal Scope)
- 所有代码与配置修改严格收敛在用户明确要求的任务范围内，优先复用现有机制与架构。
- 避免过度设计、凭空引入未要求的抽象层或冗余防御性代码；保留所有无关的既有注释与文档字符串。
- 仅在需求确实存在歧义时通过 \`ask_question\` 或简短提问澄清。

## 3. 区分「问答排查」与「执行修改」 (Inquiry vs. Directive)
- **问答 / 评审 / 排查分析（Inquiries）**：只读调研并在对话中清晰作答，**不擅自修改工作区文件**。
- **明确修改指令（Directives）**：端到端闭环执行（\`实查源码 → 精准修改 → 针对性命令验证\`），对可逆步骤无需反复停下来请示。

## 4. 原生工具契约与高效执行 (Native Tool Contracts)
- **并行读、串行改**：多个独立的 \`read_file\` 或只读 \`run_command\` 尽量在同一轮并行调用；对同一文件的编辑在读取目标区域后按序执行。
- **原生文件工具优先**：优先使用 \`read_file\`、\`edit_file\`、\`write_file\`，避免用 shell \`cat\`、\`sed\`、\`awk\` 或重定向代替常规文件读写。
- **\`edit_file\` 唯一上下文锚点**：调用 \`edit_file\` 时，\`Target\` 必须包含 3–5 行唯一上下文，确保确定性命中唯一位置，避免误替换。
- **异步不轮询**：后台命令与子代理完成后会自动唤醒，严禁使用 shell \`sleep\` 轮询；对子代理返回的文件路径与行号需直接核验。

## 5. 诚实实测验证与直出结论 (Honest Verification & Direct Delivery)
- 最终修改完成后，必须通过 \`run_command\` 运行最窄范围的构建、类型检查或单元测试验证真实效果。
- **严禁伪造工具输出日志**、严禁外推未看到的字段、严禁把跳过 / Mock / 部分运行汇报为全量通过。
- 回复优先直出结论，引用核查或修改过的文件与符号时提供可点击的 \`[文件名](file:///绝对路径#L行号)\` 链接。
`,
  standard: `# 防幻觉核心护栏规则 (Anti-Hallucination Guardrails - Standard)

<!-- aura-guardrail-tier: standard -->

在所有对话与代码任务中，遵守以下 3 项核心防幻觉原则：

1. **未读禁猜（Evidence-First）**：修改或解释不熟悉的文件、API 签名或运行时状态前，必须先通过 \`read_file\` 或 \`run_command\` 核查真实源码与输出；未经验证的推断必须明示「未验证」。
2. **最小改动（Minimal Scope）**：改动严格收敛在当前任务范围内，保留无关注释与既有逻辑，不做未要求的过度重构。
3. **诚实验证（Honest Verification）**：修改后通过最窄范围的命令或单测验证结果，绝不伪造输出日志或将未执行的检查汇报为通过。
`
};

const DEFAULT_AUTO_SWITCH_CFG = {
  enabled: false,
  poolKey: "gemini-weekly",
  weeklyEnabled: true,
  thresholdPct: 5,
  fiveHourEnabled: true,
  fiveHourThresholdPct: 0,
  cooldownMinutes: 10,
  reloadWindow: true,
  accountOrder: [],
  lastSwitchAt: 0,
  lastSwitchFrom: "",
  lastSwitchTo: "",
  lastTriggerReason: "",
  switchHistory: [],
  accountQuotaSnapshots: {}
};

function normalizePct(val, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n) || val === "" || val === null || val === undefined) return fallback;
  return Math.max(0, Math.min(95, Math.round(n)));
}

function normalizeCooldown(val, fallback = 10) {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(180, Math.round(n)));
}

function compareSemver(a, b) {
  const pa = String(a || "0.0.0").replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0.0.0").replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonSafe(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function detectSystemProxyEnv() {
  const proxy = {
    HTTP_PROXY: process.env.HTTP_PROXY || process.env.http_proxy || "",
    HTTPS_PROXY: process.env.HTTPS_PROXY || process.env.https_proxy || "",
    ALL_PROXY: process.env.ALL_PROXY || process.env.all_proxy || "",
    NO_PROXY: process.env.NO_PROXY || process.env.no_proxy || "127.0.0.1,localhost,::1"
  };

  if (proxy.HTTPS_PROXY || proxy.HTTP_PROXY || proxy.ALL_PROXY) {
    if (!proxy.HTTPS_PROXY && proxy.HTTP_PROXY) proxy.HTTPS_PROXY = proxy.HTTP_PROXY;
    if (!proxy.HTTP_PROXY && proxy.HTTPS_PROXY) proxy.HTTP_PROXY = proxy.HTTPS_PROXY;
    return proxy;
  }

  if (process.platform === "darwin") {
    try {
      const out = execFileSync("scutil", ["--proxy"], { encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] });
      const getVal = (key) => {
        const m = out.match(new RegExp(`^\\s*${key}\\s*:\\s*(.+)$`, "m"));
        return m ? m[1].trim() : "";
      };
      if (getVal("HTTPSEnable") === "1") {
        const host = getVal("HTTPSProxy");
        const port = getVal("HTTPSPort");
        if (host && port) proxy.HTTPS_PROXY = `http://${host}:${port}`;
      }
      if (getVal("HTTPEnable") === "1") {
        const host = getVal("HTTPProxy");
        const port = getVal("HTTPPort");
        if (host && port) proxy.HTTP_PROXY = `http://${host}:${port}`;
      }
      if (getVal("SOCKSEnable") === "1") {
        const host = getVal("SOCKSProxy");
        const port = getVal("SOCKSPort");
        if (host && port) proxy.ALL_PROXY = `socks5://${host}:${port}`;
      }
      if (!proxy.HTTPS_PROXY && proxy.HTTP_PROXY) proxy.HTTPS_PROXY = proxy.HTTP_PROXY;
      if (!proxy.HTTP_PROXY && proxy.HTTPS_PROXY) proxy.HTTP_PROXY = proxy.HTTPS_PROXY;
    } catch {}
  } else if (process.platform === "win32") {
    try {
      const out = execFileSync(
        "reg",
        ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"],
        { encoding: "utf8", timeout: 2000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }
      );
      const enMatch = out.match(/ProxyEnable\s+REG_DWORD\s+0x([0-9a-f]+)/i);
      const srvMatch = out.match(/ProxyServer\s+REG_SZ\s+(.+)/i);
      if (enMatch && parseInt(enMatch[1], 16) === 1 && srvMatch) {
        const raw = srvMatch[1].trim();
        let httpP = "";
        let httpsP = "";
        if (raw.includes("=")) {
          for (const part of raw.split(";")) {
            const [k, v] = part.split("=");
            if (!k || !v) continue;
            const kl = k.trim().toLowerCase();
            const val = v.trim();
            if (kl === "https") httpsP = /^https?:\/\//i.test(val) ? val : `http://${val}`;
            if (kl === "http") httpP = /^https?:\/\//i.test(val) ? val : `http://${val}`;
            if (kl === "socks") proxy.ALL_PROXY = /^socks/i.test(val) ? val : `socks5://${val}`;
          }
        } else {
          const normalized = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
          httpP = normalized;
          httpsP = normalized;
        }
        proxy.HTTP_PROXY = httpP || httpsP;
        proxy.HTTPS_PROXY = httpsP || httpP;
      }
    } catch {}
  }

  return proxy;
}

function resolveAgyCliPath() {
  const home = os.homedir();
  const candidates = process.platform === "win32"
    ? [
        path.join(home, ".gemini", "bin", "agy.exe"),
        path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "agy", "bin", "agy.exe"),
        path.join(home, ".local", "bin", "agy.exe")
      ]
    : [
        path.join(home, ".local", "bin", "agy"),
        path.join(home, ".gemini", "bin", "agy"),
        "/opt/homebrew/bin/agy",
        "/usr/local/bin/agy"
      ];

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {}
  }

  try {
    const cmd = process.platform === "win32" ? "where.exe" : "which";
    const arg = process.platform === "win32" ? "agy.exe" : "agy";
    const out = execFileSync(cmd, [arg], { encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    const first = out.split(/\r?\n/)[0]?.trim();
    if (first && fs.existsSync(first)) return first;
  } catch {}
  return null;
}

function shellEscapePosix(str) {
  return "'" + String(str).replace(/'/g, "'\\''") + "'";
}

function appleScriptEscape(str) {
  return String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function launchAgyCli({ cwd, model, dryRun } = {}) {
  const cliPath = resolveAgyCliPath();
  if (!cliPath) {
    return {
      ok: false,
      installed: false,
      error: "未检测到 agy CLI，请先在终端安装官方 agy CLI（macOS: ~/.local/bin/agy，Windows: ~/.gemini/bin/agy.exe）"
    };
  }

  let targetCwd = typeof cwd === "string" && cwd.trim() ? cwd.trim() : "";
  if (targetCwd.startsWith("file://")) {
    try {
      targetCwd = decodeURIComponent(new URL(targetCwd).pathname);
      if (process.platform === "win32" && /^\/[A-Za-z]:/.test(targetCwd)) targetCwd = targetCwd.slice(1);
    } catch {}
  }
  if (!targetCwd || !fs.existsSync(targetCwd) || !fs.statSync(targetCwd).isDirectory()) {
    targetCwd = os.homedir();
  }

  const extraArgs = [];
  if (typeof model === "string" && model.trim() && !/[\r\n\0]/.test(model)) {
    extraArgs.push("--model", model.trim());
  }

  const proxyEnv = detectSystemProxyEnv();

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      installed: true,
      cliPath,
      cwd: targetCwd,
      platform: process.platform,
      args: extraArgs,
      proxy: proxyEnv
    };
  }

  try {
    if (process.platform === "darwin") {
      const exportsList = [
        "TERM=xterm-256color",
        "COLORTERM=truecolor",
        `NO_PROXY=${shellEscapePosix(proxyEnv.NO_PROXY)}`,
        `no_proxy=${shellEscapePosix(proxyEnv.NO_PROXY)}`
      ];
      if (proxyEnv.HTTP_PROXY) {
        exportsList.push(`HTTP_PROXY=${shellEscapePosix(proxyEnv.HTTP_PROXY)}`, `http_proxy=${shellEscapePosix(proxyEnv.HTTP_PROXY)}`);
      }
      if (proxyEnv.HTTPS_PROXY) {
        exportsList.push(`HTTPS_PROXY=${shellEscapePosix(proxyEnv.HTTPS_PROXY)}`, `https_proxy=${shellEscapePosix(proxyEnv.HTTPS_PROXY)}`);
      }
      if (proxyEnv.ALL_PROXY) {
        exportsList.push(`ALL_PROXY=${shellEscapePosix(proxyEnv.ALL_PROXY)}`, `all_proxy=${shellEscapePosix(proxyEnv.ALL_PROXY)}`);
      }
      const cliInvoke = [shellEscapePosix(cliPath), ...extraArgs.map(shellEscapePosix)].join(" ");
      const shellCmd = `cd ${shellEscapePosix(targetCwd)} && export ${exportsList.join(" ")} && unset NO_COLOR && ${cliInvoke}`;
      const escapedCmd = appleScriptEscape(shellCmd);
      const script = [
        'set wasRunning to application "Terminal" is running',
        'tell application "Terminal"',
        '  activate',
        '  if wasRunning then',
        `    do script "${escapedCmd}"`,
        '  else',
        '    if (count of windows) > 0 then',
        `      do script "${escapedCmd}" in front window`,
        '    else',
        `      do script "${escapedCmd}"`,
        '    end if',
        '  end if',
        'end tell'
      ].join("\n");
      const child = spawn("osascript", ["-e", script], { detached: true, stdio: "ignore" });
      child.unref();
      return {
        ok: true,
        installed: true,
        terminal: "Terminal.app",
        cliPath,
        cwd: targetCwd,
        proxyApplied: Boolean(proxyEnv.HTTPS_PROXY || proxyEnv.HTTP_PROXY || proxyEnv.ALL_PROXY),
        proxyUrl: proxyEnv.HTTPS_PROXY || proxyEnv.HTTP_PROXY || proxyEnv.ALL_PROXY || ""
      };
    }

    if (process.platform === "win32") {
      const childEnv = { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor", NO_PROXY: proxyEnv.NO_PROXY };
      delete childEnv.NO_COLOR;
      const setLines = [];
      if (proxyEnv.HTTP_PROXY) {
        childEnv.HTTP_PROXY = proxyEnv.HTTP_PROXY;
        childEnv.http_proxy = proxyEnv.HTTP_PROXY;
        setLines.push(`set "HTTP_PROXY=${proxyEnv.HTTP_PROXY}"`);
      }
      if (proxyEnv.HTTPS_PROXY) {
        childEnv.HTTPS_PROXY = proxyEnv.HTTPS_PROXY;
        childEnv.https_proxy = proxyEnv.HTTPS_PROXY;
        setLines.push(`set "HTTPS_PROXY=${proxyEnv.HTTPS_PROXY}"`);
      }
      if (proxyEnv.ALL_PROXY) {
        childEnv.ALL_PROXY = proxyEnv.ALL_PROXY;
        childEnv.all_proxy = proxyEnv.ALL_PROXY;
        setLines.push(`set "ALL_PROXY=${proxyEnv.ALL_PROXY}"`);
      }
      const argsStr = extraArgs.map((a) => `"${a.replace(/"/g, "")}"`).join(" ");
      const cmdInner = [...setLines, `"${cliPath}"${argsStr ? " " + argsStr : ""}`].join(" && ");
      let hasWt = false;
      try {
        execFileSync("where.exe", ["wt.exe"], { timeout: 1500, stdio: "ignore" });
        hasWt = true;
      } catch {}
      if (hasWt) {
        const child = spawn("wt.exe", ["-d", targetCwd, "cmd", "/k", cmdInner], {
          cwd: targetCwd,
          env: childEnv,
          detached: true,
          stdio: "ignore",
          windowsHide: false
        });
        child.unref();
        return {
          ok: true,
          installed: true,
          terminal: "Windows Terminal",
          cliPath,
          cwd: targetCwd,
          proxyApplied: Boolean(proxyEnv.HTTPS_PROXY || proxyEnv.HTTP_PROXY || proxyEnv.ALL_PROXY),
          proxyUrl: proxyEnv.HTTPS_PROXY || proxyEnv.HTTP_PROXY || proxyEnv.ALL_PROXY || ""
        };
      }
      const child = spawn("cmd.exe", ["/c", "start", "", "/D", targetCwd, "cmd.exe", "/k", cmdInner], {
        cwd: targetCwd,
        env: childEnv,
        detached: true,
        stdio: "ignore",
        windowsHide: false
      });
      child.unref();
      return {
        ok: true,
        installed: true,
        terminal: "cmd.exe",
        cliPath,
        cwd: targetCwd,
        proxyApplied: Boolean(proxyEnv.HTTPS_PROXY || proxyEnv.HTTP_PROXY || proxyEnv.ALL_PROXY),
        proxyUrl: proxyEnv.HTTPS_PROXY || proxyEnv.HTTP_PROXY || proxyEnv.ALL_PROXY || ""
      };
    }

    return { ok: false, installed: true, error: `暂不支持在 ${process.platform} 自动拉起终端` };
  } catch (err) {
    return { ok: false, installed: true, error: err instanceof Error ? err.message : String(err) };
  }
}

async function fetchRemoteVersionJson(branch = DEFAULT_UPDATE_BRANCH) {
  const remoteUrl = buildRemoteVersionUrl(branch);
  const proxyEnv = detectSystemProxyEnv();
  const childEnv = { ...process.env };
  if (proxyEnv.HTTPS_PROXY) childEnv.HTTPS_PROXY = proxyEnv.HTTPS_PROXY;
  if (proxyEnv.HTTP_PROXY) childEnv.HTTP_PROXY = proxyEnv.HTTP_PROXY;
  if (proxyEnv.ALL_PROXY) childEnv.ALL_PROXY = proxyEnv.ALL_PROXY;

  // 1. 优先尝试 curl（自动注入检测到的系统代理，4 秒超时）
  try {
    const out = await new Promise((resolve, reject) => {
      execFile(
        process.platform === "win32" ? "curl.exe" : "curl",
        ["-fsSL", "--max-time", "4", `${remoteUrl}?t=${Date.now()}`],
        { encoding: "utf8", env: childEnv, timeout: 4500, windowsHide: true },
        (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout);
        }
      );
    });
    const parsed = JSON.parse(String(out || "").trim());
    if (parsed && typeof parsed.version === "string") return parsed;
  } catch {}

  // 2. 回退到 Node 原生 fetch（4 秒超时）
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const resp = await fetch(`${remoteUrl}?t=${Date.now()}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (resp.ok) {
      const parsed = await resp.json();
      if (parsed && typeof parsed.version === "string") return parsed;
    }
  } catch {}

  return null;
}

export function initSuiteExtensions({
  dataDir,
  pluginRoot,
  reloadAll,
  accountVault,
  recordAccountSwitch,
  reloadHostWindow
}) {
  const appDataDir = process.env.ANTIGRAVITY_APP_DATA_DIR || path.join(os.homedir(), ".gemini", "antigravity");
  const bootLogFile = path.join(appDataDir, "sidecar_data", "gravity-suite-boot.log");
  function appendHubBootLog(msg) {
    try {
      fs.mkdirSync(path.dirname(bootLogFile), { recursive: true });
      const line = `${new Date().toISOString()} [gravity-hub] pid=${process.pid} node=${process.version} exec=${process.execPath} ${String(msg).replace(/\r?\n/g, " | ")}\n`;
      fs.appendFileSync(bootLogFile, line, "utf8");
    } catch {}
  }
  if (!process.__gravityHubLogHooked) {
    process.__gravityHubLogHooked = true;
    process.on("uncaughtException", (err) => {
      appendHubBootLog(`uncaughtException: ${err?.stack || err?.message || err}`);
      console.error("[gravity-hub] uncaughtException:", err);
      process.exit(1);
    });
    process.on("unhandledRejection", (reason) => {
      appendHubBootLog(`unhandledRejection: ${reason?.stack || reason?.message || reason}`);
      console.error("[gravity-hub] unhandledRejection:", reason);
    });
  }
  appendHubBootLog(`boot port=${process.env.ANTIGRAVITY_SIDECAR_WEB_PORT || ""} ls=${process.env.ANTIGRAVITY_LS_ADDRESS || ""}`);

  // 自动从旧版 nebula-hub / aura-dashboard 平滑迁移用户配置与账号备选库数据
  try {
    const legacyDirs = [
      path.join(os.homedir(), ".gemini", "antigravity", "plugin_data", "nebula-hub"),
      path.join(os.homedir(), ".gemini", "antigravity", "sidecar_data", "nebula-hub", "dashboard"),
      path.join(os.homedir(), ".gemini", "antigravity", "plugin_data", "aura-dashboard"),
      path.join(os.homedir(), ".gemini", "antigravity", "sidecar_data", "aura-dashboard", "dashboard")
    ];
    fs.mkdirSync(dataDir, { recursive: true });
    const migrateFiles = [
      "accounts_vault.json",
      "account_timeline.json",
      "suite-auto-switch.json",
      "suite-last-route.json",
      "suite-update-state.json",
      "suite-account-prefs.json",
      "suite-auto-compact.json",
      "suite-tps-monitor.json"
    ];
    for (const lDir of legacyDirs) {
      if (!fs.existsSync(lDir)) continue;
      for (const f of migrateFiles) {
        const srcF = path.join(lDir, f);
        const dstF = path.join(dataDir, f);
        if (fs.existsSync(srcF) && !fs.existsSync(dstF)) {
          try { fs.copyFileSync(srcF, dstF); } catch {}
        }
      }
    }
  } catch {}

  const rulesPath = path.join(pluginRoot, "rules", "AGENTS.md");
  const versionFile = path.join(dataDir, "suite-version.json");
  const updateStateFile = path.join(dataDir, "suite-update-state.json");
  const autoSwitchFile = path.join(dataDir, "suite-auto-switch.json");
  const lastRouteFile = path.join(dataDir, "suite-last-route.json");
  const accountPrefsFile = path.join(dataDir, "suite-account-prefs.json");
  const autoCompactFile = path.join(dataDir, "suite-auto-compact.json");
  const quotaCacheFile = path.join(dataDir, "suite-quota-cache.json");
  const tpsMonitorFile = path.join(dataDir, "suite-tps-monitor.json");

  const DEFAULT_TPS_MONITOR = {
    enabled: true,
    peakTps: 0,
    minTps: 0,
    sumTps: 0,
    avgTps: 0,
    sampleCount: 0,
    lastTps: 0,
    lastSig: "",
    peakAt: 0,
    minAt: 0,
    updatedAt: 0
  };

  function getTpsMonitorState() {
    const raw = readJsonSafe(tpsMonitorFile, {});
    const sampleCount = Math.max(0, Math.round(Number(raw?.sampleCount) || 0));
    const sumTps = Math.max(0, Number(raw?.sumTps) || 0);
    const peakTps = Math.max(0, Math.round(Number(raw?.peakTps) || 0));
    const minTps = Math.max(0, Math.round(Number(raw?.minTps) || 0));
    const avgTps = sampleCount > 0 ? Math.round(sumTps / sampleCount) : 0;
    return {
      ok: true,
      enabled: raw?.enabled !== false,
      peakTps,
      minTps,
      sumTps,
      avgTps,
      sampleCount,
      lastTps: Math.max(0, Math.round(Number(raw?.lastTps) || 0)),
      lastSig: typeof raw?.lastSig === "string" ? raw.lastSig : "",
      peakAt: Number(raw?.peakAt) || 0,
      minAt: Number(raw?.minAt) || 0,
      updatedAt: Number(raw?.updatedAt) || 0
    };
  }

  function saveTpsMonitorState(patch) {
    const cur = getTpsMonitorState();
    const { ok: _ignore, ...curData } = cur;
    if (patch?.action === "reset") {
      const resetNext = {
        ...DEFAULT_TPS_MONITOR,
        enabled: curData.enabled,
        updatedAt: Date.now()
      };
      writeJsonSafe(tpsMonitorFile, resetNext);
      return { ok: true, ...resetNext };
    }

    const next = { ...curData };
    if (typeof patch?.enabled === "boolean") {
      next.enabled = patch.enabled;
      next.updatedAt = Date.now();
    }

    const sample = patch?.sample;
    if (next.enabled !== false && sample && typeof sample === "object") {
      const tps = Math.round(Number(sample.tps));
      const sig = typeof sample.sig === "string" ? sample.sig.trim() : "";
      const ts = Number(sample.ts) || Date.now();
      if (Number.isFinite(tps) && tps > 0 && tps < 50000 && (!sig || sig !== next.lastSig)) {
        next.peakTps = Math.max(next.peakTps || 0, tps);
        if (!next.peakAt || tps >= next.peakTps) next.peakAt = ts;
        if (next.minTps <= 0 || tps <= next.minTps) {
          next.minTps = tps;
          next.minAt = ts;
        }
        next.sumTps = (next.sumTps || 0) + tps;
        next.sampleCount = (next.sampleCount || 0) + 1;
        next.avgTps = Math.round(next.sumTps / next.sampleCount);
        next.lastTps = tps;
        if (sig) next.lastSig = sig;
        next.updatedAt = ts;
      }
    }

    writeJsonSafe(tpsMonitorFile, next);
    return { ok: true, ...next };
  }

  function normalizeHeatmapDays(v) {
    const n = Number(v);
    return n === 90 || n === 365 ? n : 30;
  }

  function getAccountPrefs() {
    const raw = readJsonSafe(accountPrefsFile, {});
    return {
      ok: true,
      hideUntracked: Boolean(raw?.hideUntracked),
      assignUntrackedTo: typeof raw?.assignUntrackedTo === "string" ? raw.assignUntrackedTo.trim() : "",
      heatmapDays: normalizeHeatmapDays(raw?.heatmapDays)
    };
  }

  function saveAccountPrefs(patch) {
    const cur = getAccountPrefs();
    const next = {
      hideUntracked: typeof patch?.hideUntracked === "boolean" ? patch.hideUntracked : cur.hideUntracked,
      assignUntrackedTo: typeof patch?.assignUntrackedTo === "string" ? patch.assignUntrackedTo.trim().slice(0, 160) : cur.assignUntrackedTo,
      heatmapDays: patch?.heatmapDays !== undefined ? normalizeHeatmapDays(patch.heatmapDays) : cur.heatmapDays
    };
    writeJsonSafe(accountPrefsFile, next);
    return { ok: true, ...next };
  }

  const initialDiskQuota = readJsonSafe(quotaCacheFile, null);
  let cachedQuota = initialDiskQuota && Array.isArray(initialDiskQuota.groups) ? initialDiskQuota : null;
  let lastAutoSwitchResult = null;
  let lsQuotaInFlight = null;
  let lastLsFetchAt = 0;
  let cachedRemote = null;
  let lastRemoteCheckAt = 0;
  let updateInProgress = false;

  function getLastRouteState() {
    const raw = readJsonSafe(lastRouteFile, {});
    return {
      ok: true,
      enabled: raw?.enabled !== false,
      route: typeof raw?.route === "string" ? raw.route : "",
      title: typeof raw?.title === "string" ? raw.title : "",
      savedAt: Number(raw?.savedAt) || 0
    };
  }

  function saveLastRouteState(patch) {
    const cur = getLastRouteState();
    const next = {
      enabled: typeof patch?.enabled === "boolean" ? patch.enabled : cur.enabled,
      route: cur.route,
      title: cur.title,
      savedAt: cur.savedAt
    };
    if (typeof patch?.route === "string") {
      const r = patch.route.trim();
      const isStandalone = /^\/(settings-standalone|artifact|terminal-standalone)\b/i.test(r);
      if (r.startsWith("/") && !isStandalone) {
        next.route = r;
        next.savedAt = Date.now();
        if (typeof patch?.title === "string") next.title = patch.title.trim().slice(0, 120);
      }
    }
    writeJsonSafe(lastRouteFile, next);
    return { ok: true, ...next };
  }

  function normalizeThresholdK(val, fallback = 500) {
    const n = Math.round(Number(val));
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.max(100, Math.min(1000, n));
  }

  function normalizeCompactCooldownMin(val, fallback = 5) {
    const n = Math.round(Number(val));
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.max(1, Math.min(60, n));
  }

  function getAutoCompactState() {
    const raw = readJsonSafe(autoCompactFile, {});
    return {
      ok: true,
      enabled: raw?.enabled !== false,
      thresholdK: normalizeThresholdK(raw?.thresholdK, 500),
      cooldownMinutes: normalizeCompactCooldownMin(raw?.cooldownMinutes, 5),
      lastCompactAt: Number(raw?.lastCompactAt) || 0,
      lastCascadeId: typeof raw?.lastCascadeId === "string" ? raw.lastCascadeId.trim() : "",
      lastCtxTok: Number(raw?.lastCtxTok) || 0
    };
  }

  function saveAutoCompactState(patch) {
    const cur = getAutoCompactState();
    const next = {
      enabled: typeof patch?.enabled === "boolean" ? patch.enabled : cur.enabled,
      thresholdK: patch?.thresholdK !== undefined ? normalizeThresholdK(patch.thresholdK, cur.thresholdK) : cur.thresholdK,
      cooldownMinutes: patch?.cooldownMinutes !== undefined ? normalizeCompactCooldownMin(patch.cooldownMinutes, cur.cooldownMinutes) : cur.cooldownMinutes,
      lastCompactAt: typeof patch?.lastCompactAt === "number" && patch.lastCompactAt > 0 ? patch.lastCompactAt : cur.lastCompactAt,
      lastCascadeId: typeof patch?.lastCascadeId === "string" ? patch.lastCascadeId.trim().slice(0, 120) : cur.lastCascadeId,
      lastCtxTok: typeof patch?.lastCtxTok === "number" && patch.lastCtxTok >= 0 ? Math.round(patch.lastCtxTok) : cur.lastCtxTok
    };
    writeJsonSafe(autoCompactFile, next);
    return { ok: true, ...next };
  }

  function getGuardrailsState() {
    try {
      if (!fs.existsSync(rulesPath)) {
        return { ok: true, tier: "off", enabled: false, rulesPath, bytes: 0 };
      }
      const txt = fs.readFileSync(rulesPath, "utf8");
      const m = txt.match(/aura-guardrail-tier:\s*(strict|standard|off)/i);
      const tier = m ? m[1].toLowerCase() : (txt.trim().length > 0 ? "strict" : "off");
      return {
        ok: true,
        tier,
        enabled: tier !== "off",
        rulesPath,
        bytes: Buffer.byteLength(txt, "utf8")
      };
    } catch (err) {
      return { ok: false, tier: "off", enabled: false, rulesPath, error: String(err) };
    }
  }

  function setGuardrailsTier(tierRaw) {
    const tier = ["off", "standard", "strict"].includes(String(tierRaw || "").toLowerCase())
      ? String(tierRaw).toLowerCase()
      : "strict";
    try {
      if (tier === "off") {
        if (fs.existsSync(rulesPath)) fs.unlinkSync(rulesPath);
      } else {
        fs.mkdirSync(path.dirname(rulesPath), { recursive: true });
        fs.writeFileSync(rulesPath, GUARDRAIL_TEMPLATES[tier], "utf8");
      }
      return { ...getGuardrailsState(), changed: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  let hostAgentBusyState = { busy: false, updatedAt: 0 };
  let breachStreak = { email: "", ruleKey: "", count: 0, firstAt: 0, lastAt: 0 };
  let confirmRecheckTimer = null;

  function loadAutoSwitchConfig() {
    const raw = readJsonSafe(autoSwitchFile, {});
    const weeklyEnabled = raw?.weeklyEnabled !== false;
    const fiveHourEnabled = raw?.fiveHourEnabled !== false;
    return {
      ...DEFAULT_AUTO_SWITCH_CFG,
      ...(raw && typeof raw === "object" ? raw : {}),
      weeklyEnabled,
      thresholdPct: normalizePct(raw?.thresholdPct, DEFAULT_AUTO_SWITCH_CFG.thresholdPct),
      fiveHourEnabled,
      fiveHourThresholdPct: normalizePct(raw?.fiveHourThresholdPct, DEFAULT_AUTO_SWITCH_CFG.fiveHourThresholdPct),
      cooldownMinutes: normalizeCooldown(raw?.cooldownMinutes, DEFAULT_AUTO_SWITCH_CFG.cooldownMinutes),
      switchHistory: Array.isArray(raw?.switchHistory) ? raw.switchHistory.slice(0, 10) : []
    };
  }

  function saveAutoSwitchConfig(patch) {
    const cur = loadAutoSwitchConfig();
    const next = {
      ...cur,
      ...(typeof patch?.enabled === "boolean" ? { enabled: patch.enabled } : {}),
      ...(typeof patch?.poolKey === "string" && patch.poolKey.trim() ? { poolKey: patch.poolKey.trim() } : {}),
      ...(typeof patch?.weeklyEnabled === "boolean" ? { weeklyEnabled: patch.weeklyEnabled } : {}),
      ...(patch?.thresholdPct !== undefined ? { thresholdPct: normalizePct(patch.thresholdPct, cur.thresholdPct) } : {}),
      ...(typeof patch?.fiveHourEnabled === "boolean" ? { fiveHourEnabled: patch.fiveHourEnabled } : {}),
      ...(patch?.fiveHourThresholdPct !== undefined
        ? { fiveHourThresholdPct: normalizePct(patch.fiveHourThresholdPct, cur.fiveHourThresholdPct) }
        : {}),
      ...(patch?.cooldownMinutes !== undefined
        ? { cooldownMinutes: normalizeCooldown(patch.cooldownMinutes, cur.cooldownMinutes) }
        : {}),
      ...(typeof patch?.reloadWindow === "boolean" ? { reloadWindow: patch.reloadWindow } : {}),
      ...(Array.isArray(patch?.accountOrder)
        ? { accountOrder: [...new Set(patch.accountOrder.map((x) => String(x || "").trim()).filter(Boolean))] }
        : {})
    };
    breachStreak = { email: "", ruleKey: "", count: 0, firstAt: 0, lastAt: 0 };
    writeJsonSafe(autoSwitchFile, next);
    return next;
  }

  function buildOrderedAccounts(vaultAccounts, savedOrder) {
    const byLower = new Map();
    for (const a of vaultAccounts || []) {
      if (a && a.email) byLower.set(a.email.toLowerCase(), a);
    }
    const ordered = [];
    const seen = new Set();
    for (const em of savedOrder || []) {
      const k = String(em || "").toLowerCase();
      if (byLower.has(k) && !seen.has(k)) {
        ordered.push(byLower.get(k));
        seen.add(k);
      }
    }
    for (const a of vaultAccounts || []) {
      if (!a || !a.email) continue;
      const k = a.email.toLowerCase();
      if (!seen.has(k)) {
        ordered.push(a);
        seen.add(k);
      }
    }
    return ordered;
  }

  function findAccountSnapshot(snaps, email) {
    if (!snaps || typeof snaps !== "object" || !email) return null;
    if (snaps[email]) return snaps[email];
    const target = String(email).toLowerCase();
    for (const [k, v] of Object.entries(snaps)) {
      if (k.toLowerCase() === target) return v;
    }
    return null;
  }

  function resolveEffectivePoolSnapshot(snap, poolKey, now = Date.now()) {
    if (!snap || typeof snap !== "object") return null;
    const normalizeEntry = (p) => {
      const resetMs = p.weeklyResetTime ? Date.parse(p.weeklyResetTime) : NaN;
      const resetRecovered = Number.isFinite(resetMs) && now > resetMs;
      const effectiveWeeklyPct = resetRecovered ? 100 : p.weeklyPct;

      const hasFiveHour = typeof p.fiveHourPct === "number";
      const hResetMs = p.fiveHourResetTime ? Date.parse(p.fiveHourResetTime) : NaN;
      const fiveHourResetRecovered = Number.isFinite(hResetMs) && now > hResetMs;
      const effectiveFiveHourPct = hasFiveHour ? (fiveHourResetRecovered ? 100 : p.fiveHourPct) : null;

      return {
        ...p,
        pct: effectiveWeeklyPct,
        rawPct: p.weeklyPct,
        effectivePct: Math.min(effectiveWeeklyPct, effectiveFiveHourPct ?? 100),
        effectiveWeeklyPct,
        resetRecovered,
        effectiveFiveHourPct,
        fiveHourResetRecovered
      };
    };

    const poolsObj = snap.pools && typeof snap.pools === "object" ? snap.pools : null;
    if (poolsObj) {
      const entries = Object.values(poolsObj).filter((p) => p && typeof p.weeklyPct === "number");
      if (!poolKey || poolKey === "any-weekly") {
        const normalized = entries.map(normalizeEntry);
        normalized.sort((a, b) => a.effectivePct - b.effectivePct);
        return normalized[0] || null;
      }
      let matched = poolsObj[poolKey];
      if (!matched) {
        if (poolKey === "gemini-weekly") matched = entries.find((e) => /gemini/i.test(e.key || "") && !/argon/i.test(e.key || ""));
        else if (poolKey === "3p-weekly") matched = entries.find((e) => /3p|claude|gpt/i.test(e.key || "") || /claude|gpt/i.test(e.label || ""));
        else if (poolKey === "gemini-argon-wtu-weekly") matched = entries.find((e) => /argon/i.test(e.key || "") || /argon/i.test(e.label || ""));
      }
      if (matched && typeof matched.weeklyPct === "number") {
        return normalizeEntry(matched);
      }
    }
    if (poolKey && typeof snap[poolKey] === "number") {
      return {
        key: poolKey,
        pct: snap[poolKey],
        rawPct: snap[poolKey],
        effectiveWeeklyPct: snap[poolKey],
        resetRecovered: false,
        fiveHourPct: null,
        effectiveFiveHourPct: null,
        fiveHourResetRecovered: false
      };
    }
    return null;
  }

  function formatAccountPools(snap, now = Date.now()) {
    if (!snap || typeof snap !== "object") return [];
    const poolsObj = snap.pools && typeof snap.pools === "object" ? snap.pools : null;
    if (poolsObj) {
      return Object.values(poolsObj)
        .filter((p) => p && typeof p.weeklyPct === "number")
        .map((p) => {
          const resetMs = p.weeklyResetTime ? Date.parse(p.weeklyResetTime) : NaN;
          const resetRecovered = Number.isFinite(resetMs) && now > resetMs;
          const hResetMs = p.fiveHourResetTime ? Date.parse(p.fiveHourResetTime) : NaN;
          const fiveHourResetRecovered = Number.isFinite(hResetMs) && now > hResetMs;
          const fiveHourPct = typeof p.fiveHourPct === "number" ? p.fiveHourPct : null;
          return {
            key: p.key || "",
            label: p.label || p.key || "",
            weeklyPct: p.weeklyPct,
            effectiveWeeklyPct: resetRecovered ? 100 : p.weeklyPct,
            resetRecovered,
            weeklyResetTime: p.weeklyResetTime || "",
            fiveHourPct,
            effectiveFiveHourPct: fiveHourPct !== null ? (fiveHourResetRecovered ? 100 : fiveHourPct) : null,
            fiveHourResetRecovered,
            fiveHourResetTime: p.fiveHourResetTime || ""
          };
        });
    }
    const labelMap = {
      "gemini-weekly": "Gemini 核心池",
      "3p-weekly": "Claude / GPT",
      "gemini-argon-wtu-weekly": "Gemini 4 Argon"
    };
    const out = [];
    for (const [k, v] of Object.entries(snap)) {
      if (k === "updatedAt" || k === "pools" || typeof v !== "number") continue;
      out.push({
        key: k,
        label: labelMap[k] || k,
        weeklyPct: v,
        effectiveWeeklyPct: v,
        resetRecovered: false,
        weeklyResetTime: "",
        fiveHourPct: null,
        effectiveFiveHourPct: null,
        fiveHourResetRecovered: false,
        fiveHourResetTime: ""
      });
    }
    return out;
  }

  function pickNextCandidate(orderedAccounts, activeEmail, monitoredBucketId, cfg, snaps, now) {
    if (!Array.isArray(orderedAccounts) || orderedAccounts.length < 2) return null;
    const weeklyTh = Number(cfg?.thresholdPct ?? 10);
    const fiveHourTh = Number(cfg?.fiveHourThresholdPct ?? 10);
    const checkWeekly = cfg?.weeklyEnabled !== false;
    const checkFiveHour = cfg?.fiveHourEnabled !== false;

    const activeLower = String(activeEmail || "").toLowerCase();
    const curIdx = orderedAccounts.findIndex((a) => a.email.toLowerCase() === activeLower);
    const rotated = [];
    const startIdx = curIdx >= 0 ? curIdx + 1 : 0;
    for (let i = 0; i < orderedAccounts.length; i++) {
      const acc = orderedAccounts[(startIdx + i) % orderedAccounts.length];
      if (acc.email.toLowerCase() !== activeLower) rotated.push(acc);
    }
    if (rotated.length === 0) return null;
    // 严格按用户设定的切换顺序轮换；跳过近 30 分钟内已知任一限额不足且尚未重置的账号
    for (const cand of rotated) {
      const snap = findAccountSnapshot(snaps, cand.email);
      if (snap && now - (snap.updatedAt || 0) < 30 * 60 * 1000) {
        const eff = resolveEffectivePoolSnapshot(snap, monitoredBucketId || cfg?.poolKey, now);
        if (eff) {
          const wBlocked =
            checkWeekly &&
            !eff.resetRecovered &&
            typeof eff.effectiveWeeklyPct === "number" &&
            eff.effectiveWeeklyPct <= weeklyTh;
          const hBlocked =
            checkFiveHour &&
            !eff.fiveHourResetRecovered &&
            typeof eff.effectiveFiveHourPct === "number" &&
            eff.effectiveFiveHourPct <= fiveHourTh;
          if (wBlocked || hBlocked) continue;
        }
      }
      return cand;
    }
    return null;
  }

  function getVaultSnapshot() {
    if (!accountVault || typeof accountVault.listAccounts !== "function") {
      return { available: false, currentEmail: "", accounts: [] };
    }
    try {
      const res = accountVault.listAccounts();
      const accounts = Array.isArray(res?.accounts) ? res.accounts : (Array.isArray(res) ? res : []);
      const currentEmail = res?.currentEmail || res?.activeEmail || accounts.find((a) => a.isCurrent || a.active)?.email || "";
      return { available: true, currentEmail, accounts };
    } catch {
      return { available: false, currentEmail: "", accounts: [] };
    }
  }

  function extractMonitoredPoolMetrics(quotaPayload, poolKey, now = Date.now()) {
    const groups = Array.isArray(quotaPayload?.groups) ? quotaPayload.groups : [];
    const entries = [];
    for (const g of groups) {
      const rawW = typeof g.weeklyPct === "number" ? g.weeklyPct : (typeof g.pct === "number" ? g.pct : null);
      const rawH = typeof g.fiveHourPct === "number" ? g.fiveHourPct : null;
      if (rawW === null && rawH === null) continue;

      const wResetTime = g.weeklyResetTime || g.resetTime || "";
      const wResetMs = wResetTime ? Date.parse(wResetTime) : NaN;
      const weeklyRecovered = Number.isFinite(wResetMs) && now > wResetMs;
      const wPct = rawW !== null ? (weeklyRecovered ? 100 : rawW) : null;

      const hResetTime = g.fiveHourResetTime || "";
      const hResetMs = hResetTime ? Date.parse(hResetTime) : NaN;
      const fiveHourRecovered = Number.isFinite(hResetMs) && now > hResetMs;
      const hPct = rawH !== null ? (fiveHourRecovered ? 100 : rawH) : null;

      entries.push({
        bucketId: g.weeklyBucketId || g.key || "",
        key: g.key || "",
        label: g.label || g.key || "",
        weeklyPct: wPct,
        rawWeeklyPct: rawW,
        weeklyRecovered,
        weeklyResetTime: wResetTime,
        fiveHourPct: hPct,
        rawFiveHourPct: rawH,
        fiveHourRecovered,
        fiveHourResetTime: hResetTime
      });
    }
    if (entries.length === 0) return { weekly: null, fiveHour: null };

    if (poolKey === "any-weekly") {
      const weeklyList = entries.filter((e) => typeof e.weeklyPct === "number").sort((a, b) => a.weeklyPct - b.weeklyPct);
      const fiveHList = entries.filter((e) => typeof e.fiveHourPct === "number").sort((a, b) => a.fiveHourPct - b.fiveHourPct);
      return {
        weekly: weeklyList[0] ? { ...weeklyList[0], pct: weeklyList[0].weeklyPct } : null,
        fiveHour: fiveHList[0] ? { ...fiveHList[0], pct: fiveHList[0].fiveHourPct } : null
      };
    }

    let matched = entries.find((e) => e.bucketId === poolKey || e.key === poolKey);
    if (!matched) {
      if (poolKey === "gemini-weekly") matched = entries.find((e) => /gemini/i.test(e.bucketId) && !/argon/i.test(e.bucketId)) || entries[0];
      else if (poolKey === "3p-weekly") matched = entries.find((e) => /3p|claude|gpt/i.test(e.bucketId) || /claude|gpt/i.test(e.label)) || null;
      else if (poolKey === "gemini-argon-wtu-weekly") matched = entries.find((e) => /argon/i.test(e.bucketId) || /argon/i.test(e.label)) || null;
    }
    if (!matched) return { weekly: null, fiveHour: null };
    return {
      weekly: typeof matched.weeklyPct === "number" ? { ...matched, pct: matched.weeklyPct } : null,
      fiveHour: typeof matched.fiveHourPct === "number" ? { ...matched, pct: matched.fiveHourPct } : null
    };
  }

  function resetBreachStreak() {
    breachStreak = { email: "", ruleKey: "", count: 0, firstAt: 0, lastAt: 0 };
    if (confirmRecheckTimer) {
      clearTimeout(confirmRecheckTimer);
      confirmRecheckTimer = null;
    }
  }

  function scheduleConfirmRecheck() {
    if (confirmRecheckTimer) return;
    if (!process.env.ANTIGRAVITY_LS_ADDRESS || !process.env.ANTIGRAVITY_CSRF_TOKEN) return;
    confirmRecheckTimer = setTimeout(() => {
      confirmRecheckTimer = null;
      fetchQuotaFromLanguageServer(true).catch(() => {});
    }, 4000);
    if (typeof confirmRecheckTimer.unref === "function") confirmRecheckTimer.unref();
  }

  function evaluateAutoSwitch(quotaPayload, opts = {}) {
    const now = Number(opts?.now) || Date.now();
    if (typeof opts?.agentBusy === "boolean") {
      hostAgentBusyState = { busy: opts.agentBusy, updatedAt: now };
    } else if (typeof quotaPayload?.agentBusy === "boolean") {
      hostAgentBusyState = { busy: quotaPayload.agentBusy, updatedAt: now };
    }

    const cfg = loadAutoSwitchConfig();
    const curEmail = String(quotaPayload?.email || "").trim();

    // 记录当前账号各模型池的完整每周/5h快照与重置时间，方便自动重置判定与切号挑选
    if (curEmail && Array.isArray(quotaPayload?.groups)) {
      const snap = { ...(cfg.accountQuotaSnapshots || {}) };
      const emailSnap = { updatedAt: now, pools: {} };
      for (const g of quotaPayload.groups) {
        const k = g.weeklyBucketId || g.key;
        if (!k) continue;
        if (typeof g.weeklyPct === "number") emailSnap[k] = g.weeklyPct;
        emailSnap.pools[k] = {
          key: k,
          label: g.label || k,
          weeklyPct: typeof g.weeklyPct === "number" ? g.weeklyPct : (typeof g.pct === "number" ? g.pct : null),
          weeklyResetTime: g.weeklyResetTime || g.resetTime || "",
          fiveHourPct: typeof g.fiveHourPct === "number" ? g.fiveHourPct : null,
          fiveHourResetTime: g.fiveHourResetTime || ""
        };
      }
      snap[curEmail] = emailSnap;
      cfg.accountQuotaSnapshots = snap;
      writeJsonSafe(autoSwitchFile, cfg);
    }

    // 闸门 1：总开关 & 至少启用一条规则 & switchAccount 可用
    const checkWeekly = cfg.weeklyEnabled !== false;
    const checkFiveHour = cfg.fiveHourEnabled !== false;
    if (!cfg.enabled || (!checkWeekly && !checkFiveHour) || !accountVault || typeof accountVault.switchAccount !== "function") {
      resetBreachStreak();
      return { triggered: false };
    }

    // 闸门 2：账号一致性核验（防止切号过渡期旧账号残留数据误触发）
    const vault = getVaultSnapshot();
    const activeEmail = vault.currentEmail || "";
    if (!curEmail || (activeEmail && curEmail.toLowerCase() !== activeEmail.toLowerCase())) {
      resetBreachStreak();
      return { triggered: false, reason: "account_mismatch" };
    }

    // 闸门 3：结合 resetTime 过期自动恢复判定 + 精确 0~95 阈值比较
    const metrics = extractMonitoredPoolMetrics(quotaPayload, cfg.poolKey, now);
    const weeklyHit = Boolean(checkWeekly && metrics.weekly && !metrics.weekly.weeklyRecovered && metrics.weekly.pct <= cfg.thresholdPct);
    const fiveHourHit = Boolean(checkFiveHour && metrics.fiveHour && !metrics.fiveHour.fiveHourRecovered && metrics.fiveHour.pct <= cfg.fiveHourThresholdPct);
    const monitored = weeklyHit ? metrics.weekly : fiveHourHit ? metrics.fiveHour : (metrics.weekly || metrics.fiveHour);

    if (!weeklyHit && !fiveHourHit) {
      resetBreachStreak();
      return { triggered: false, monitored, metrics };
    }

    // 闸门 4：连续 2 次独立实测确认（防单次接口毛刺或瞬间抖动误切）
    const emailLower = curEmail.toLowerCase();
    const ruleKey = [
      weeklyHit ? `w:${metrics.weekly.bucketId}` : "",
      fiveHourHit ? `h:${metrics.fiveHour.bucketId}` : ""
    ].filter(Boolean).join("+");

    const sameStreak =
      breachStreak.email === emailLower &&
      breachStreak.ruleKey === ruleKey &&
      now - breachStreak.lastAt <= 180000;

    if (!sameStreak) {
      breachStreak = { email: emailLower, ruleKey, count: 1, firstAt: now, lastAt: now };
      scheduleConfirmRecheck();
      return { triggered: false, reason: "confirming_1_of_2", pendingConfirm: true, monitored, metrics };
    }
    if (now - breachStreak.firstAt < 3000) {
      breachStreak.lastAt = now;
      scheduleConfirmRecheck();
      return { triggered: false, reason: "confirming_1_of_2", pendingConfirm: true, monitored, metrics };
    }
    breachStreak.count = Math.max(2, breachStreak.count + 1);
    breachStreak.lastAt = now;

    // 闸门 5：智能体空闲保护（回复/代码修改期间延后切号，绝不中途打断）
    const isAgentBusy = hostAgentBusyState.busy && now - hostAgentBusyState.updatedAt < 45000;
    if (isAgentBusy) {
      return { triggered: false, reason: "deferred_agent_busy", deferred: true, monitored, metrics };
    }

    // 闸门 6：切号冷却保护
    const cooldownMs = cfg.cooldownMinutes * 60 * 1000;
    if (cfg.lastSwitchAt && now - cfg.lastSwitchAt < cooldownMs) {
      return { triggered: false, reason: "cooldown", monitored, metrics };
    }

    // 闸门 7：严格顺位候选校验（必须存在不同账号且未双限额同时不足）
    const orderedAccounts = buildOrderedAccounts(vault.accounts, cfg.accountOrder);
    if (orderedAccounts.length < 2) {
      return { triggered: false, reason: "no_candidate_accounts", monitored, metrics };
    }

    const effectiveActive = activeEmail || curEmail;
    const target = pickNextCandidate(
      orderedAccounts,
      effectiveActive,
      monitored?.bucketId || cfg.poolKey,
      cfg,
      cfg.accountQuotaSnapshots || {},
      now
    );
    if (!target || !target.email || target.email.toLowerCase() === effectiveActive.toLowerCase()) {
      return { triggered: false, reason: "all_candidates_below_threshold", monitored, metrics };
    }

    try {
      // 切换前先自动保存当前账号最新凭据并清理确认计数
      if (typeof accountVault.saveCurrentAccount === "function") {
        try { accountVault.saveCurrentAccount(); } catch {}
      }
      const switched = accountVault.switchAccount(target.email);
      const toEmail = switched.email || target.email;
      if (typeof recordAccountSwitch === "function") {
        try { recordAccountSwitch(toEmail); } catch {}
      }
      const reasonParts = [];
      if (weeklyHit) reasonParts.push(`${metrics.weekly.label} 每周剩余 ${metrics.weekly.pct}% ≤ ${cfg.thresholdPct}%`);
      if (fiveHourHit) reasonParts.push(`${metrics.fiveHour.label} 5小时剩余 ${metrics.fiveHour.pct}% ≤ ${cfg.fiveHourThresholdPct}%`);
      const reason = reasonParts.join(" 且 ");
      const historyEntry = {
        at: now,
        fromEmail: effectiveActive,
        toEmail,
        reason,
        weeklyPct: metrics.weekly?.pct ?? null,
        fiveHourPct: metrics.fiveHour?.pct ?? null
      };
      const prevHistory = Array.isArray(cfg.switchHistory) ? cfg.switchHistory : [];
      writeJsonSafe(autoSwitchFile, {
        ...cfg,
        lastSwitchAt: now,
        lastSwitchFrom: effectiveActive,
        lastSwitchTo: toEmail,
        lastTriggerReason: reason,
        switchHistory: [historyEntry, ...prevHistory].slice(0, 10)
      });
      resetBreachStreak();

      if (cfg.reloadWindow && typeof reloadHostWindow === "function") {
        setTimeout(() => {
          Promise.resolve(reloadHostWindow()).catch(() => {});
        }, 1200);
      }

      return {
        triggered: true,
        fromEmail: effectiveActive,
        toEmail,
        reason,
        monitored,
        metrics
      };
    } catch (err) {
      return { triggered: false, error: err instanceof Error ? err.message : String(err), monitored, metrics };
    }
  }

  function getLocalVersionInfo() {
    const fallback = { version: "2.1.4", publishedAt: "", repoUrl: REPO_URL, branch: DEFAULT_UPDATE_BRANCH, highlights: [] };
    const fromData = readJsonSafe(versionFile, null);
    if (fromData && fromData.version) return { ...fallback, ...fromData };
    const fromSeed = readJsonSafe(path.join(pluginRoot, "sidecars", "dashboard", "user", "suite-version.json"), null);
    if (fromSeed && fromSeed.version) return { ...fallback, ...fromSeed };
    return fallback;
  }

  async function checkSuiteUpdate({ force = false } = {}) {
    const local = getLocalVersionInfo();
    const branch = String(local.branch || DEFAULT_UPDATE_BRANCH).trim() || DEFAULT_UPDATE_BRANCH;
    const state = readJsonSafe(updateStateFile, { dismissedVersion: "", lastCheckedAt: 0, lastRemote: null });
    const now = Date.now();

    if (!force && cachedRemote && now - lastRemoteCheckAt < UPDATE_CACHE_TTL_MS) {
      // memory cache hit
    } else if (!force && state.lastRemote && now - (state.lastCheckedAt || 0) < UPDATE_CACHE_TTL_MS) {
      cachedRemote = state.lastRemote;
      lastRemoteCheckAt = state.lastCheckedAt;
    } else {
      const fetched = await fetchRemoteVersionJson(branch);
      if (fetched) {
        cachedRemote = fetched;
        lastRemoteCheckAt = now;
        writeJsonSafe(updateStateFile, {
          ...state,
          lastCheckedAt: now,
          lastRemote: fetched
        });
      }
    }

    const remote = cachedRemote || state.lastRemote || null;
    const latestVersion = remote?.version || local.version;
    const hasUpdate = Boolean(remote && compareSemver(latestVersion, local.version) > 0);
    const dismissedVersion = state.dismissedVersion || "";

    return {
      ok: true,
      currentVersion: local.version,
      latestVersion,
      branch,
      hasUpdate,
      shouldNotify: hasUpdate && dismissedVersion !== latestVersion,
      dismissedVersion,
      highlights: Array.isArray(remote?.highlights) ? remote.highlights : local.highlights || [],
      publishedAt: remote?.publishedAt || local.publishedAt || "",
      repoUrl: remote?.repoUrl || local.repoUrl || REPO_URL,
      lastCheckedAt: lastRemoteCheckAt || state.lastCheckedAt || 0,
      updating: updateInProgress
    };
  }

  async function runOneClickUpdate() {
    if (updateInProgress) {
      return { ok: false, error: "正在同步更新中，请稍候..." };
    }
    updateInProgress = true;
    const local = getLocalVersionInfo();
    const branch = String(local.branch || DEFAULT_UPDATE_BRANCH).trim() || DEFAULT_UPDATE_BRANCH;
    const tmpDir = path.join(os.tmpdir(), `ag-ui-sync-${Date.now()}`);
    const proxyEnv = detectSystemProxyEnv();
    const gitEnv = { ...process.env };
    if (proxyEnv.HTTPS_PROXY) gitEnv.HTTPS_PROXY = proxyEnv.HTTPS_PROXY;
    if (proxyEnv.HTTP_PROXY) gitEnv.HTTP_PROXY = proxyEnv.HTTP_PROXY;
    if (proxyEnv.ALL_PROXY) gitEnv.ALL_PROXY = proxyEnv.ALL_PROXY;

    try {
      await new Promise((resolve, reject) => {
        execFile("git", ["clone", "--depth", "1", "--branch", branch, REPO_GIT_URL, tmpDir], { env: gitEnv, timeout: 45000, windowsHide: true }, (err, stdout, stderr) => {
          if (err) reject(new Error(stderr || err.message));
          else resolve(stdout);
        });
      });

      const cmd = process.platform === "win32" ? "powershell.exe" : "bash";
      const args = process.platform === "win32"
        ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(tmpDir, "install-win.ps1")]
        : [path.join(tmpDir, "install-mac.sh")];

      const output = await new Promise((resolve, reject) => {
        execFile(cmd, args, { cwd: tmpDir, env: gitEnv, timeout: 60000, windowsHide: true }, (err, stdout, stderr) => {
          if (err) reject(new Error((stderr || stdout || err.message).slice(-600)));
          else resolve(stdout || "");
        });
      });

      const newVer = readJsonSafe(path.join(tmpDir, "version.json"), null);
      if (newVer && newVer.version) {
        writeJsonSafe(versionFile, newVer);
        const st = readJsonSafe(updateStateFile, {});
        writeJsonSafe(updateStateFile, { ...st, lastRemote: newVer, lastCheckedAt: Date.now(), dismissedVersion: "" });
        cachedRemote = newVer;
        lastRemoteCheckAt = Date.now();
      }

      if (typeof reloadAll === "function") {
        try { await reloadAll(); } catch {}
      }

      return {
        ok: true,
        updatedTo: newVer?.version || getLocalVersionInfo().version,
        needsRestart: true,
        log: String(output).slice(-800)
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      updateInProgress = false;
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }

  async function handleUpdateAction(body) {
    const action = String(body?.action || "").toLowerCase();
    if (action === "dismiss") {
      const ver = String(body?.version || "").trim();
      const st = readJsonSafe(updateStateFile, {});
      writeJsonSafe(updateStateFile, { ...st, dismissedVersion: ver });
      return { ok: true, dismissedVersion: ver };
    }
    if (action === "check") {
      return await checkSuiteUpdate({ force: true });
    }
    if (action === "update") {
      return await runOneClickUpdate();
    }
    return { ok: false, error: `未知操作: ${action}` };
  }

  function normalizeLsQuotaPayload(us, summary) {
    const summaryGroups = summary?.response?.groups || [];
    let groups = [];
    if (Array.isArray(summaryGroups) && summaryGroups.length > 0) {
      groups = summaryGroups.map((g) => {
        const buckets = Array.isArray(g.buckets) ? g.buckets : [];
        const weekly = buckets.find((bk) => bk.window === "weekly" || /weekly/i.test(bk.bucketId || ""));
        const fiveH = buckets.find((bk) => bk.window === "5h" || /5h/i.test(bk.bucketId || ""));
        const weeklyPct = weekly && typeof weekly.remainingFraction === "number" ? Math.round(weekly.remainingFraction * 100) : null;
        const fiveHourPct = fiveH && typeof fiveH.remainingFraction === "number" ? Math.round(fiveH.remainingFraction * 100) : null;
        let cnLabel = g.displayName || "模型池";
        if (/Gemini Models/i.test(cnLabel)) cnLabel = "Gemini 核心池";
        else if (/Claude and GPT/i.test(cnLabel)) cnLabel = "Claude / GPT";
        return {
          key: (weekly && weekly.bucketId) || (fiveH && fiveH.bucketId) || cnLabel,
          label: cnLabel,
          description: g.description || "",
          weeklyBucketId: (weekly && weekly.bucketId) || "",
          weeklyPct,
          weeklyResetTime: (weekly && weekly.resetTime) || "",
          fiveHourPct,
          fiveHourResetTime: (fiveH && fiveH.resetTime) || "",
          pct: weeklyPct !== null ? weeklyPct : fiveHourPct,
          resetTime: (weekly && weekly.resetTime) || (fiveH && fiveH.resetTime) || ""
        };
      });
    } else {
      const configs = us?.cascadeModelConfigData?.clientModelConfigs || [];
      const bucketMap = new Map();
      for (const c of configs) {
        const label = String(c.label || "");
        const rem = c.quotaInfo && typeof c.quotaInfo.remainingFraction === "number" ? c.quotaInfo.remainingFraction : null;
        const resetTime = (c.quotaInfo && c.quotaInfo.resetTime) || "";
        if (rem === null) continue;
        let groupKey = "gemini-weekly";
        let groupLabel = "Gemini 核心池";
        if (/Argon/i.test(label)) {
          groupKey = "gemini-argon-wtu-weekly";
          groupLabel = "Gemini 4 Argon";
        } else if (/Claude|GPT/i.test(label)) {
          groupKey = "3p-weekly";
          groupLabel = "Claude / GPT";
        }
        const pct = Math.round(rem * 100);
        const prev = bucketMap.get(groupKey);
        if (!prev) {
          bucketMap.set(groupKey, { key: groupKey, weeklyBucketId: groupKey, label: groupLabel, weeklyPct: pct, pct, resetTime, weeklyResetTime: resetTime });
        } else if (pct < prev.pct) {
          prev.pct = pct;
          prev.weeklyPct = pct;
        }
      }
      groups = Array.from(bucketMap.values());
    }
    return {
      email: us?.email || "",
      planName: us?.planStatus?.planInfo?.planName || us?.userTier?.name || "",
      groups
    };
  }

  async function fetchQuotaFromLanguageServer(force = false) {
    const lsAddress = process.env.ANTIGRAVITY_LS_ADDRESS || "";
    const csrfToken = process.env.ANTIGRAVITY_CSRF_TOKEN || "";
    if (!lsAddress || !csrfToken) return cachedQuota;

    const now = Date.now();
    if (!force && now - lastLsFetchAt < 8000 && cachedQuota) return cachedQuota;
    if (lsQuotaInFlight) return await lsQuotaInFlight;

    lsQuotaInFlight = (async () => {
      lastLsFetchAt = Date.now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      try {
        const opts = {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-codeium-csrf-token": csrfToken },
          body: "{}",
          signal: ctrl.signal
        };
        const [statusRes, summaryRes] = await Promise.allSettled([
          fetch(`http://${lsAddress}/exa.language_server_pb.LanguageServerService/GetUserStatus`, opts).then((r) => (r.ok ? r.json() : null)),
          fetch(`http://${lsAddress}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary`, opts).then((r) => (r.ok ? r.json() : null))
        ]);
        const us = statusRes.status === "fulfilled" && statusRes.value?.userStatus ? statusRes.value.userStatus : null;
        const summary = summaryRes.status === "fulfilled" ? summaryRes.value : null;
        if (us || summary) {
          const payload = normalizeLsQuotaPayload(us, summary);
          if (payload.groups.length > 0 || payload.email) {
            updateQuotaCache(payload);
          }
        }
      } catch {} finally {
        clearTimeout(timer);
        lsQuotaInFlight = null;
      }
      return cachedQuota;
    })();

    return await lsQuotaInFlight;
  }

  function updateQuotaCache(payload, opts = {}) {
    if (!payload || typeof payload !== "object") return { ok: false, error: "Invalid quota payload" };
    cachedQuota = {
      ...payload,
      updatedAt: Number(opts?.now) || Date.now()
    };
    try { writeJsonSafe(quotaCacheFile, cachedQuota); } catch {}
    lastAutoSwitchResult = evaluateAutoSwitch(cachedQuota, {
      ...opts,
      agentBusy: typeof opts?.agentBusy === "boolean"
        ? opts.agentBusy
        : (typeof payload.agentBusy === "boolean" ? payload.agentBusy : undefined)
    });
    return { ok: true, updatedAt: cachedQuota.updatedAt, autoSwitch: lastAutoSwitchResult };
  }

  async function getQuotaCacheAsync({ force = false } = {}) {
    const empty = !cachedQuota || !Array.isArray(cachedQuota.groups) || cachedQuota.groups.length === 0;
    const stale = !cachedQuota || Date.now() - (cachedQuota.updatedAt || 0) > 20000;
    if (force || empty) {
      await fetchQuotaFromLanguageServer(true);
    } else if (stale) {
      fetchQuotaFromLanguageServer(false).catch(() => {});
    }
    return {
      ok: true,
      data: cachedQuota,
      autoSwitch: lastAutoSwitchResult
    };
  }

  // 启动后快速预拉取一次实时配额并每 30 秒静默刷新，确保浮窗与面板毫秒级秒开
  const lsInitTimer = setTimeout(() => { fetchQuotaFromLanguageServer(false).catch(() => {}); }, 350);
  if (typeof lsInitTimer.unref === "function") lsInitTimer.unref();
  const lsPollTimer = setInterval(() => { fetchQuotaFromLanguageServer(false).catch(() => {}); }, 30000);
  if (typeof lsPollTimer.unref === "function") lsPollTimer.unref();

  function getAutoSwitchState(opts = {}) {
    const now = Number(opts?.now) || Date.now();
    if (typeof opts?.busy === "boolean") {
      hostAgentBusyState = { busy: opts.busy, updatedAt: now };
      if (!opts.busy && lastAutoSwitchResult?.reason === "deferred_agent_busy" && cachedQuota) {
        lastAutoSwitchResult = evaluateAutoSwitch(cachedQuota, { agentBusy: false, now });
      }
    }
    const cfg = loadAutoSwitchConfig();
    const vault = getVaultSnapshot();
    const activeEmail = vault.currentEmail || cachedQuota?.email || "";
    const ordered = buildOrderedAccounts(vault.accounts, cfg.accountOrder);
    const monitoredBucket = cfg.poolKey === "any-weekly" ? "" : cfg.poolKey;
    const nextCand = pickNextCandidate(
      ordered,
      activeEmail,
      monitoredBucket,
      cfg,
      cfg.accountQuotaSnapshots || {},
      now
    );
    const nextTargetEmail = nextCand ? nextCand.email : "";
    const cooldownMs = (cfg.cooldownMinutes || 10) * 60 * 1000;
    const cooldownRemainingSec =
      cfg.lastSwitchAt && now - cfg.lastSwitchAt < cooldownMs
        ? Math.ceil((cooldownMs - (now - cfg.lastSwitchAt)) / 1000)
        : 0;
    const metrics = cachedQuota ? extractMonitoredPoolMetrics(cachedQuota, cfg.poolKey, now) : { weekly: null, fiveHour: null };
    const pendingConfirm = Boolean(
      lastAutoSwitchResult?.reason === "confirming_1_of_2" &&
      breachStreak.count > 0 &&
      now - breachStreak.lastAt <= 180000
    );
    const deferredBusy = Boolean(lastAutoSwitchResult?.reason === "deferred_agent_busy");
    return {
      ok: true,
      config: {
        ...cfg,
        accountOrder: ordered.map((a) => a.email)
      },
      monitoredPct: metrics.weekly ? metrics.weekly.pct : null,
      monitoredLabel: metrics.weekly ? metrics.weekly.label : "",
      monitoredFiveHourPct: metrics.fiveHour ? metrics.fiveHour.pct : null,
      monitoredFiveHourLabel: metrics.fiveHour ? metrics.fiveHour.label : "",
      cooldownRemainingSec,
      pendingConfirm,
      deferredBusy,
      switchHistory: Array.isArray(cfg.switchHistory) ? cfg.switchHistory : [],
      lastEvaluation: lastAutoSwitchResult,
      vaultCount: ordered.length,
      currentEmail: activeEmail,
      nextTargetEmail,
      accounts: ordered.map((a, idx) => {
        const acctSnap = findAccountSnapshot(cfg.accountQuotaSnapshots, a.email);
        return {
          orderIndex: idx + 1,
          email: a.email,
          isCurrent: Boolean(activeEmail && a.email.toLowerCase() === activeEmail.toLowerCase()),
          isNext: Boolean(nextTargetEmail && a.email.toLowerCase() === nextTargetEmail.toLowerCase()),
          lastWeekly: acctSnap,
          snapshotUpdatedAt: acctSnap?.updatedAt || 0,
          pools: formatAccountPools(acctSnap, now)
        };
      })
    };
  }

  function findDarwinAntigravityProcess(appPath) {
    try {
      const appBin = path.join(appPath, "Contents", "MacOS", "Antigravity");
      const out = execFileSync("/bin/ps", ["-axo", "pid=,command="], {
        encoding: "utf8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "ignore"]
      });
      for (const rawLine of out.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        const m = line.match(/^(\d+)\s+(.+)$/);
        if (!m) continue;
        const cmd = m[2];
        if (cmd === appBin || cmd.startsWith(appBin + " ")) {
          return { pid: m[1], cmdLine: cmd };
        }
      }
    } catch {}
    return null;
  }

  function relaunchAntigravityWithCdp() {
    if (process.platform === "darwin") {
      const appPath = fs.existsSync("/Applications/Antigravity.app")
        ? "/Applications/Antigravity.app"
        : path.join(os.homedir(), "Applications", "Antigravity.app");
      const launcherApp = fs.existsSync("/Applications/Antigravity Gravity.app")
        ? "/Applications/Antigravity Gravity.app"
        : fs.existsSync("/Applications/Antigravity Nebula.app")
          ? "/Applications/Antigravity Nebula.app"
          : "/Applications/Antigravity Aura.app";
      const proc = findDarwinAntigravityProcess(appPath);
      const oldPid = proc?.pid || "";

      // 优先通过 launchd (open -g -a "Antigravity Gravity.app") 拉起重启流程：
      // 进程完全脱离 Antigravity / language_server 进程树，避免退出瞬间被连带杀掉导致无法重开或竞态闪退
      if (fs.existsSync(launcherApp)) {
        const openArgs = ["-g", "-n", "-a", launcherApp, "--args", oldPid ? `--relaunch-pid=${oldPid}` : "--relaunch"];
        const child = spawn("/usr/bin/open", openArgs, { detached: true, stdio: "ignore" });
        child.unref();
        return { ok: true, platform: "darwin", appPath, launcherApp, oldPid };
      }

      const sh = `
sleep 0.5
/usr/bin/osascript -e 'tell application "Antigravity" to quit' >/dev/null 2>&1 || true
i=0
while [ "$i" -lt 40 ]; do
  if [ -n "${oldPid}" ] && ! kill -0 "${oldPid}" 2>/dev/null; then break; fi
  sleep 0.2
  i=$((i + 1))
done
sleep 1
/usr/bin/open -a "${appPath}" --args --remote-debugging-port=0
`;
      const child = spawn("/usr/bin/nohup", ["/bin/sh", "-c", sh], { detached: true, stdio: "ignore" });
      child.unref();
      return { ok: true, platform: "darwin", appPath, oldPid };
    }
    if (process.platform === "win32") {
      const ps = `Start-Sleep -Milliseconds 600; $p=(Get-Process -Name Antigravity -ErrorAction SilentlyContinue | Select-Object -First 1).Path; Stop-Process -Name Antigravity -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 1200; if ($p) { Start-Process -FilePath $p -ArgumentList '--remote-debugging-port=0' }`;
      const child = spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps], {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      });
      child.unref();
      return { ok: true, platform: "win32" };
    }
    return { ok: false, error: `Unsupported platform: ${process.platform}` };
  }

  const autoCdpFile = path.join(dataDir, "suite-auto-cdp-relaunch.json");

  function autoEnsureCdpModeOnStartup() {
    if (process.platform !== "darwin") return;
    try {
      const auraCfg = readJsonSafe(path.join(dataDir, "config.json"), { enabled: true });
      if (auraCfg && (auraCfg.enabled === false || auraCfg.autoRelaunchCdp === false)) {
        return;
      }
      const appPath = fs.existsSync("/Applications/Antigravity.app")
        ? "/Applications/Antigravity.app"
        : path.join(os.homedir(), "Applications", "Antigravity.app");
      if (!fs.existsSync(appPath)) return;

      const proc = findDarwinAntigravityProcess(appPath);
      const curPid = proc?.pid || "";
      const cmdLine = proc?.cmdLine || "";
      if (!curPid || !cmdLine || cmdLine.includes("--remote-debugging-port")) {
        return;
      }

      const now = Date.now();
      const prev = readJsonSafe(autoCdpFile, { lastPid: "", lastRelaunchAt: 0 });
      if (String(prev?.lastPid || "") === String(curPid) || now - (Number(prev?.lastRelaunchAt) || 0) < 25000) {
        return;
      }

      writeJsonSafe(autoCdpFile, {
        lastPid: String(curPid),
        lastRelaunchAt: now,
        reason: "missing_remote_debugging_port_after_update_or_launch"
      });
      console.log(`[Gravity Hub] Detected Antigravity (pid=${curPid}) running without --remote-debugging-port; auto-relaunching into Gravity Theme mode...`);
      relaunchAntigravityWithCdp();
    } catch (err) {
      console.warn("[Gravity Hub] autoEnsureCdpModeOnStartup failed:", err?.message || err);
    }
  }

  setTimeout(() => {
    autoEnsureCdpModeOnStartup();
  }, 1500);

  // 启动带随机 Token 的本地 CORS 桥接服务，专供 Antigravity 宿主窗口 (custom.js) 直接调用
  const bridgeToken = crypto.randomBytes(16).toString("hex");
  let bridgeOrigin = "";

  const bridgeServer = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Suite-Token");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    res.setHeader("Cache-Control", "no-store");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const tok = req.headers["x-suite-token"];
    if (tok !== bridgeToken) {
      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "Forbidden" }));
      return;
    }

    const urlObj = new URL(req.url || "/", "http://127.0.0.1");
    let bodyObj = {};
    if (req.method === "POST") {
      const raw = await new Promise((resolve) => {
        let s = "";
        req.on("data", (c) => { if (s.length < 256 * 1024) s += c; });
        req.on("end", () => resolve(s));
      });
      if (raw.trim()) {
        try { bodyObj = JSON.parse(raw); } catch {}
      }
    }

    let result = { ok: false, error: "Not found" };
    let status = 200;
    try {
      if (urlObj.pathname === "/api/launch-cli" && req.method === "GET") {
        const cliPath = resolveAgyCliPath();
        const proxy = detectSystemProxyEnv();
        result = { ok: true, installed: Boolean(cliPath), cliPath, platform: process.platform, proxy };
      } else if (urlObj.pathname === "/api/launch-cli" && req.method === "POST") {
        result = launchAgyCli(bodyObj);
      } else if (urlObj.pathname === "/api/suite-guardrails" && req.method === "GET") {
        result = getGuardrailsState();
      } else if (urlObj.pathname === "/api/suite-guardrails" && req.method === "POST") {
        result = setGuardrailsTier(bodyObj.tier);
      } else if (urlObj.pathname === "/api/suite-update" && req.method === "GET") {
        result = await checkSuiteUpdate({ force: urlObj.searchParams.get("force") === "1" });
      } else if (urlObj.pathname === "/api/suite-update/action" && req.method === "POST") {
        result = await handleUpdateAction(bodyObj);
      } else if (urlObj.pathname === "/api/suite-quota" && req.method === "GET") {
        result = await getQuotaCacheAsync({ force: urlObj.searchParams.get("refresh") === "1" });
      } else if (urlObj.pathname === "/api/suite-quota" && req.method === "POST") {
        result = updateQuotaCache(bodyObj, {
          now: Number(bodyObj?.now) || undefined,
          agentBusy: typeof bodyObj?.agentBusy === "boolean" ? bodyObj.agentBusy : undefined
        });
      } else if (urlObj.pathname === "/api/suite-auto-switch" && req.method === "GET") {
        const bParam = urlObj.searchParams.get("busy");
        result = getAutoSwitchState({
          busy: bParam === "1" ? true : (bParam === "0" ? false : undefined)
        });
      } else if (urlObj.pathname === "/api/suite-auto-switch" && req.method === "POST") {
        saveAutoSwitchConfig(bodyObj);
        result = getAutoSwitchState();
      } else if (urlObj.pathname === "/api/suite-last-route" && req.method === "GET") {
        result = getLastRouteState();
      } else if (urlObj.pathname === "/api/suite-last-route" && req.method === "POST") {
        result = saveLastRouteState(bodyObj);
      } else if (urlObj.pathname === "/api/suite-auto-compact" && req.method === "GET") {
        result = getAutoCompactState();
      } else if (urlObj.pathname === "/api/suite-auto-compact" && req.method === "POST") {
        result = saveAutoCompactState(bodyObj);
      } else if (urlObj.pathname === "/api/suite-account-prefs" && req.method === "GET") {
        result = getAccountPrefs();
      } else if (urlObj.pathname === "/api/suite-account-prefs" && req.method === "POST") {
        result = saveAccountPrefs(bodyObj);
      } else if (urlObj.pathname === "/api/suite-tps-monitor" && req.method === "GET") {
        result = getTpsMonitorState();
      } else if (urlObj.pathname === "/api/suite-tps-monitor" && req.method === "POST") {
        result = saveTpsMonitorState(bodyObj);
      } else if (urlObj.pathname === "/api/suite-reload" && req.method === "POST") {
        if (typeof reloadAll === "function") await reloadAll();
        result = { ok: true, reloaded: true };
      } else if (urlObj.pathname === "/api/suite-relaunch-cdp" && req.method === "POST") {
        result = relaunchAntigravityWithCdp();
      } else {
        status = 404;
      }
    } catch (err) {
      status = 500;
      result = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(result));
  });

  bridgeServer.listen(0, "127.0.0.1", () => {
    const addr = bridgeServer.address();
    if (addr && typeof addr === "object") {
      bridgeOrigin = `http://127.0.0.1:${addr.port}`;
      appendHubBootLog(`bridge listening on 127.0.0.1:${addr.port} sidecarPort=${process.env.ANTIGRAVITY_SIDECAR_WEB_PORT || ""}`);
    }
  });

  function parseBody(e) {
    if (!e) return {};
    if (typeof e === "string") {
      try { return JSON.parse(e); } catch { return {}; }
    }
    return typeof e === "object" ? e : {};
  }

  function registerOnOe(Oe, ResponseClass) {
    Oe.api("/api/suite-guardrails", () => getGuardrailsState(), "GET");
    Oe.api("/api/suite-guardrails", (e) => setGuardrailsTier(parseBody(e).tier), "POST");

    Oe.api("/api/launch-cli", () => {
      const cliPath = resolveAgyCliPath();
      const proxy = detectSystemProxyEnv();
      return { ok: true, installed: Boolean(cliPath), cliPath, platform: process.platform, proxy };
    }, "GET");
    Oe.api("/api/launch-cli", (e) => launchAgyCli(parseBody(e)), "POST");

    Oe.api("/api/suite-update", async () => await checkSuiteUpdate({ force: false }), "GET");
    Oe.api("/api/suite-update/action", async (e) => await handleUpdateAction(parseBody(e)), "POST");

    Oe.api("/api/suite-quota", async (e, req) => {
      const force = Boolean(req?.url && String(req.url).includes("refresh=1"));
      return await getQuotaCacheAsync({ force });
    }, "GET");
    Oe.api("/api/suite-quota", (e) => {
      const b = parseBody(e);
      return updateQuotaCache(b, {
        now: Number(b?.now) || undefined,
        agentBusy: typeof b?.agentBusy === "boolean" ? b.agentBusy : undefined
      });
    }, "POST");

    Oe.api("/api/suite-auto-switch", (e, req) => {
      const u = String(req?.url || "");
      const busy = u.includes("busy=1") ? true : (u.includes("busy=0") ? false : undefined);
      return getAutoSwitchState({ busy });
    }, "GET");
    Oe.api("/api/suite-auto-switch", (e) => {
      saveAutoSwitchConfig(parseBody(e));
      return getAutoSwitchState();
    }, "POST");

    Oe.api("/api/suite-last-route", () => getLastRouteState(), "GET");
    Oe.api("/api/suite-last-route", (e) => saveLastRouteState(parseBody(e)), "POST");
    Oe.api("/api/suite-auto-compact", () => getAutoCompactState(), "GET");
    Oe.api("/api/suite-auto-compact", (e) => saveAutoCompactState(parseBody(e)), "POST");
    Oe.api("/api/suite-account-prefs", () => getAccountPrefs(), "GET");
    Oe.api("/api/suite-account-prefs", (e) => saveAccountPrefs(parseBody(e)), "POST");
    Oe.api("/api/suite-tps-monitor", () => getTpsMonitorState(), "GET");
    Oe.api("/api/suite-tps-monitor", (e) => saveTpsMonitorState(parseBody(e)), "POST");
    Oe.api("/api/suite-relaunch-cdp", () => relaunchAntigravityWithCdp(), "POST");

    Oe.api("/suite-panel-addon.js", () => {
      const src = panelAddonPath && fs.existsSync(panelAddonPath)
        ? fs.readFileSync(panelAddonPath, "utf8")
        : "";
      return new ResponseClass(src, {
        contentType: "application/javascript; charset=utf-8",
        headers: { "Cache-Control": "no-cache, no-store, must-revalidate" }
      });
    }, "GET");
  }

  return {
    getBridgeInfo: () => (bridgeOrigin ? { origin: bridgeOrigin, token: bridgeToken } : null),
    registerOnOe,
    closeBridge: () => { try { bridgeServer.close(); } catch {} }
  };
}
