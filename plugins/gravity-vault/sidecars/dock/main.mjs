import { existsSync, readFileSync, statSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname, extname, join, basename, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { createVaultStore } from "./store.mjs";
import { scanVaultState } from "./scanner.mjs";

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const readLocal = (n) => readFileSync(join(HERE, n), "utf8");
const APP_DATA_DIR = process.env.ANTIGRAVITY_APP_DATA_DIR || join(homedir(), ".gemini", "antigravity");
const BOOT_LOG_FILE = join(APP_DATA_DIR, "sidecar_data", "gravity-suite-boot.log");

function appendBootLog(msg) {
  try {
    mkdirSync(dirname(BOOT_LOG_FILE), { recursive: true });
    const line = `${new Date().toISOString()} [gravity-vault] pid=${process.pid} node=${process.version} exec=${process.execPath} ${String(msg).replace(/\r?\n/g, " | ")}\n`;
    appendFileSync(BOOT_LOG_FILE, line, "utf8");
  } catch {}
}

process.on("uncaughtException", (err) => {
  appendBootLog(`uncaughtException: ${err?.stack || err?.message || err}`);
  console.error("[gravity-vault] uncaughtException:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  appendBootLog(`unhandledRejection: ${reason?.stack || reason?.message || reason}`);
  console.error("[gravity-vault] unhandledRejection:", reason);
});

async function loadSidecarSdk() {
  try {
    return await import("sidecar_sdk");
  } catch (primaryErr) {
    const fallback = join(APP_DATA_DIR, "lib", "node_modules", "sidecar_sdk", "index.mjs");
    if (existsSync(fallback)) {
      appendBootLog(`sidecar_sdk ESM resolver fallback -> ${fallback}`);
      return await import(pathToFileURL(fallback).href);
    }
    appendBootLog(`sidecar_sdk load failed: ${primaryErr?.message || primaryErr}`);
    throw primaryErr;
  }
}

appendBootLog(`boot port=${process.env.ANTIGRAVITY_SIDECAR_WEB_PORT || ""} ls=${process.env.ANTIGRAVITY_LS_ADDRESS || ""}`);
const { SidecarApp, Response } = await loadSidecarSdk();

function noCache(content, contentType) {
  return new Response(content, {
    contentType,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache" }
  });
}

const IMAGE_MIMES = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml"
};

const store = createVaultStore();
const app = new SidecarApp();

app.page("/", () => noCache(readLocal("index.html"), "text/html; charset=utf-8"));
app.page("/app.js", () => noCache(readLocal("app.js"), "application/javascript; charset=utf-8"));
app.api("/styles.css", () => noCache(readLocal("styles.css"), "text/css; charset=utf-8"), "GET");

app.api("/api/state", (data) => {
  return scanVaultState({
    store,
    conversationId: String(data?.conversationId || ""),
    workspaceUris: Array.isArray(data?.workspaceUris) ? data.workspaceUris : [],
    scope: ["session", "project", "all"].includes(data?.scope) ? data.scope : "session"
  });
});

app.api("/api/pin", (data) => store.togglePin({
  path: data?.path,
  name: data?.name,
  convId: data?.conversationId || ""
}));

app.api("/api/archive", (data) => store.archiveFile(data?.path));

app.api("/api/forget", (data) => store.addTombstone(data?.path));

app.api("/api/settings", () => ({ ok: true, config: store.loadConfig() }), "GET");
app.api("/api/settings", (data) => ({ ok: true, config: store.saveConfig(data) }), "POST");

app.api("/api/preview", (data) => {
  const target = data?.path ? resolve(String(data.path)) : "";
  if (!target || !existsSync(target)) return { ok: false, error: "文件不存在" };
  const st = statSync(target);
  if (st.isDirectory()) return { ok: false, error: "不支持预览目录" };
  const ext = extname(target).toLowerCase();
  const base = { ok: true, name: basename(target), path: target, uri: pathToFileURL(target).href, ext, size: st.size };

  if (IMAGE_MIMES[ext]) {
    if (st.size > 8 * 1024 * 1024) return { ...base, kind: "binary", reason: "图片大于 8MB，请用系统应用打开" };
    const b64 = readFileSync(target).toString("base64");
    return { ...base, kind: "image", dataUrl: `data:${IMAGE_MIMES[ext]};base64,${b64}` };
  }

  const raw = readFileSync(target);
  const checkLen = Math.min(raw.length, 4096);
  for (let i = 0; i < checkLen; i++) {
    if (raw[i] === 0) return { ...base, kind: "binary", reason: "二进制文档（PDF / Office 等），请用系统应用打开" };
  }
  const truncated = raw.length > 512 * 1024;
  const content = (truncated ? raw.subarray(0, 512 * 1024) : raw).toString("utf8");
  const kind = ext === ".md" || ext === ".markdown" ? "markdown" : "text";
  return { ...base, kind, content, truncated };
});

app.api("/api/reveal", async (data) => {
  const target = data?.path ? resolve(String(data.path)) : "";
  if (!target || !existsSync(target)) return { ok: false, error: "路径不存在" };
  try {
    if (process.platform === "darwin") await execFileAsync("open", ["-R", target]);
    else if (process.platform === "win32") await execFileAsync("explorer.exe", [`/select,${target}`]);
    else await execFileAsync("xdg-open", [dirname(target)]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

app.api("/api/open-os", async (data) => {
  const target = data?.path ? resolve(String(data.path)) : "";
  if (!target || !existsSync(target)) return { ok: false, error: "文件不存在" };
  try {
    if (process.platform === "darwin") await execFileAsync("open", [target]);
    else if (process.platform === "win32") await execFileAsync("cmd.exe", ["/c", "start", "", target], { windowsHide: true });
    else await execFileAsync("xdg-open", [target]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

app.api("/api/clipboard", (data) => {
  const text = String(data?.text || "");
  try {
    if (process.platform === "darwin") {
      const p = spawn("pbcopy", [], { stdio: ["pipe", "ignore", "ignore"] });
      p.stdin.end(text, "utf8");
      return { ok: true };
    }
    if (process.platform === "win32") {
      const p = spawn("powershell.exe", ["-NoProfile", "-Command", "Set-Clipboard -Value ([Console]::In.ReadToEnd())"], { stdio: ["pipe", "ignore", "ignore"], windowsHide: true });
      p.stdin.end(text, "utf8");
      return { ok: true };
    }
  } catch {}
  return { ok: false };
});

const server = await app.run();
const addr = typeof server?.address === "function" ? server.address() : null;
appendBootLog(`listening on 127.0.0.1:${addr?.port || process.env.ANTIGRAVITY_SIDECAR_WEB_PORT || ""}`);
