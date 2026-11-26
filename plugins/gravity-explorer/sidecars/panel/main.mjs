import { existsSync, statSync, readFileSync, createReadStream, renameSync } from "node:fs";
import { dirname, join, resolve, basename, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { SidecarApp, Response } from "sidecar_sdk";
import {
  IMAGE_MIMES,
  MEDIA_MIMES,
  resolveWorkspaceRoot,
  safeResolveInRoot,
  listDirectory,
  searchTree,
  readPreviewPayload
} from "./explorer-core.mjs";

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const readLocal = (name) => readFileSync(join(HERE, name), "utf8");

let activeWorkspaceRoot = null;

function noCache(content, contentType) {
  return new Response(content, {
    contentType,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache"
    }
  });
}

function getDevToolsPort() {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const candidates = process.platform === "darwin"
    ? [join(home, "Library/Application Support/Antigravity/DevToolsActivePort")]
    : process.platform === "win32"
    ? [join(process.env.APPDATA || join(home, "AppData/Roaming"), "Antigravity/DevToolsActivePort")]
    : [join(home, ".config/Antigravity/DevToolsActivePort")];
  for (const p of candidates) {
    if (existsSync(p)) {
      const port = parseInt(readFileSync(p, "utf8").split(/\r?\n/)[0].trim(), 10);
      if (Number.isFinite(port) && port > 0) return port;
    }
  }
  return null;
}

const DRAG_BRIDGE_SCRIPT = `(() => {
  if (window.__gvExplorerDragInstalled === '2.1') return { status: 'ready' };
  if (window.__gvExplorerDragCleanup) { try { window.__gvExplorerDragCleanup(); } catch {} }
  let activeDrag = null;

  function makeDT(uris, plainPaths) {
    const dt = new DataTransfer();
    const uriJson = JSON.stringify(uris || []);
    const uriList = (uris || []).join('\\r\\n');
    try { dt.setData('ResourceURLs', uriJson); } catch {}
    try { dt.setData('resourceurls', uriJson); } catch {}
    try { dt.setData('application/vnd.code.uri-list', uriList); } catch {}
    try { dt.setData('text/uri-list', uriList); } catch {}
    try { dt.setData('text/plain', (plainPaths?.length ? plainPaths : uris || []).join('\\n')); } catch {}
    return dt;
  }

  function finishDrag(commit, x, y, shiftKey) {
    if (!activeDrag) return;
    const st = activeDrag;
    activeDrag = null;
    for (const f of st.iframes) f.style.pointerEvents = st.prevPE.get(f) || '';
    st.badge?.remove();
    document.body.style.cursor = '';
    const dt = makeDT(st.uris, st.plainPaths);
    const inSrc = st.src && (() => {
      const r = st.src.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    })();
    if (commit && !inSrc) {
      const target = document.elementFromPoint(x, y) || window;
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: x, clientY: y, shiftKey: Boolean(shiftKey), dataTransfer: dt }));
    } else {
      window.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true, relatedTarget: null, dataTransfer: dt }));
    }
  }

  function moveDrag(x, y, shiftKey) {
    if (!activeDrag) return;
    if (activeDrag.badge) {
      activeDrag.badge.style.display = 'flex';
      activeDrag.badge.style.left = (x + 14) + 'px';
      activeDrag.badge.style.top = (y + 14) + 'px';
    }
    const dt = makeDT(activeDrag.uris, activeDrag.plainPaths);
    const target = document.elementFromPoint(x, y) || window;
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: x, clientY: y, shiftKey: Boolean(shiftKey), dataTransfer: dt }));
  }

  function onMsg(e) {
    const d = e.data;
    if (!d || typeof d.type !== 'string') return;
    if (d.type === 'GV_DRAG_START') {
      if (activeDrag) finishDrag(false, 0, 0, false);
      const iframes = Array.from(document.querySelectorAll('iframe'));
      const src = iframes.find(f => f.contentWindow === e.source) || iframes.find(f => (f.src || '').includes('gravity-explorer')) || null;
      const prevPE = new Map();
      for (const f of iframes) { prevPE.set(f, f.style.pointerEvents || ''); f.style.pointerEvents = 'none'; }
      const badge = document.createElement('div');
      badge.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;display:none;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;background:rgba(20,22,28,0.96);color:#e8eaed;border:1px solid rgba(138,180,248,0.65);box-shadow:0 8px 22px rgba(0,0,0,0.48);font:500 12px/1.3 -apple-system,sans-serif;white-space:nowrap';
      badge.textContent = d.label || '引用文件';
      document.body.appendChild(badge);
      document.body.style.cursor = 'copy';
      activeDrag = { uris: d.uris || [], plainPaths: d.plainPaths || [], iframes, src, prevPE, badge };
    } else if (d.type === 'GV_DRAG_MOVE' && activeDrag) {
      const r = activeDrag.src ? activeDrag.src.getBoundingClientRect() : { left: 0, top: 0 };
      moveDrag(r.left + (d.clientX || 0), r.top + (d.clientY || 0), d.shiftKey);
    } else if (d.type === 'GV_DRAG_END' && activeDrag) {
      const r = activeDrag.src ? activeDrag.src.getBoundingClientRect() : { left: 0, top: 0 };
      finishDrag(true, r.left + (d.clientX || 0), r.top + (d.clientY || 0), d.shiftKey);
    }
  }
  const onMove = (e) => { if (activeDrag) { if ((e.buttons & 1) === 0) finishDrag(true, e.clientX, e.clientY, e.shiftKey); else moveDrag(e.clientX, e.clientY, e.shiftKey); } };
  const onUp = (e) => { if (activeDrag) finishDrag(true, e.clientX, e.clientY, e.shiftKey); };
  const onKey = (e) => { if (activeDrag && e.key === 'Escape') finishDrag(false, 0, 0, false); };

  window.addEventListener('message', onMsg);
  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('mouseup', onUp, true);
  window.addEventListener('keydown', onKey, true);
  window.__gvExplorerDragCleanup = () => {
    window.removeEventListener('message', onMsg);
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('mouseup', onUp, true);
    window.removeEventListener('keydown', onKey, true);
  };
  window.__gvExplorerDragInstalled = '2.1';
  return { status: 'installed' };
})()`;

