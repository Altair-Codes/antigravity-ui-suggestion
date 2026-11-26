import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import os from "node:os";

let DatabaseSync = null;
try {
  const sqliteMod = await import("node:sqlite").catch(() => null);
  if (sqliteMod && typeof sqliteMod.DatabaseSync === "function") {
    DatabaseSync = sqliteMod.DatabaseSync;
  }
} catch {
  DatabaseSync = null;
}

const DOC_EXTS = new Set([".md", ".markdown", ".txt", ".pdf", ".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls", ".csv", ".tsv", ".rtf", ".pages", ".numbers", ".key"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp"]);
const MEDIA_EXTS = new Set([".mp3", ".wav", ".m4a", ".ogg", ".flac", ".mp4", ".mov", ".webm"]);
const ARCHIVE_EXTS = new Set([".zip", ".tar", ".gz", ".tgz", ".7z", ".rar"]);
const CODE_EXTS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".go", ".rs", ".java", ".c", ".cpp", ".h", ".sh", ".css", ".html", ".json", ".yaml", ".yml", ".toml", ".xml", ".sql"]);

export function classifyFile(filePath, isDir = false) {
  if (isDir) return { category: "文件夹", isReadableDoc: true, canSidecarOpen: false };
  const ext = extname(filePath).toLowerCase();
  if ([".md", ".markdown"].includes(ext)) return { category: "Markdown", isReadableDoc: true, canSidecarOpen: true };
  if (ext === ".txt") return { category: "文本", isReadableDoc: true, canSidecarOpen: true };
  if (ext === ".pdf") return { category: "PDF", isReadableDoc: true, canSidecarOpen: false };
  if ([".doc", ".docx", ".pages", ".rtf"].includes(ext)) return { category: "Word", isReadableDoc: true, canSidecarOpen: false };
  if ([".ppt", ".pptx", ".key"].includes(ext)) return { category: "PPT", isReadableDoc: true, canSidecarOpen: false };
  if ([".xls", ".xlsx", ".csv", ".tsv", ".numbers"].includes(ext)) return { category: "表格", isReadableDoc: true, canSidecarOpen: ext === ".csv" || ext === ".tsv" };
  if (IMAGE_EXTS.has(ext)) return { category: "图片", isReadableDoc: true, canSidecarOpen: true };
  if (MEDIA_EXTS.has(ext)) return { category: "音视频", isReadableDoc: true, canSidecarOpen: false };
  if (ARCHIVE_EXTS.has(ext)) return { category: "压缩包", isReadableDoc: false, canSidecarOpen: false };
  if (CODE_EXTS.has(ext)) return { category: "代码", isReadableDoc: false, canSidecarOpen: true };
  return { category: ext ? ext.slice(1).toUpperCase() : "其他", isReadableDoc: DOC_EXTS.has(ext), canSidecarOpen: false };
}

export function uriToLocalPath(uriOrPath) {
  if (!uriOrPath) return "";
  const s = String(uriOrPath).trim();
  if (!s) return "";
  if (s.startsWith("file://")) {
    try { return fileURLToPath(s); } catch { return ""; }
  }
  return s;
}

export function readConversationSummaries(appDataDir = join(os.homedir(), ".gemini", "antigravity")) {
  if (!DatabaseSync) return [];
  const dbPath = join(appDataDir, "conversation_summaries.db");
  if (!existsSync(dbPath)) return [];
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db.prepare(`
      SELECT conversation_id, title, last_modified_time, workspace_uris, project_id, killed
      FROM conversation_summaries
      WHERE COALESCE(killed, 0) = 0
      ORDER BY last_modified_time DESC
      LIMIT 120
    `).all();
    return rows.map((r) => {
      let uris = [];
      try {
        const parsed = JSON.parse(r.workspace_uris || "[]");
        if (Array.isArray(parsed)) uris = parsed;
      } catch {
        if (typeof r.workspace_uris === "string" && r.workspace_uris.includes("file://")) {
          uris = r.workspace_uris.match(/file:\/\/[^\s"'\]]+/g) || [];
        }
      }
      const workspaces = uris.map(uriToLocalPath).filter(Boolean);
      return {
        conversationId: r.conversation_id,
        title: (r.title || "").trim() || r.conversation_id.slice(0, 8),
        modifiedMs: Date.parse(r.last_modified_time || "") || 0,
        projectId: r.project_id || "",
        workspaces
      };
    });
  } catch {
    return [];
  } finally {
    try { db?.close(); } catch {}
  }
}

function cleanExtractedPath(raw) {
  if (!raw || typeof raw !== "string") return "";
  let s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    try { s = JSON.parse(s); } catch { s = s.slice(1, -1); }
  }
  s = String(s).trim().replace(/[),;。，、]+$/, "");
  if (s.startsWith("file://")) s = uriToLocalPath(s);
  return s;
}

