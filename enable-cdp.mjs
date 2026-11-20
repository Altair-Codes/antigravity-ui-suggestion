#!/usr/bin/env node
/**
 * Cross-platform (Windows / macOS / Linux) CDP Auto-Enabler for Antigravity app.asar.
 * - Locates app.asar (including non-C: drive installs via running Antigravity.exe on Windows)
 * - Idempotently injects `--remote-debugging-port=0` into `dist/main.js`
 * - If Windows locks `app.asar` because Antigravity.exe is currently running, writes
 *   `app.asar.cdp_pending` and spawns a detached hidden PowerShell watcher that
 *   immediately replaces `app.asar` and auto-relaunches Antigravity the moment the user closes it.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cp from "node:child_process";

function findAsarAndExe() {
  const candidates = [];
  let runningExe = "";
  const home = os.homedir();

  if (process.platform === "win32") {
    try {
      runningExe = cp.execFileSync(
        "powershell.exe",
        ["-NoProfile", "-Command", "(Get-Process -Name Antigravity -ErrorAction SilentlyContinue | Select-Object -First 1).Path"],
        { encoding: "utf8", timeout: 3000, windowsHide: true }
      ).trim();
      if (runningExe) {
        candidates.push(path.join(path.dirname(runningExe), "resources", "app.asar"));
      }
    } catch {}
    const localApp = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    const prog = process.env.ProgramFiles || "C:\\Program Files";
    const prog86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    candidates.push(
      path.join(localApp, "Programs", "Antigravity", "resources", "app.asar"),
      path.join(localApp, "Programs", "antigravity", "resources", "app.asar"),
      path.join(localApp, "Programs", "Google Antigravity", "resources", "app.asar"),
      path.join(prog, "Antigravity", "resources", "app.asar"),
      path.join(prog, "Google Antigravity", "resources", "app.asar"),
      path.join(prog86, "Antigravity", "resources", "app.asar")
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Antigravity.app/Contents/Resources/app.asar",
      path.join(home, "Applications", "Antigravity.app", "Contents", "Resources", "app.asar")
    );
  } else {
    candidates.push(
      "/opt/Antigravity/resources/app.asar",
      "/opt/antigravity/resources/app.asar",
      "/usr/share/antigravity/resources/app.asar",
      "/usr/lib/antigravity/resources/app.asar"
    );
  }

  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c) && fs.statSync(c).isFile()) {
        if (!runningExe && process.platform === "win32") {
          const maybeExe = path.join(path.dirname(path.dirname(c)), "Antigravity.exe");
          if (fs.existsSync(maybeExe)) runningExe = maybeExe;
        }
        return { asarPath: c, exePath: runningExe };
      }
    } catch {}
  }
  return { asarPath: null, exePath: runningExe };
}

function patchAsarForCdp() {
  const { asarPath, exePath } = findAsarAndExe();
  if (!asarPath) {
    console.log("  • [CDP] 未在默认路径检测到 app.asar，将由 Aura Sidecar 启动时自动探测。");
    return;
  }

  const buf = fs.readFileSync(asarPath);
  if (buf.length < 16) return;
  const headerSize = buf.readUInt32LE(4);
  const jsonLen = buf.readUInt32LE(12);
  const headerObj = JSON.parse(buf.slice(16, 16 + jsonLen).toString("utf8"));
  const baseOffset = 8 + headerSize;
  const filesMap = new Map();

  function walkCollect(node, rel) {
    if (node.files) {
      for (const [k, v] of Object.entries(node.files)) {
        walkCollect(v, rel ? `${rel}/${k}` : k);
      }
    } else if (node.offset !== undefined && node.size !== undefined && !node.unpacked) {
      const off = parseInt(node.offset, 10);
      filesMap.set(rel, buf.slice(baseOffset + off, baseOffset + off + node.size));
    }
  }
  walkCollect(headerObj, "");

  const mainKey = "dist/main.js";
  const mainBuf = filesMap.get(mainKey);
  if (!mainBuf) return;

  let mainSrc = mainBuf.toString("utf8");
  if (mainSrc.includes("appendSwitch('remote-debugging-port'")) {
    console.log(`  • [CDP] app.asar 已开启调试端口 (${asarPath})`);
    return;
  }

  const anchor = "electron_1.app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');";
  if (!mainSrc.includes(anchor)) {
    console.log("  • [CDP] 未找到启动锚点，跳过预注入。");
    return;
  }

  const injection = `if (!electron_1.app.commandLine.hasSwitch('remote-debugging-port')) {\n    electron_1.app.commandLine.appendSwitch('remote-debugging-port', '0');\n}\n`;
  mainSrc = mainSrc.replace(anchor, `${injection}${anchor}`);
  filesMap.set(mainKey, Buffer.from(mainSrc, "utf8"));

  let newOffset = 0;
  function walkRebuild(node, rel) {
    if (node.files) {
      const out = {};
      for (const [k, v] of Object.entries(node.files)) {
        out[k] = walkRebuild(v, rel ? `${rel}/${k}` : k);
      }
      return { ...node, files: out };
    } else if (node.unpacked) {
      return { ...node };
    } else {
      const fBuf = filesMap.get(rel);
      if (!fBuf) return { ...node };
      const sz = fBuf.length;
      const entry = { ...node, size: sz, offset: newOffset.toString() };
      newOffset += sz;
      return entry;
    }
  }

  const newHeaderObj = walkRebuild(headerObj, "");
  const newHeaderBytes = Buffer.from(JSON.stringify(newHeaderObj), "utf8");
  const pad = (4 - (newHeaderBytes.length % 4)) % 4;
  const alignedHeaderLen = newHeaderBytes.length + pad;
  const outBuf = Buffer.alloc(16 + alignedHeaderLen + newOffset);

  outBuf.writeUInt32LE(4, 0);
  outBuf.writeUInt32LE(alignedHeaderLen + 8, 4);
  outBuf.writeUInt32LE(alignedHeaderLen + 4, 8);
  outBuf.writeUInt32LE(newHeaderBytes.length, 12);
  newHeaderBytes.copy(outBuf, 16);
  outBuf.fill(0, 16 + newHeaderBytes.length, 16 + alignedHeaderLen);

  let writePos = 16 + alignedHeaderLen;
  for (const [, fBuf] of filesMap.entries()) {
    fBuf.copy(outBuf, writePos);
    writePos += fBuf.length;
  }

  const bakPath = `${asarPath}.bak`;
  if (!fs.existsSync(bakPath)) {
    try { fs.copyFileSync(asarPath, bakPath); } catch {}
  }

  const pendingPath = `${asarPath}.cdp_pending`;
  fs.writeFileSync(pendingPath, outBuf);

  try {
    fs.renameSync(pendingPath, asarPath);
    console.log(`  • [CDP] 已成功为 app.asar 开启调试端口 (${asarPath})`);
  } catch (err) {
    if (process.platform === "win32") {
      const escPending = pendingPath.replace(/'/g, "''");
      const escTarget = asarPath.replace(/'/g, "''");
      const escExe = (exePath || "").replace(/'/g, "''");
      const relaunchCmd = escExe ? `; Start-Process -FilePath '${escExe}'` : "";
      const psScript = `Wait-Process -Name Antigravity -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 600; Move-Item -LiteralPath '${escPending}' -Destination '${escTarget}' -Force${relaunchCmd}`;
      cp.spawn("powershell.exe", ["-NoProfile", "-WindowStyle", "Hidden", "-Command", psScript], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }).unref();
      console.log("  • [CDP] 检测到 Antigravity.exe 正在运行锁住 app.asar，已启动后台守护：您关闭 Antigravity 的瞬间将自动完成补丁替换并为您重新打开客户端！");
    } else {
      throw err;
    }
  }
}

patchAsarForCdp();