async function evalOnMainPages(expression) {
  const port = getDevToolsPort();
  if (!port) return { ok: false, error: "CDP unavailable" };
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1800) });
    const list = await res.json();
    const pages = list.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
    if (pages.length === 0) return { ok: false, error: "No page target" };
    const outcomes = [];
    for (const pg of pages) {
      const val = await new Promise((resolve) => {
        const ws = new WebSocket(pg.webSocketDebuggerUrl);
        const t = setTimeout(() => { try { ws.close(); } catch {} resolve({ error: "timeout" }); }, 2200);
        ws.onopen = () => {
          ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
        };
        ws.onmessage = (ev) => {
          clearTimeout(t);
          try {
            const parsed = JSON.parse(ev.data);
            resolve(parsed.result?.result?.value || { ok: true });
          } catch (e) {
            resolve({ error: e.message });
          } finally {
            try { ws.close(); } catch {}
          }
        };
        ws.onerror = () => { clearTimeout(t); resolve({ error: "ws_error" }); };
      });
      outcomes.push(val);
    }
    return { ok: true, outcomes };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

async function openNativeTabCdp(fullPath) {
  const fileUri = pathToFileURL(fullPath).href;
  const expr = `(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const el = all.find(e => Object.keys(e).some(k => k.startsWith('__reactFiber$')));
    let openUri = null;
    if (el) {
      const k = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
      let root = el[k];
      while (root && root.return) root = root.return;
      const seen = new Set();
      function walk(node) {
        if (!node || openUri || seen.has(node)) return;
        seen.add(node);
        if (node.memoizedProps && typeof node.memoizedProps.openUri === 'function') {
          openUri = node.memoizedProps.openUri;
          return;
        }
        let c = node.child;
        while (c) { walk(c); c = c.sibling; }
      }
      walk(root);
    }
    const target = ${JSON.stringify(fileUri)};
    if (openUri) { openUri(target); return { ok: true, method: 'openUri' }; }
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'file__' + encodeURIComponent(target));
    window.history.pushState({}, '', url.toString());
    window.dispatchEvent(new PopStateEvent('popstate'));
    return { ok: true, method: 'pushState' };
  })()`;
  return await evalOnMainPages(expr);
}

function handleRawMedia(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end();
    return;
  }
  const root = resolveWorkspaceRoot({
    root: url.searchParams.get("root"),
    workspaceUri: url.searchParams.get("workspaceUri")
  }, activeWorkspaceRoot);
  const fullPath = safeResolveInRoot(root, url.searchParams.get("path"));
  if (!fullPath || !existsSync(fullPath)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const st = statSync(fullPath);
  if (st.isDirectory()) {
    res.writeHead(400);
    res.end();
    return;
  }
  const ext = extname(fullPath).toLowerCase();
  const mime = MEDIA_MIMES[ext] || IMAGE_MIMES[ext] || "application/octet-stream";
  const range = req.headers.range;
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : st.size - 1;
      if (start >= st.size || end < start) {
        res.writeHead(416, { "Content-Range": `bytes */${st.size}` });
        res.end();
        return;
      }
      end = Math.min(end, st.size - 1);
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${st.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Content-Type": mime
      });
      if (req.method === "HEAD") { res.end(); return; }
      createReadStream(fullPath, { start, end }).pipe(res);
      return;
    }
  }
  res.writeHead(200, { "Accept-Ranges": "bytes", "Content-Length": st.size, "Content-Type": mime });
  if (req.method === "HEAD") { res.end(); return; }
  createReadStream(fullPath).pipe(res);
}