function isInternalNoisePath(p) {
  return !p || p.includes("/.system_generated/") || p.includes("\\.system_generated\\") ||
    p.includes("/browser_sandbox/") || p.includes("/.git/") || p.includes("/node_modules/");
}

const transcriptCache = new Map(); // path -> { sig, hits }

export function parseTranscriptIncremental(transcriptPath, workspaceRoots = []) {
  if (!existsSync(transcriptPath)) return [];
  let st;
  try { st = statSync(transcriptPath); } catch { return []; }
  const sig = `${st.size}:${st.mtimeMs}`;
  const cached = transcriptCache.get(transcriptPath);
  if (cached && cached.sig === sig) return cached.hits;

  const hits = new Map(); // path -> { path, source, tsMs }
  const addHit = (rawPath, source, tsMs) => {
    const p = cleanExtractedPath(rawPath);
    if (!p || isInternalNoisePath(p)) return;
    const isAbs = p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p);
    let abs = isAbs ? resolve(p) : "";
    if (!abs && workspaceRoots.length > 0) {
      for (const r of workspaceRoots) {
        const cand = resolve(r, p);
        if (existsSync(cand)) { abs = cand; break; }
      }
    }
    if (!abs) return;
    const prev = hits.get(abs);
    const rank = { sent: 4, generated: 3, modified: 2, referenced: 1 };
    if (!prev || (rank[source] || 0) >= (rank[prev.source] || 0)) {
      hits.set(abs, { path: abs, source, tsMs: Math.max(tsMs || 0, prev?.tsMs || 0) });
    }
  };

  let raw = "";
  try {
    raw = readFileSync(transcriptPath, "utf8");
  } catch {
    return [];
  }

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const tsMs = Date.parse(obj.created_at || "") || st.mtimeMs;

    if (obj.type === "USER_INPUT" && typeof obj.content === "string") {
      const attMatches = obj.content.match(/-\s+(?:image\/\w+\s+)?\(?((?:\/|[A-Za-z]:\\)[^\n)]+)/g) || [];
      for (const m of attMatches) {
        const pathMatch = m.match(/((?:\/|[A-Za-z]:\\)[^\s)]+)/);
        if (pathMatch) addHit(pathMatch[1], "sent", tsMs);
      }
      const atMatches = obj.content.match(/@(?:"([^"]+)"|'([^']+)'|([^\s,;，。！？\])<>]+))/g) || [];
      for (const tok of atMatches) {
        const inner = tok.slice(1).replace(/^["']|["']$/g, "");
        if (inner.includes("/") || inner.includes("\\") || inner.includes(".")) {
          addHit(inner, "sent", tsMs);
        }
      }
    }

    if (Array.isArray(obj.tool_calls)) {
      for (const tc of obj.tool_calls) {
        const tName = String(tc?.name || "").toLowerCase();
        const args = tc?.args || {};
        const pVal = args.Path || args.path || args.TargetFile || args.AbsolutePath;
        if (!pVal) continue;
        if (tName.includes("write")) addHit(pVal, "generated", tsMs);
        else if (tName.includes("edit") || tName.includes("replace")) addHit(pVal, "modified", tsMs);
        else if (tName.includes("read") || tName.includes("view")) addHit(pVal, "referenced", tsMs);
      }
    }

    if (obj.type === "PLANNER_RESPONSE" && typeof obj.content === "string") {
      const fileUrls = obj.content.match(/file:\/\/\/[^\s)"'\]]+/g) || [];
      for (const u of fileUrls) addHit(u, "generated", tsMs);
    }
  }

  const out = Array.from(hits.values());
  transcriptCache.set(transcriptPath, { sig, hits: out });
  if (transcriptCache.size > 160) {
    const firstKey = transcriptCache.keys().next().value;
    transcriptCache.delete(firstKey);
  }
  return out;
}

