import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { spawn, execFile, execFileSync } from "node:child_process";

const REPO_URL = "https://github.com/Songh0918/antigravity-ui-suggestion";
const REPO_GIT_URL = `${REPO_URL}.git`;
const REMOTE_VERSION_URL = "https://raw.githubusercontent.com/Songh0918/antigravity-ui-suggestion/main/version.json";
const UPDATE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 小时

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
  thresholdPct: 10,
  cooldownMinutes: 10,
  reloadWindow: true,
  lastSwitchAt: 0,
  lastSwitchFrom: "",
  lastSwitchTo: "",
  lastTriggerReason: "",
  accountQuotaSnapshots: {}
};

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
      const script = `tell application "Terminal"\n  activate\n  do script "${appleScriptEscape(shellCmd)}"\nend tell`;
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

async function fetchRemoteVersionJson() {
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
        ["-fsSL", "--max-time", "4", `${REMOTE_VERSION_URL}?t=${Date.now()}`],
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
    const resp = await fetch(`${REMOTE_VERSION_URL}?t=${Date.now()}`, { signal: ctrl.signal });
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
  panelAddonPath,
  accountVault,
  recordAccountSwitch,
  reloadHostWindow
}) {
  const rulesPath = path.join(pluginRoot, "rules", "AGENTS.md");
  const versionFile = path.join(dataDir, "suite-version.json");
  const updateStateFile = path.join(dataDir, "suite-update-state.json");
  const autoSwitchFile = path.join(dataDir, "suite-auto-switch.json");

  let cachedQuota = null;
  let cachedRemote = null;
  let lastRemoteCheckAt = 0;
  let updateInProgress = false;

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

  function loadAutoSwitchConfig() {
    const raw = readJsonSafe(autoSwitchFile, {});
    return {
      ...DEFAULT_AUTO_SWITCH_CFG,
      ...(raw && typeof raw === "object" ? raw : {}),
      thresholdPct: Math.max(1, Math.min(95, Number(raw?.thresholdPct ?? DEFAULT_AUTO_SWITCH_CFG.thresholdPct) || 10)),
      cooldownMinutes: Math.max(1, Math.min(180, Number(raw?.cooldownMinutes ?? DEFAULT_AUTO_SWITCH_CFG.cooldownMinutes) || 10))
    };
  }

  function saveAutoSwitchConfig(patch) {
    const cur = loadAutoSwitchConfig();
    const next = {
      ...cur,
      ...(typeof patch?.enabled === "boolean" ? { enabled: patch.enabled } : {}),
      ...(typeof patch?.poolKey === "string" && patch.poolKey.trim() ? { poolKey: patch.poolKey.trim() } : {}),
      ...(patch?.thresholdPct !== undefined ? { thresholdPct: Math.max(1, Math.min(95, Math.round(Number(patch.thresholdPct) || 10))) } : {}),
      ...(patch?.cooldownMinutes !== undefined ? { cooldownMinutes: Math.max(1, Math.min(180, Math.round(Number(patch.cooldownMinutes) || 10))) } : {}),
      ...(typeof patch?.reloadWindow === "boolean" ? { reloadWindow: patch.reloadWindow } : {})
    };
    writeJsonSafe(autoSwitchFile, next);
    return next;
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

  function extractMonitoredWeeklyPct(quotaPayload, poolKey) {
    const groups = Array.isArray(quotaPayload?.groups) ? quotaPayload.groups : [];
    const weeklyEntries = [];
    for (const g of groups) {
      const wPct = typeof g.weeklyPct === "number" ? g.weeklyPct : (typeof g.pct === "number" ? g.pct : null);
      if (wPct === null) continue;
      weeklyEntries.push({
        bucketId: g.weeklyBucketId || g.key || "",
        key: g.key || "",
        label: g.label || g.key || "",
        pct: wPct
      });
    }
    if (weeklyEntries.length === 0) return null;
    if (poolKey === "any-weekly") {
      weeklyEntries.sort((a, b) => a.pct - b.pct);
      return weeklyEntries[0];
    }
    const exact = weeklyEntries.find((e) => e.bucketId === poolKey || e.key === poolKey);
    if (exact) return exact;
    if (poolKey === "gemini-weekly") return weeklyEntries.find((e) => /gemini/i.test(e.bucketId) && !/argon/i.test(e.bucketId)) || weeklyEntries[0];
    if (poolKey === "3p-weekly") return weeklyEntries.find((e) => /3p|claude|gpt/i.test(e.bucketId) || /claude|gpt/i.test(e.label)) || null;
    if (poolKey === "gemini-argon-wtu-weekly") return weeklyEntries.find((e) => /argon/i.test(e.bucketId) || /argon/i.test(e.label)) || null;
    return null;
  }

  function evaluateAutoSwitch(quotaPayload) {
    const cfg = loadAutoSwitchConfig();
    const curEmail = String(quotaPayload?.email || "").trim();

    // 记录当前账号各模型池的周额度快照，方便切号时优先挑余额高的账号
    if (curEmail && Array.isArray(quotaPayload?.groups)) {
      const snap = { ...(cfg.accountQuotaSnapshots || {}) };
      const emailSnap = { updatedAt: Date.now() };
      for (const g of quotaPayload.groups) {
        const k = g.weeklyBucketId || g.key;
        if (k && typeof g.weeklyPct === "number") emailSnap[k] = g.weeklyPct;
      }
      snap[curEmail] = emailSnap;
      cfg.accountQuotaSnapshots = snap;
      writeJsonSafe(autoSwitchFile, cfg);
    }

    if (!cfg.enabled || !accountVault || typeof accountVault.switchAccount !== "function") {
      return { triggered: false };
    }

    const monitored = extractMonitoredWeeklyPct(quotaPayload, cfg.poolKey);
    if (!monitored || monitored.pct > cfg.thresholdPct) {
      return { triggered: false, monitored };
    }

    const now = Date.now();
    const cooldownMs = cfg.cooldownMinutes * 60 * 1000;
    if (cfg.lastSwitchAt && now - cfg.lastSwitchAt < cooldownMs) {
      return { triggered: false, reason: "cooldown", monitored };
    }

    const vault = getVaultSnapshot();
    const activeEmail = curEmail || vault.currentEmail;
    const candidates = (vault.accounts || []).filter((a) => a && a.email && a.email.toLowerCase() !== String(activeEmail || "").toLowerCase());
    if (candidates.length === 0) {
      return { triggered: false, reason: "no_candidate_accounts", monitored };
    }

    // 优先挑选已知周额度最高的候选账号（若未知则优先尝试）
    const snaps = cfg.accountQuotaSnapshots || {};
    candidates.sort((a, b) => {
      const sa = snaps[a.email]?.[monitored.bucketId];
      const sb = snaps[b.email]?.[monitored.bucketId];
      const va = typeof sa === "number" ? sa : 101;
      const vb = typeof sb === "number" ? sb : 101;
      return vb - va;
    });

    const target = candidates[0];
    // 若候选账号在近 30 分钟内也已知 <= 阈值，则避免死循环来回切换
    const targetSnap = snaps[target.email];
    if (targetSnap && now - (targetSnap.updatedAt || 0) < 30 * 60 * 1000) {
      const targetPct = targetSnap[monitored.bucketId];
      if (typeof targetPct === "number" && targetPct <= cfg.thresholdPct) {
        return { triggered: false, reason: "all_candidates_below_threshold", monitored };
      }
    }

    try {
      // 切换前先自动保存当前账号最新凭据
      if (typeof accountVault.saveCurrentAccount === "function") {
        try { accountVault.saveCurrentAccount(); } catch {}
      }
      const switched = accountVault.switchAccount(target.email);
      if (typeof recordAccountSwitch === "function") {
        try { recordAccountSwitch(switched.email || target.email); } catch {}
      }
      const reason = `${monitored.label} 每周剩余 ${monitored.pct}% ≤ ${cfg.thresholdPct}%`;
      writeJsonSafe(autoSwitchFile, {
        ...cfg,
        lastSwitchAt: now,
        lastSwitchFrom: activeEmail,
        lastSwitchTo: switched.email || target.email,
        lastTriggerReason: reason
      });

      if (cfg.reloadWindow && typeof reloadHostWindow === "function") {
        setTimeout(() => {
          Promise.resolve(reloadHostWindow()).catch(() => {});
        }, 1200);
      }

      return {
        triggered: true,
        fromEmail: activeEmail,
        toEmail: switched.email || target.email,
        reason,
        monitored
      };
    } catch (err) {
      return { triggered: false, error: err instanceof Error ? err.message : String(err), monitored };
    }
  }

  function getLocalVersionInfo() {
    const fallback = { version: "1.2.1", publishedAt: "", repoUrl: REPO_URL, highlights: [] };
    const fromData = readJsonSafe(versionFile, null);
    if (fromData && fromData.version) return { ...fallback, ...fromData };
    const fromSeed = readJsonSafe(path.join(pluginRoot, "sidecars", "dashboard", "user", "suite-version.json"), null);
    if (fromSeed && fromSeed.version) return { ...fallback, ...fromSeed };
    return fallback;
  }

  async function checkSuiteUpdate({ force = false } = {}) {
    const local = getLocalVersionInfo();
    const state = readJsonSafe(updateStateFile, { dismissedVersion: "", lastCheckedAt: 0, lastRemote: null });
    const now = Date.now();

    if (!force && cachedRemote && now - lastRemoteCheckAt < UPDATE_CACHE_TTL_MS) {
      // memory cache hit
    } else if (!force && state.lastRemote && now - (state.lastCheckedAt || 0) < UPDATE_CACHE_TTL_MS) {
      cachedRemote = state.lastRemote;
      lastRemoteCheckAt = state.lastCheckedAt;
    } else {
      const fetched = await fetchRemoteVersionJson();
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
    const tmpDir = path.join(os.tmpdir(), `ag-ui-sync-${Date.now()}`);
    const proxyEnv = detectSystemProxyEnv();
    const gitEnv = { ...process.env };
    if (proxyEnv.HTTPS_PROXY) gitEnv.HTTPS_PROXY = proxyEnv.HTTPS_PROXY;
    if (proxyEnv.HTTP_PROXY) gitEnv.HTTP_PROXY = proxyEnv.HTTP_PROXY;
    if (proxyEnv.ALL_PROXY) gitEnv.ALL_PROXY = proxyEnv.ALL_PROXY;

    try {
      await new Promise((resolve, reject) => {
        execFile("git", ["clone", "--depth", "1", REPO_GIT_URL, tmpDir], { env: gitEnv, timeout: 45000, windowsHide: true }, (err, stdout, stderr) => {
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

  function updateQuotaCache(payload) {
    if (!payload || typeof payload !== "object") return { ok: false, error: "Invalid quota payload" };
    cachedQuota = {
      ...payload,
      updatedAt: Date.now()
    };
    const autoSwitch = evaluateAutoSwitch(cachedQuota);
    return { ok: true, updatedAt: cachedQuota.updatedAt, autoSwitch };
  }

  function getQuotaCache() {
    return {
      ok: true,
      data: cachedQuota
    };
  }

  function getAutoSwitchState() {
    const cfg = loadAutoSwitchConfig();
    const vault = getVaultSnapshot();
    return {
      ok: true,
      config: cfg,
      vaultCount: vault.accounts.length,
      currentEmail: vault.currentEmail || cachedQuota?.email || "",
      accounts: vault.accounts.map((a) => ({
        email: a.email,
        isCurrent: Boolean(a.isCurrent || a.active || (vault.currentEmail && a.email === vault.currentEmail)),
        lastWeekly: cfg.accountQuotaSnapshots?.[a.email] || null
      }))
    };
  }

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
        result = getQuotaCache();
      } else if (urlObj.pathname === "/api/suite-quota" && req.method === "POST") {
        result = updateQuotaCache(bodyObj);
      } else if (urlObj.pathname === "/api/suite-auto-switch" && req.method === "GET") {
        result = getAutoSwitchState();
      } else if (urlObj.pathname === "/api/suite-auto-switch" && req.method === "POST") {
        saveAutoSwitchConfig(bodyObj);
        result = getAutoSwitchState();
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

    Oe.api("/api/suite-quota", () => getQuotaCache(), "GET");
    Oe.api("/api/suite-quota", (e) => updateQuotaCache(parseBody(e)), "POST");

    Oe.api("/api/suite-auto-switch", () => getAutoSwitchState(), "GET");
    Oe.api("/api/suite-auto-switch", (e) => {
      saveAutoSwitchConfig(parseBody(e));
      return getAutoSwitchState();
    }, "POST");

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