const app = new SidecarApp();
app.page("/", () => noCache(readLocal("index.html"), "text/html; charset=utf-8"));
app.page("/app.js", () => noCache(readLocal("app.js"), "application/javascript; charset=utf-8"));
app.page("/preview.js", () => noCache(readLocal("preview.js"), "application/javascript; charset=utf-8"));
app.api("/styles.css", () => noCache(readLocal("styles.css"), "text/css; charset=utf-8"), "GET");

app.api("/api/workspace", (data) => {
  const root = resolveWorkspaceRoot(data, activeWorkspaceRoot);
  activeWorkspaceRoot = root;
  evalOnMainPages(DRAG_BRIDGE_SCRIPT).catch(() => {});
  return { root, name: basename(root) || root };
});

app.api("/api/tree", (data) => {
  const root = resolveWorkspaceRoot(data, activeWorkspaceRoot);
  activeWorkspaceRoot = root;
  return listDirectory({ root, dir: data?.dir || "", showHidden: Boolean(data?.showHidden) });
});

app.api("/api/search", (data) => {
  const root = resolveWorkspaceRoot(data, activeWorkspaceRoot);
  activeWorkspaceRoot = root;
  return searchTree({ root, query: data?.query || "", showHidden: Boolean(data?.showHidden) });
});

app.api("/api/preview", (data) => {
  const root = resolveWorkspaceRoot(data, activeWorkspaceRoot);
  activeWorkspaceRoot = root;
  return readPreviewPayload({ root, path: data?.path, fullPath: data?.fullPath });
});

app.api("/api/open-native-tab", async (data) => {
  const root = resolveWorkspaceRoot(data, activeWorkspaceRoot);
  const fullPath = data?.fullPath || safeResolveInRoot(root, data?.path);
  if (!fullPath || !existsSync(fullPath)) return { ok: false, error: "文件不存在" };
  return await openNativeTabCdp(fullPath);
});

app.api("/api/reveal", async (data) => {
  const root = resolveWorkspaceRoot(data, activeWorkspaceRoot);
  const target = data?.fullPath || safeResolveInRoot(root, data?.path) || root;
  if (!existsSync(target)) return { ok: false, error: `路径不存在: ${target}` };
  try {
    if (process.platform === "darwin") await execFileAsync("open", ["-R", target]);
    else if (process.platform === "win32") await execFileAsync("explorer.exe", [`/select,${target}`]);
    else await execFileAsync("xdg-open", [dirname(target)]);
    return { ok: true, path: target };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

app.api("/api/open-os", async (data) => {
  const root = resolveWorkspaceRoot(data, activeWorkspaceRoot);
  const target = data?.fullPath || safeResolveInRoot(root, data?.path);
  if (!target || !existsSync(target)) return { ok: false, error: "文件不存在" };
  try {
    if (process.platform === "darwin") await execFileAsync("open", [target]);
    else if (process.platform === "win32") await execFileAsync("cmd.exe", ["/c", "start", "", target], { windowsHide: true });
    else await execFileAsync("xdg-open", [target]);
    return { ok: true, path: target };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

app.api("/api/trash", async (data) => {
  const root = resolveWorkspaceRoot(data, activeWorkspaceRoot);
  const target = safeResolveInRoot(root, data?.path || data?.fullPath);
  if (!target || target === root || !existsSync(target)) {
    return { ok: false, error: "无效或不可删除的路径" };
  }
  try {
    if (process.platform === "darwin") {
      const trash = join(process.env.HOME || "", ".Trash");
      let dest = join(trash, basename(target));
      if (existsSync(dest)) dest = join(trash, `${basename(target)}_${Date.now()}`);
      renameSync(target, dest);
    } else if (process.platform === "win32") {
      const escaped = target.replace(/'/g, "''");
      const ps = `Add-Type -AssemblyName Microsoft.VisualBasic; if (Test-Path -LiteralPath '${escaped}' -PathType Container) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory('${escaped}', 'OnlyErrorDialogs', 'SendToRecycleBin') } else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('${escaped}', 'OnlyErrorDialogs', 'SendToRecycleBin') }`;
      await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], { windowsHide: true });
    } else {
      return { ok: false, error: "当前平台不支持废纸篓API" };
    }
    return { ok: true, path: target };
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

app.api("/api/drag-bridge", async () => await evalOnMainPages(DRAG_BRIDGE_SCRIPT));

setTimeout(() => { evalOnMainPages(DRAG_BRIDGE_SCRIPT).catch(() => {}); }, 800);

const server = await app.run();
const prevListeners = server.listeners("request").slice();
server.removeAllListeners("request");
server.on("request", (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (url.pathname === "/api/raw-media") {
    handleRawMedia(req, res, url);
    return;
  }
  for (const fn of prevListeners) fn.call(server, req, res);
});