export function scanVaultState({
  appDataDir = join(os.homedir(), ".gemini", "antigravity"),
  store,
  conversationId = "",
  workspaceUris = [],
  scope = "session" // "session" | "project" | "all"
}) {
  const summaries = readConversationSummaries(appDataDir);
  const summaryMap = new Map(summaries.map((s) => [s.conversationId, s]));
  const activeRoots = workspaceUris.map(uriToLocalPath).filter(Boolean).map((p) => resolve(p));
  const brainRoot = join(appDataDir, "brain");

  let targetConvIds = [];
  if (scope === "session" && conversationId) {
    targetConvIds = [conversationId];
  } else if (scope === "project" && activeRoots.length > 0) {
    targetConvIds = summaries
      .filter((s) => s.workspaces.some((w) => activeRoots.includes(resolve(w))))
      .map((s) => s.conversationId);
    if (conversationId && !targetConvIds.includes(conversationId)) targetConvIds.unshift(conversationId);
  } else {
    targetConvIds = summaries.slice(0, 40).map((s) => s.conversationId);
    if (conversationId && !targetConvIds.includes(conversationId)) targetConvIds.unshift(conversationId);
  }

  const pins = store.loadPins();
  const archives = store.loadArchives();
  const tombstones = store.loadTombstones();
  const cfg = store.loadConfig();

  const archivedSet = new Set(archives.map((a) => a.sourcePath));
  const merged = new Map();

  const upsertEntry = (absPath, meta) => {
    if (!absPath || tombstones.has(absPath)) return;
    if (isInternalNoisePath(absPath)) return;
    let exists = false;
    let isDir = false;
    let size = 0;
    let mtimeMs = meta.tsMs || 0;
    try {
      if (existsSync(absPath)) {
        const st = statSync(absPath);
        exists = true;
        isDir = st.isDirectory();
        size = isDir ? 0 : st.size;
        mtimeMs = Math.max(mtimeMs, st.mtimeMs);
      }
    } catch {}

    const cls = classifyFile(absPath, isDir);
    if (!cfg.showCodeFiles && !cls.isReadableDoc && !pins[absPath]) {
      return;
    }

    const prev = merged.get(absPath);
    const rank = { sent: 4, generated: 3, modified: 2, referenced: 1, brain: 3, pin: 5 };
    const nextSource = !prev || (rank[meta.source] || 0) > (rank[prev.source] || 0) ? meta.source : prev.source;

    merged.set(absPath, {
      id: absPath,
      name: basename(absPath),
      path: absPath,
      uri: pathToFileURL(absPath).href,
      source: nextSource,
      category: cls.category,
      isReadableDoc: cls.isReadableDoc,
      canSidecarOpen: cls.canSidecarOpen,
      isDirectory: isDir,
      exists,
      size,
      mtimeMs: Math.max(mtimeMs, prev?.mtimeMs || 0),
      pinned: Boolean(pins[absPath]),
      archived: archivedSet.has(absPath),
      convId: meta.convId || prev?.convId || "",
      convTitle: meta.convTitle || prev?.convTitle || ""
    });
  };

  for (const cid of targetConvIds) {
    const convDir = join(brainRoot, cid);
    const convMeta = summaryMap.get(cid);
    const roots = convMeta?.workspaces?.length ? convMeta.workspaces : activeRoots;

    // 1) Brain 目录直出文件（忽略系统日志/沙箱与内部计划临时文件）
    if (existsSync(convDir)) {
      try {
        for (const ent of readdirSync(convDir, { withFileTypes: true })) {
          if (ent.name.startsWith(".") || ent.name === "browser_sandbox" || ent.name === "scratch") continue;
          if (ent.isDirectory()) continue;
          const fp = join(convDir, ent.name);
          upsertEntry(fp, { source: "generated", convId: cid, convTitle: convMeta?.title || "", tsMs: 0 });
        }
      } catch {}
    }

    // 2) transcript.jsonl 增量解析
    const tPath = join(convDir, ".system_generated", "logs", "transcript.jsonl");
    for (const hit of parseTranscriptIncremental(tPath, roots)) {
      upsertEntry(hit.path, { source: hit.source, convId: cid, convTitle: convMeta?.title || "", tsMs: hit.tsMs });
    }
  }

  // 3) 若开启所有范围或存在防压缩收藏，确保收藏项立即可见
  if (scope === "all") {
    for (const p of Object.values(pins)) {
      upsertEntry(p.path, { source: "pin", convId: p.convId || "", convTitle: "", tsMs: p.pinnedAt || 0 });
    }
  }

  const items = Array.from(merged.values()).sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.mtimeMs - a.mtimeMs;
  });

  const currentSummary = conversationId ? summaryMap.get(conversationId) : null;
  return {
    ok: true,
    scope,
    conversationId,
    conversationTitle: currentSummary?.title || "",
    workspaceName: activeRoots[0] ? basename(activeRoots[0]) : "",
    config: cfg,
    items,
    archives,
    pinnedCount: Object.keys(pins).length,
    archivedCount: archives.length
  };
}
