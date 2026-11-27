import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

let DatabaseSync = null;
try {
  const sqliteMod = await import("node:sqlite").catch(() => null);
  if (sqliteMod && typeof sqliteMod.DatabaseSync === "function") {
    DatabaseSync = sqliteMod.DatabaseSync;
  }
} catch {
  DatabaseSync = null;
}

const CJK_SEQ_RE = /[\u4e00-\u9fff]{2,}/g;
const CAMEL_SPLIT_RE = /([a-z0-9])([A-Z])/g;
const NON_TOKEN_RE = /[^a-zA-Z0-9_]+/g;
const FILE_EXT_RE = /\.(?:mjs|cjs|js|ts|tsx|jsx|json|md|markdown|txt|py|go|rs|java|c|cpp|h|sh|css|html|yaml|yml|toml|xml|sql|db|ps1)\b/i;

export function extractCjkBigrams(text) {
  if (!text || typeof text !== "string") return [];
  const out = [];
  const seen = new Set();
  const seqs = text.match(CJK_SEQ_RE) || [];
  for (const seq of seqs) {
    for (let i = 0; i < seq.length - 1; i++) {
      const bg = seq.slice(i, i + 2);
      if (!seen.has(bg)) {
        seen.add(bg);
        out.push(bg);
      }
    }
  }
  return out;
}

export function splitCodeTokens(text) {
  if (!text || typeof text !== "string") return [];
  const out = [];
  const seen = new Set();
  const addTok = (tok) => {
    const low = tok.toLowerCase();
    if (low.length < 2 || seen.has(low)) return;
    seen.add(low);
    out.push(low);
  };
  const parts = text.split(NON_TOKEN_RE).filter(Boolean);
  for (const part of parts) {
    addTok(part);
    const camel = part.replace(CAMEL_SPLIT_RE, "$1 $2").split(/[\s_]+/).filter(Boolean);
    for (const sub of camel) addTok(sub);
  }
  return out;
}

export function resolveTranscriptPath(appDataDir, conversationId) {
  const safeAppDir = appDataDir || path.join(os.homedir(), ".gemini", "antigravity");
  const safeConv = String(conversationId || "").trim();
  if (!safeConv || safeConv.includes("..") || safeConv.includes("/") || safeConv.includes("\\")) return "";
  return path.join(safeAppDir, "brain", safeConv, ".system_generated", "logs", "transcript.jsonl");
}

function stripOuterJsonQuotes(raw) {
  if (!raw || typeof raw !== "string") return "";
  let s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    try {
      const parsed = JSON.parse(s);
      if (typeof parsed === "string") s = parsed;
    } catch {
      s = s.slice(1, -1);
    }
  }
  return s.trim();
}

function isRouteOrUrlNoise(p) {
  if (!p) return true;
  if (p.startsWith("//") && !p.startsWith("\\\\")) return true;
  if (/^https?:\/\//i.test(p)) return true;
  if (/^\/(?:api|c|new|settings|artifact|terminal-standalone|settings-standalone)(?:\/|$)/i.test(p)) return true;
  return false;
}

function isInternalNoisePath(p) {
  if (!p) return true;
  return (
    isRouteOrUrlNoise(p) ||
    p.includes("/.system_generated/") ||
    p.includes("\\.system_generated\\") ||
    p.includes("/browser_sandbox/") ||
    p.includes("\\browser_sandbox\\") ||
    p.includes("/.git/") ||
    p.includes("\\.git\\") ||
    p.includes("/node_modules/") ||
    p.includes("\\node_modules\\")
  );
}

function cleanUserText(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .replace(/<\/?USER_REQUEST>/gi, "")
    .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/gi, "")
    .replace(/\r/g, "")
    .trim();
}

function makeTitleFromUserText(cleaned) {
  if (!cleaned) return "未命名轮次";
  const lines = cleaned.split("\n").map((l) => l.trim()).filter(Boolean);
  const first = (lines[0] || cleaned).replace(/\s+/g, " ").trim();
  return first.length > 100 ? first.slice(0, 99) + "…" : first;
}

function makeSummaryText(raw) {
  if (!raw || typeof raw !== "string") return "";
  const compact = raw.replace(/\s+/g, " ").trim();
  return compact.length > 240 ? compact.slice(0, 239) + "…" : compact;
}

function extractPathsFromText(text) {
  if (!text || typeof text !== "string") return [];
  const out = [];
  const seen = new Set();
  const addPath = (cand) => {
    const p = stripOuterJsonQuotes(cand).replace(/[),;。，、`'"]+$/, "");
    if (!p || isInternalNoisePath(p)) return;
    if (p.length > 260) return;
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  };
  const absMatches = text.match(/(?:file:\/\/\/[^\s)"'\]]+|(?:\/|[A-Za-z]:\\)[^\s)"'\],;<>]+)/g) || [];
  for (const m of absMatches) {
    if (m.startsWith("file://")) {
      addPath(m.replace(/^file:\/\//, ""));
    } else if (m.includes("/") || m.includes("\\")) {
      addPath(m);
    }
  }
  const relMatches = text.match(/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\.[A-Za-z0-9]{1,8}/g) || [];
  for (const m of relMatches) addPath(m);
  const fileMatches = text.match(/\b[A-Za-z0-9_.-]+\.(?:mjs|cjs|js|ts|tsx|jsx|json|md|py|go|rs|java|css|html|sh|ps1)\b/g) || [];
  for (const m of fileMatches) addPath(m);
  return out;
}

function extractErrorCodes(text) {
  if (!text || typeof text !== "string") return [];
  const out = [];
  const seen = new Set();
  const addErr = (v) => {
    const clean = String(v || "").trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    out.push(clean);
  };
  const posixErrs = text.match(/\b(?:ENOENT|EACCES|EPERM|ECONNREFUSED|ETIMEDOUT|EADDRINUSE|EISDIR|ENOTDIR|ERR_[A-Z0-9_]+|SQLITE_[A-Z0-9_]+)\b/g) || [];
  for (const e of posixErrs) addErr(e);
  const httpErrs = text.match(/\b(?:HTTP\s*(?:4\d{2}|5\d{2})|status(?:\s*code)?[:=\s]+(?:4\d{2}|5\d{2}))\b/gi) || [];
  for (const e of httpErrs) addErr(e.replace(/\s+/g, " "));
  const exitCodes = text.match(/\bexit(?:ed with)? code [1-9]\d*\b/gi) || [];
  for (const e of exitCodes) addErr(e);
  const bareHttp = text.match(/\b(?:401|403|404|409|429|500|502|503|504)\b/g) || [];
  for (const e of bareHttp) addErr(e);
  return out.slice(0, 12);
}

function extractToolPaths(toolCalls) {
  const out = [];
  const seen = new Set();
  const add = (val) => {
    const p = stripOuterJsonQuotes(val);
    if (!p || isInternalNoisePath(p) || seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };
  for (const tc of toolCalls || []) {
    const args = tc?.args || {};
    for (const k of ["Path", "path", "TargetFile", "AbsolutePath", "file_path", "target_file"]) {
      if (typeof args[k] === "string" && args[k].trim()) add(args[k]);
    }
    if (typeof args.CommandLine === "string") {
      for (const p of extractPathsFromText(args.CommandLine)) add(p);
    }
  }
  return out;
}

function extractSymbolNames(text) {
  if (!text || typeof text !== "string") return [];
  const out = [];
  const seen = new Set();
  const add = (s) => {
    if (!s || s.length < 3 || s.length > 64 || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  const apiPaths = text.match(/\/api\/[a-zA-Z0-9/_-]+/g) || [];
  for (const a of apiPaths) add(a);
  const camelIdent = text.match(/\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]{2,}\b/g) || [];
  for (const c of camelIdent) add(c);
  const snakeIdent = text.match(/\b[a-zA-Z][a-zA-Z0-9]*(?:_[a-zA-Z0-9]+)+\b/g) || [];
  for (const s of snakeIdent) add(s);
  return out.slice(0, 20);
}

function classifyGenericResult(obj) {
  const content = typeof obj?.content === "string" ? obj.content : "";
  const hasTruncated = Array.isArray(obj?.truncated_fields) && obj.truncated_fields.length > 0;
  const isDone = !obj?.status || obj.status === "DONE";
  const failedSignal =
    /\bCommand exited with code [1-9]\d*\b/i.test(content) ||
    /\b(?:Uncaught|SyntaxError|TypeError|ReferenceError|SQLITE_ERROR|FAIL)\b/.test(content);
  const hasSuccessSignal =
    /\bCommand exited with code 0\b/i.test(content) ||
    /\b(?:Showing lines|Created At:|pass \d+|ok\b)/i.test(content) ||
    content.trim().length > 0;
  if (isDone && !hasTruncated && !failedSignal && hasSuccessSignal) return "tool_verified";
  return "tool_called";
}

function pickPrimaryEvidence(evSet) {
  if (evSet.has("user_confirm")) return "user_confirm";
  if (evSet.has("tool_verified")) return "tool_verified";
  if (evSet.has("tool_called")) return "tool_called";
  return "assistant_note";
}

function buildFtsMatchExpr(tokens) {
  const clean = [];
  for (const tok of tokens) {
    const safe = String(tok || "").replace(/["*]/g, "").trim();
    if (safe.length >= 2) clean.push(`"${safe}"`);
  }
  if (!clean.length) return "";
  return clean.slice(0, 12).join(" AND ");
}

function parseSummaryRows(appDataDir) {
  if (!DatabaseSync) return [];
  const dbPath = path.join(appDataDir, "conversation_summaries.db");
  if (!fs.existsSync(dbPath)) return [];
  let sdb;
  try {
    sdb = new DatabaseSync(dbPath, { readOnly: true });
    const rows = sdb
      .prepare(`
        SELECT conversation_id, title, last_modified_time, workspace_uris, project_id, killed
        FROM conversation_summaries
        WHERE COALESCE(killed, 0) = 0
        ORDER BY last_modified_time DESC
        LIMIT 200
      `)
      .all();
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
      const plat = uris.some((u) => /^file:\/\/\/[A-Za-z]:/i.test(String(u)) || /^[A-Za-z]:[\\/]/.test(String(u)))
        ? "win32"
        : process.platform;
      const workspaceKeys = Array.from(new Set(uris.map((u) => toPathCompareKey(u, plat)).filter(Boolean)));
      const rawProject = String(r.project_id || "").trim();
      const projectId =
        rawProject && rawProject !== "outside-of-project" && rawProject !== "Default Project"
          ? rawProject
          : "";
      return {
        conversationId: String(r.conversation_id || "").trim(),
        title: (r.title || "").trim() || String(r.conversation_id || "").slice(0, 8),
        modifiedMs: Date.parse(r.last_modified_time || "") || 0,
        projectId,
        workspaceKeys,
        workspaces: uris.map((u) => normalizePlatformPath(u, plat)).filter(Boolean)
      };
    });
  } catch {
    return [];
  } finally {
    try { sdb?.close(); } catch {}
  }
}

function readConversationTitleFromSummaries(appDataDir, conversationId) {
  if (!DatabaseSync || !conversationId) return "";
  const dbPath = path.join(appDataDir, "conversation_summaries.db");
  if (!fs.existsSync(dbPath)) return "";
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const row = db
      .prepare("SELECT title FROM conversation_summaries WHERE conversation_id = ? LIMIT 1")
      .get(conversationId);
    return row?.title ? String(row.title).trim() : "";
  } catch {
    return "";
  } finally {
    try { db?.close(); } catch {}
  }
}

function computeFileIdentity(st, filePath) {
  if (st.dev !== undefined && st.ino !== undefined && (st.dev !== 0 || st.ino !== 0)) {
    return `${st.dev}:${st.ino}`;
  }
  return `${Math.floor(st.birthtimeMs || 0)}:${toPathCompareKey(filePath)}`;
}

export function normalizePlatformPath(rawPath, platform = process.platform) {
  if (!rawPath || typeof rawPath !== "string") return "";
  let s = rawPath.trim();
  if (!s) return "";

  if (s.toLowerCase().startsWith("file://")) {
    let rest = s.slice(7);
    if (rest.toLowerCase().startsWith("localhost/")) rest = rest.slice(9);
    else if (!rest.startsWith("/") && rest.includes("/") && platform === "win32") {
      const idx = rest.indexOf("/");
      const host = rest.slice(0, idx);
      const share = rest.slice(idx);
      try {
        rest = `\\\\${host}${decodeURIComponent(share).replace(/\//g, "\\")}`;
      } catch {
        rest = `\\\\${host}${share.replace(/\//g, "\\")}`;
      }
      s = rest;
    }
    if (s.toLowerCase().startsWith("file://")) {
      try { s = decodeURIComponent(rest); } catch { s = rest; }
    }
  }

  if (platform === "win32") {
    if (/^\/[A-Za-z]:(?:\/|$)/.test(s)) s = s.slice(1);
    s = s.replace(/\//g, "\\");
    if (/^[A-Za-z]:$/.test(s)) return `${s}\\`;
    if (/^[A-Za-z]:\\$/.test(s)) return s;
    return s.replace(/\\+$/, "");
  }

  if (/^\/+$/.test(s)) return "/";
  return s.replace(/\/+$/, "");
}

export function toPathCompareKey(rawPath, platform = process.platform) {
  const norm = normalizePlatformPath(rawPath, platform);
  if (!norm) return "";
  if (platform === "win32") {
    return norm.replace(/\\/g, "/").toLowerCase();
  }
  return norm;
}

export function isAbsoluteLocalPath(p, platform = process.platform) {
  if (!p || typeof p !== "string") return false;
  if (isRouteOrUrlNoise(p)) return false;
  if (platform === "win32") {
    return /^[A-Za-z]:[\\/]/.test(p) || /^\\\\[^\\]+\\[^\\]+/.test(p);
  }
  if (/^[A-Za-z]:[\\/]/.test(p) || p.startsWith("\\\\")) return false;
  return p.startsWith("/");
}

function loadVaultPinnedSet(appDataDir) {
  const out = new Set();
  try {
    const pinsPath = path.join(appDataDir, "plugin_data", "gravity-vault", "pins.json");
    if (!fs.existsSync(pinsPath)) return out;
    const raw = JSON.parse(fs.readFileSync(pinsPath, "utf8"));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const key of Object.keys(raw)) {
        if (isAbsoluteLocalPath(key)) out.add(path.resolve(key));
        const p = raw[key]?.path;
        if (isAbsoluteLocalPath(p)) out.add(path.resolve(p));
      }
    }
  } catch {}
  return out;
}

function formatStaticTimestamp(ms) {
  if (!ms) return "--";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function estimateTokens(text) {
  if (!text || typeof text !== "string") return 0;
  let ascii = 0;
  let nonAscii = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) <= 0x7f) ascii += 1;
    else nonAscii += 1;
  }
  return Math.max(1, Math.ceil(ascii / 4 + nonAscii / 1.5));
}

function truncateUtf8Safe(text, maxBytes) {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return { text, truncated: false };
  const suffix = "\n…(已按字节预算截断)";
  const suffixBytes = Buffer.byteLength(suffix, "utf8");
  const limit = Math.max(0, maxBytes - suffixBytes);
  let out = "";
  let used = 0;
  for (const ch of text) {
    const b = Buffer.byteLength(ch, "utf8");
    if (used + b > limit) break;
    out += ch;
    used += b;
  }
  return { text: out + suffix, truncated: true };
}

export function createHistoryIndex({
  dataDir,
  appDataDir = path.join(os.homedir(), ".gemini", "antigravity")
}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "history-index.db");
  let db = null;
  let sqliteAvailable = Boolean(DatabaseSync);
  let lastBytesRead = 0;

  function ensureDb() {
    if (!DatabaseSync) {
      sqliteAvailable = false;
      return null;
    }
    if (db) return db;
    db = new DatabaseSync(dbPath);
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA temp_store = MEMORY;
      CREATE TABLE IF NOT EXISTS session_cursors (
        conversation_id TEXT PRIMARY KEY,
        transcript_path TEXT NOT NULL,
        file_identity TEXT NOT NULL,
        byte_offset INTEGER NOT NULL DEFAULT 0,
        line_no INTEGER NOT NULL DEFAULT 0,
        file_size INTEGER NOT NULL DEFAULT 0,
        mtime_ms INTEGER NOT NULL DEFAULT 0,
        turn_count INTEGER NOT NULL DEFAULT 0,
        schema_status TEXT NOT NULL DEFAULT 'ok',
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        turn_index INTEGER NOT NULL,
        step_start INTEGER NOT NULL,
        step_end INTEGER NOT NULL,
        line_start INTEGER NOT NULL,
        line_end INTEGER NOT NULL,
        byte_start INTEGER NOT NULL,
        byte_end INTEGER NOT NULL,
        created_at_ms INTEGER NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        evidence_types TEXT NOT NULL,
        primary_evidence TEXT NOT NULL,
        files_json TEXT NOT NULL,
        error_codes_json TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        last_input_tokens INTEGER NOT NULL DEFAULT 0,
        last_cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        content_hash TEXT NOT NULL,
        UNIQUE(conversation_id, turn_index)
      );
      CREATE INDEX IF NOT EXISTS idx_turns_conv ON turns(conversation_id, turn_index DESC);
      CREATE TABLE IF NOT EXISTS turn_entities (
        conversation_id TEXT NOT NULL,
        turn_index INTEGER NOT NULL,
        kind TEXT NOT NULL,
        value TEXT NOT NULL,
        value_lower TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_entities_lookup ON turn_entities(conversation_id, value_lower);
      CREATE INDEX IF NOT EXISTS idx_entities_turn ON turn_entities(conversation_id, turn_index);
      CREATE VIRTUAL TABLE IF NOT EXISTS turns_fts USING fts5(
        conversation_id UNINDEXED,
        turn_index UNINDEXED,
        text_tokens,
        cjk_bigrams,
        tokenize='unicode61'
      );
      CREATE TABLE IF NOT EXISTS turn_pins (
        conversation_id TEXT NOT NULL,
        turn_index INTEGER NOT NULL,
        custom_title TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        pinned_at INTEGER NOT NULL,
        PRIMARY KEY (conversation_id, turn_index)
      );
      CREATE TABLE IF NOT EXISTS turn_file_snapshots (
        conversation_id TEXT NOT NULL,
        turn_index INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        snap_mtime_ms INTEGER NOT NULL DEFAULT 0,
        snap_size INTEGER NOT NULL DEFAULT 0,
        snap_exists INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (conversation_id, turn_index, file_path)
      );
    `);
    return db;
  }

  function clearConversationRows(database, conversationId) {
    database.prepare("DELETE FROM turn_file_snapshots WHERE conversation_id = ?").run(conversationId);
    database.prepare("DELETE FROM turn_entities WHERE conversation_id = ?").run(conversationId);
    database.prepare("DELETE FROM turns_fts WHERE conversation_id = ?").run(conversationId);
    database.prepare("DELETE FROM turns WHERE conversation_id = ?").run(conversationId);
    database.prepare("DELETE FROM session_cursors WHERE conversation_id = ?").run(conversationId);
  }

  function upsertTurnRecord(database, convId, turnState) {
    const evArr = Array.from(turnState.evidenceTypes);
    const primary = pickPrimaryEvidence(turnState.evidenceTypes);
    const filesArr = Array.from(turnState.files).slice(0, 32);
    const errArr = Array.from(turnState.errorCodes).slice(0, 16);
    const summaryRaw = turnState.summaryParts.filter(Boolean).join(" · ");
    const summary = makeSummaryText(summaryRaw || turnState.title);
    const contentHash = crypto
      .createHash("sha1")
      .update(`${turnState.title}\n${summary}\n${filesArr.join("|")}`)
      .digest("hex")
      .slice(0, 16);

    database.prepare(`
      INSERT INTO turns (
        conversation_id, turn_index, step_start, step_end, line_start, line_end,
        byte_start, byte_end, created_at_ms, title, summary, evidence_types,
        primary_evidence, files_json, error_codes_json, input_tokens, cache_read_tokens,
        output_tokens, last_input_tokens, last_cache_read_tokens, content_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(conversation_id, turn_index) DO UPDATE SET
        step_end = excluded.step_end,
        line_end = excluded.line_end,
        byte_end = excluded.byte_end,
        title = excluded.title,
        summary = excluded.summary,
        evidence_types = excluded.evidence_types,
        primary_evidence = excluded.primary_evidence,
        files_json = excluded.files_json,
        error_codes_json = excluded.error_codes_json,
        input_tokens = excluded.input_tokens,
        cache_read_tokens = excluded.cache_read_tokens,
        output_tokens = excluded.output_tokens,
        last_input_tokens = excluded.last_input_tokens,
        last_cache_read_tokens = excluded.last_cache_read_tokens,
        content_hash = excluded.content_hash
    `).run(
      convId,
      turnState.turnIndex,
      turnState.stepStart,
      turnState.stepEnd,
      turnState.lineStart,
      turnState.lineEnd,
      turnState.byteStart,
      turnState.byteEnd,
      turnState.createdAtMs,
      turnState.title,
      summary,
      JSON.stringify(evArr),
      primary,
      JSON.stringify(filesArr),
      JSON.stringify(errArr),
      turnState.inputTokens,
      turnState.cacheReadTokens,
      turnState.outputTokens,
      turnState.lastInputTokens,
      turnState.lastCacheReadTokens,
      contentHash
    );

    database.prepare("DELETE FROM turn_entities WHERE conversation_id = ? AND turn_index = ?").run(convId, turnState.turnIndex);
    const insEntity = database.prepare(
      "INSERT INTO turn_entities (conversation_id, turn_index, kind, value, value_lower) VALUES (?, ?, ?, ?, ?)"
    );
    const entSeen = new Set();
    const pushEntity = (kind, val) => {
      const low = String(val || "").toLowerCase();
      const key = `${kind}:${low}`;
      if (!low || entSeen.has(key)) return;
      entSeen.add(key);
      insEntity.run(convId, turnState.turnIndex, kind, val, low);
    };
    for (const f of filesArr) {
      pushEntity("path", f);
      const base = path.basename(f);
      if (base && base !== f) pushEntity("path", base);
    }
    for (const e of errArr) pushEntity("error", e);
    for (const sym of turnState.symbols) pushEntity("symbol", sym);

    const insSnap = database.prepare(`
      INSERT OR IGNORE INTO turn_file_snapshots (
        conversation_id, turn_index, file_path, snap_mtime_ms, snap_size, snap_exists
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    let snapCount = 0;
    for (const f of filesArr) {
      if (snapCount >= 12) break;
      if (!isAbsoluteLocalPath(f)) continue;
      const abs = path.resolve(f);
      snapCount += 1;
      let sExists = 0;
      let sMtime = 0;
      let sSize = 0;
      try {
        if (fs.existsSync(abs)) {
          const fst = fs.statSync(abs);
          sExists = 1;
          sMtime = Math.floor(fst.mtimeMs || 0);
          sSize = Number(fst.size || 0);
        }
      } catch {}
      insSnap.run(convId, turnState.turnIndex, abs, sMtime, sSize, sExists);
    }

    database.prepare("DELETE FROM turns_fts WHERE conversation_id = ? AND turn_index = ?").run(convId, turnState.turnIndex);
    const combinedForTokens = [
      turnState.title,
      summary,
      filesArr.join(" "),
      errArr.join(" "),
      Array.from(turnState.symbols).join(" ")
    ].join(" ");
    const textTokens = splitCodeTokens(combinedForTokens).join(" ");
    const cjkBigrams = extractCjkBigrams(`${turnState.title} ${summary}`).join(" ");
    database.prepare(
      "INSERT INTO turns_fts (conversation_id, turn_index, text_tokens, cjk_bigrams) VALUES (?, ?, ?, ?)"
    ).run(convId, turnState.turnIndex, textTokens, cjkBigrams);
  }

  function hydrateLastTurnState(database, convId) {
    const row = database
      .prepare("SELECT * FROM turns WHERE conversation_id = ? ORDER BY turn_index DESC LIMIT 1")
      .get(convId);
    if (!row) return null;
    const files = JSON.parse(row.files_json || "[]");
    const errorCodes = JSON.parse(row.error_codes_json || "[]");
    const evTypes = JSON.parse(row.evidence_types || "[]");
    const symRows = database
      .prepare("SELECT value FROM turn_entities WHERE conversation_id = ? AND turn_index = ? AND kind = 'symbol'")
      .all(convId, row.turn_index);
    return {
      turnIndex: row.turn_index,
      stepStart: row.step_start,
      stepEnd: row.step_end,
      lineStart: row.line_start,
      lineEnd: row.line_end,
      byteStart: row.byte_start,
      byteEnd: row.byte_end,
      createdAtMs: row.created_at_ms,
      title: row.title,
      summaryParts: row.summary ? [row.summary] : [],
      evidenceTypes: new Set(evTypes),
      files: new Set(files),
      errorCodes: new Set(errorCodes),
      symbols: new Set(symRows.map((r) => r.value)),
      inputTokens: row.input_tokens,
      cacheReadTokens: row.cache_read_tokens,
      outputTokens: row.output_tokens,
      lastInputTokens: row.last_input_tokens,
      lastCacheReadTokens: row.last_cache_read_tokens,
      pendingToolCalls: 0,
      dirty: false
    };
  }

  function syncConversation(conversationId, { forceRebuild = false } = {}) {
    lastBytesRead = 0;
    const convId = String(conversationId || "").trim();
    if (!convId) {
      return { ok: false, error: "缺少 conversationId", conversationId: "", schemaStatus: "empty", turnCount: 0, bytesRead: 0 };
    }
    const database = ensureDb();
    if (!database) {
      return { ok: false, sqliteAvailable: false, error: "当前 Node 环境不支持 node:sqlite", conversationId: convId, schemaStatus: "degraded", turnCount: 0, bytesRead: 0 };
    }

    const transcriptPath = resolveTranscriptPath(appDataDir, convId);
    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
      const now = Date.now();
      database.exec("BEGIN IMMEDIATE");
      try {
        clearConversationRows(database, convId);
        database.prepare(`
          INSERT INTO session_cursors (
            conversation_id, transcript_path, file_identity, byte_offset, line_no,
            file_size, mtime_ms, turn_count, schema_status, updated_at
          ) VALUES (?, ?, '', 0, 0, 0, 0, 0, 'missing_transcript', ?)
        `).run(convId, transcriptPath || "", now);
        database.exec("COMMIT");
      } catch (err) {
        try { database.exec("ROLLBACK"); } catch {}
        throw err;
      }
      return {
        ok: true,
        conversationId: convId,
        transcriptPath,
        schemaStatus: "missing_transcript",
        turnCount: 0,
        bytesRead: 0,
        rebuilt: false
      };
    }

    const st = fs.statSync(transcriptPath);
    const fileIdentity = computeFileIdentity(st, transcriptPath);
    const mtimeMs = Math.floor(st.mtimeMs);
    let cursor = database.prepare("SELECT * FROM session_cursors WHERE conversation_id = ?").get(convId);

    if (
      !forceRebuild &&
      cursor &&
      cursor.schema_status === "ok" &&
      cursor.file_identity === fileIdentity &&
      cursor.file_size === st.size &&
      cursor.mtime_ms === mtimeMs
    ) {
      return {
        ok: true,
        conversationId: convId,
        transcriptPath,
        schemaStatus: "ok",
        turnCount: cursor.turn_count,
        bytesRead: 0,
        cacheHit: true,
        rebuilt: false
      };
    }

    const mustRebuild =
      forceRebuild ||
      !cursor ||
      cursor.schema_status !== "ok" ||
      cursor.file_identity !== fileIdentity ||
      st.size < cursor.byte_offset;

    const startOffset = mustRebuild ? 0 : cursor.byte_offset;
    const startLine = mustRebuild ? 0 : cursor.line_no;
    const deltaLen = Math.max(0, st.size - startOffset);
    let consumedBytes = 0;
    let linesConsumed = 0;
    let degraded = false;

    const touchedTurns = new Map();
    let currentTurn = mustRebuild ? null : hydrateLastTurnState(database, convId);
    let nextTurnIndex = currentTurn ? currentTurn.turnIndex + 1 : 1;

    if (deltaLen > 0) {
      const fd = fs.openSync(transcriptPath, "r");
      let buf;
      try {
        buf = Buffer.allocUnsafe(deltaLen);
        const actuallyRead = fs.readSync(fd, buf, 0, deltaLen, startOffset);
        lastBytesRead = actuallyRead;
        if (actuallyRead < deltaLen) buf = buf.subarray(0, actuallyRead);
      } finally {
        fs.closeSync(fd);
      }

      const lastNewline = buf.lastIndexOf(0x0a);
      if (lastNewline >= 0) {
        consumedBytes = lastNewline + 1;
        const completeBuf = buf.subarray(0, consumedBytes);
        let lineCursor = 0;

        while (lineCursor < completeBuf.length) {
          const nlIdx = completeBuf.indexOf(0x0a, lineCursor);
          const endIdx = nlIdx === -1 ? completeBuf.length : nlIdx + 1;
          const lineByteStart = startOffset + lineCursor;
          const lineByteEnd = startOffset + endIdx;
          const lineStr = completeBuf.subarray(lineCursor, endIdx).toString("utf8").trim();
          lineCursor = endIdx;
          linesConsumed += 1;
          const lineNumber = startLine + linesConsumed;

          if (!lineStr) continue;
          let obj;
          try {
            obj = JSON.parse(lineStr);
          } catch {
            degraded = true;
            continue;
          }

          const type = String(obj.type || "");
          const stepIdx = Number.isFinite(Number(obj.step_index)) ? Number(obj.step_index) : lineNumber;
          const createdMs = Date.parse(obj.created_at || "") || st.mtimeMs;

          if (type === "USER_INPUT" || !currentTurn) {
            if (currentTurn && currentTurn.dirty) {
              touchedTurns.set(currentTurn.turnIndex, currentTurn);
            }
            const rawUser = typeof obj.content === "string" ? obj.content : "";
            const cleaned = cleanUserText(rawUser);
            const title = type === "USER_INPUT" ? makeTitleFromUserText(cleaned) : "会话片段";
            currentTurn = {
              turnIndex: nextTurnIndex++,
              stepStart: stepIdx,
              stepEnd: stepIdx,
              lineStart: lineNumber,
              lineEnd: lineNumber,
              byteStart: lineByteStart,
              byteEnd: lineByteEnd,
              createdAtMs: Math.floor(createdMs),
              title,
              summaryParts: cleaned ? [cleaned.slice(0, 180)] : [],
              evidenceTypes: new Set(type === "USER_INPUT" && cleaned ? ["user_confirm"] : []),
              files: new Set(extractPathsFromText(cleaned)),
              errorCodes: new Set(extractErrorCodes(cleaned)),
              symbols: new Set(extractSymbolNames(cleaned)),
              inputTokens: 0,
              cacheReadTokens: 0,
              outputTokens: 0,
              lastInputTokens: 0,
              lastCacheReadTokens: 0,
              pendingToolCalls: 0,
              dirty: true
            };
            touchedTurns.set(currentTurn.turnIndex, currentTurn);
          }

          currentTurn.stepEnd = Math.max(currentTurn.stepEnd, stepIdx);
          currentTurn.lineEnd = lineNumber;
          currentTurn.byteEnd = lineByteEnd;
          currentTurn.dirty = true;

          if (type === "PLANNER_RESPONSE") {
            const inTok = Math.max(0, Number(obj.input_tokens) || 0);
            const cacheTok = Math.max(0, Number(obj.cache_read_tokens) || 0);
            const outTok = Math.max(0, Number(obj.output_tokens) || 0);
            if (inTok > 0 || cacheTok > 0 || outTok > 0) {
              currentTurn.inputTokens += inTok;
              currentTurn.cacheReadTokens += cacheTok;
              currentTurn.outputTokens += outTok;
              if (inTok > 0) {
                currentTurn.lastInputTokens = inTok;
                currentTurn.lastCacheReadTokens = cacheTok;
              }
            }
            if (Array.isArray(obj.tool_calls) && obj.tool_calls.length > 0) {
              currentTurn.pendingToolCalls += obj.tool_calls.length;
              currentTurn.evidenceTypes.add("tool_called");
              for (const p of extractToolPaths(obj.tool_calls)) currentTurn.files.add(p);
              for (const tc of obj.tool_calls) {
                const name = String(tc?.name || "").trim();
                if (name) currentTurn.symbols.add(name);
                if (typeof tc?.args?.CommandLine === "string") {
                  for (const sym of extractSymbolNames(tc.args.CommandLine)) currentTurn.symbols.add(sym);
                }
              }
            }
            if (typeof obj.content === "string" && obj.content.trim()) {
              currentTurn.evidenceTypes.add("assistant_note");
              const respText = obj.content.replace(/\s+/g, " ").trim();
              currentTurn.summaryParts.push(respText.slice(0, 140));
              for (const p of extractPathsFromText(respText)) currentTurn.files.add(p);
              for (const e of extractErrorCodes(respText)) currentTurn.errorCodes.add(e);
              for (const sym of extractSymbolNames(respText)) currentTurn.symbols.add(sym);
            }
          } else if (type === "GENERIC") {
            const content = typeof obj.content === "string" ? obj.content : "";
            const resKind = classifyGenericResult(obj);
            if (currentTurn.pendingToolCalls > 0 || resKind === "tool_verified") {
              currentTurn.evidenceTypes.add(resKind);
              if (resKind === "tool_verified") {
                currentTurn.pendingToolCalls = Math.max(0, currentTurn.pendingToolCalls - 1);
              }
            }
            for (const e of extractErrorCodes(content)) currentTurn.errorCodes.add(e);
            for (const p of extractPathsFromText(content.slice(0, 1200))) currentTurn.files.add(p);
          }

          touchedTurns.set(currentTurn.turnIndex, currentTurn);
        }
      }
    }

    const newOffset = startOffset + consumedBytes;
    const newLineNo = startLine + linesConsumed;
    const now = Date.now();

    database.exec("BEGIN IMMEDIATE");
    try {
      if (mustRebuild) {
        clearConversationRows(database, convId);
      }
      for (const tState of touchedTurns.values()) {
        upsertTurnRecord(database, convId, tState);
      }
      const totalTurnsRow = database
        .prepare("SELECT COUNT(*) AS c FROM turns WHERE conversation_id = ?")
        .get(convId);
      const turnCount = Number(totalTurnsRow?.c || 0);
      database.prepare(`
        INSERT INTO session_cursors (
          conversation_id, transcript_path, file_identity, byte_offset, line_no,
          file_size, mtime_ms, turn_count, schema_status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(conversation_id) DO UPDATE SET
          transcript_path = excluded.transcript_path,
          file_identity = excluded.file_identity,
          byte_offset = excluded.byte_offset,
          line_no = excluded.line_no,
          file_size = excluded.file_size,
          mtime_ms = excluded.mtime_ms,
          turn_count = excluded.turn_count,
          schema_status = excluded.schema_status,
          updated_at = excluded.updated_at
      `).run(
        convId,
        transcriptPath,
        fileIdentity,
        newOffset,
        newLineNo,
        st.size,
        mtimeMs,
        turnCount,
        degraded ? "degraded" : "ok",
        now
      );
      database.exec("COMMIT");
      return {
        ok: true,
        conversationId: convId,
        transcriptPath,
        schemaStatus: degraded ? "degraded" : "ok",
        turnCount,
        bytesRead: lastBytesRead,
        consumedBytes,
        rebuilt: mustRebuild
      };
    } catch (err) {
      try { database.exec("ROLLBACK"); } catch {}
      throw err;
    }
  }

  function loadPinsMap(database, convId) {
    const map = new Map();
    if (!database || !convId) return map;
    const rows = database
      .prepare("SELECT turn_index, custom_title, note, pinned_at FROM turn_pins WHERE conversation_id = ?")
      .all(convId);
    for (const r of rows) {
      map.set(r.turn_index, {
        customTitle: r.custom_title || "",
        note: r.note || "",
        pinnedAt: Number(r.pinned_at || 0)
      });
    }
    return map;
  }

  function formatTurnRow(row, score = 0, pinInfo = null, vaultPinnedSet = null) {
    const evTypes = JSON.parse(row.evidence_types || "[]");
    const files = JSON.parse(row.files_json || "[]");
    const errorCodes = JSON.parse(row.error_codes_json || "[]");
    const lastTotalIn = row.last_input_tokens + row.last_cache_read_tokens;
    const hitRatePct =
      lastTotalIn > 0
        ? Math.round((row.last_cache_read_tokens / lastTotalIn) * 1000) / 10
        : null;
    let vaultPinnedCount = 0;
    if (vaultPinnedSet && vaultPinnedSet.size > 0) {
      for (const f of files) {
        if (isAbsoluteLocalPath(f) && vaultPinnedSet.has(path.resolve(f))) {
          vaultPinnedCount += 1;
        }
      }
    }
    const pinned = Boolean(pinInfo);
    const customTitle = pinInfo?.customTitle || "";
    return {
      conversationId: row.conversation_id,
      turnIndex: row.turn_index,
      stepStart: row.step_start,
      stepEnd: row.step_end,
      lineStart: row.line_start,
      lineEnd: row.line_end,
      byteStart: row.byte_start,
      byteEnd: row.byte_end,
      createdAtMs: row.created_at_ms,
      title: row.title,
      customTitle,
      displayTitle: customTitle || row.title,
      note: pinInfo?.note || "",
      pinned,
      pinnedAt: pinInfo?.pinnedAt || 0,
      vaultPinnedCount,
      summary: row.summary,
      evidenceTypes: evTypes,
      primaryEvidence: row.primary_evidence,
      files,
      errorCodes,
      inputTokens: row.input_tokens,
      cacheReadTokens: row.cache_read_tokens,
      outputTokens: row.output_tokens,
      lastInputTokens: row.last_input_tokens,
      lastCacheReadTokens: row.last_cache_read_tokens,
      lastTotalContextTokens: lastTotalIn,
      hitRatePct,
      contentHash: row.content_hash,
      score
    };
  }

  function getSessionCacheStats(conversationId) {
    const database = ensureDb();
    if (!database || !conversationId) {
      return {
        lastInputTokens: 0,
        lastCacheReadTokens: 0,
        lastTotalContextTokens: 0,
        lastUncachedInputTokens: 0,
        lastHitRatePct: null,
        totalInputTokens: 0,
        totalCacheReadTokens: 0,
        totalContextTokens: 0,
        totalOutputTokens: 0,
        avgHitRatePct: null,
        status: "warmup",
        advisory: { level: "neutral", text: "" }
      };
    }
    const agg = database
      .prepare(`
        SELECT
          COALESCE(SUM(input_tokens), 0) AS total_in,
          COALESCE(SUM(cache_read_tokens), 0) AS total_cache,
          COALESCE(SUM(output_tokens), 0) AS total_out
        FROM turns
        WHERE conversation_id = ?
      `)
      .get(conversationId);
    const latest = database
      .prepare(`
        SELECT last_input_tokens, last_cache_read_tokens
        FROM turns
        WHERE conversation_id = ? AND (last_input_tokens + last_cache_read_tokens) > 0
        ORDER BY turn_index DESC
        LIMIT 1
      `)
      .get(conversationId);

    const lastUncached = Number(latest?.last_input_tokens || 0);
    const lastCache = Number(latest?.last_cache_read_tokens || 0);
    const lastTotal = lastUncached + lastCache;
    const totalUncached = Number(agg?.total_in || 0);
    const totalCache = Number(agg?.total_cache || 0);
    const totalContext = totalUncached + totalCache;
    const totalOut = Number(agg?.total_out || 0);

    const lastHitRatePct = lastTotal > 0 ? Math.round((lastCache / lastTotal) * 1000) / 10 : null;
    const avgHitRatePct = totalContext > 0 ? Math.round((totalCache / totalContext) * 1000) / 10 : null;

    let status = "warmup";
    if (lastHitRatePct !== null) {
      if (lastHitRatePct >= 75) status = "hot";
      else if (lastHitRatePct >= 40) status = "warm";
      else if (lastTotal >= 15000) status = "cold";
    }

    let advisory = { level: "neutral", text: "" };
    if (status === "cold" && lastTotal >= 120000) {
      advisory = {
        level: "cold_high_ctx",
        text: "前缀缓存已冷，继续追问将全量重算高额上下文；建议勾选 1–3 条核心证据开新会话"
      };
    } else if (status === "hot") {
      advisory = {
        level: "hot_keep",
        text: "前缀缓存热命中中，同任务建议直接续做，避免过早 /compact 打断缓存"
      };
    }

    return {
      lastInputTokens: lastTotal,
      lastCacheReadTokens: lastCache,
      lastTotalContextTokens: lastTotal,
      lastUncachedInputTokens: lastUncached,
      lastHitRatePct,
      totalInputTokens: totalContext,
      totalCacheReadTokens: totalCache,
      totalContextTokens: totalContext,
      totalOutputTokens: totalOut,
      avgHitRatePct,
      status,
      advisory
    };
  }

  function verifyTurnFiles({ conversationId, turnIndex }) {
    const convId = String(conversationId || "").trim();
    const tIdx = Number(turnIndex);
    const database = ensureDb();
    if (!database || !convId || !Number.isFinite(tIdx)) {
      return { ok: false, error: "参数无效", files: [], summary: { total: 0, unchanged: 0, changed: 0, missing: 0, unresolved: 0, vaultPinnedCount: 0, hasDrift: false } };
    }
    const row = database
      .prepare("SELECT files_json, created_at_ms FROM turns WHERE conversation_id = ? AND turn_index = ?")
      .get(convId, tIdx);
    if (!row) {
      return { ok: false, error: "未找到该轮次", files: [], summary: { total: 0, unchanged: 0, changed: 0, missing: 0, unresolved: 0, vaultPinnedCount: 0, hasDrift: false } };
    }

    const snapRows = database
      .prepare("SELECT file_path, snap_mtime_ms, snap_size, snap_exists FROM turn_file_snapshots WHERE conversation_id = ? AND turn_index = ?")
      .all(convId, tIdx);
    const snapMap = new Map(snapRows.map((s) => [s.file_path, s]));
    const vaultSet = loadVaultPinnedSet(appDataDir);
    const rawFiles = JSON.parse(row.files_json || "[]");
    const createdAtMs = Number(row.created_at_ms || 0);

    const results = [];
    let unchanged = 0;
    let changed = 0;
    let missing = 0;
    let unresolved = 0;
    let vaultPinnedCount = 0;

    for (const rawPath of rawFiles) {
      const base = path.basename(rawPath);
      if (!isAbsoluteLocalPath(rawPath)) {
        unresolved += 1;
        results.push({
          path: rawPath,
          basename: base,
          status: "unresolved",
          label: "相对路径·需核对",
          vaultPinned: false,
          currentMtimeMs: 0,
          currentSize: 0
        });
        continue;
      }

      const abs = path.resolve(rawPath);
      const vaultPinned = vaultSet.has(abs);
      if (vaultPinned) vaultPinnedCount += 1;

      if (!fs.existsSync(abs)) {
        missing += 1;
        results.push({
          path: abs,
          basename: base,
          status: "missing",
          label: "来源缺失",
          vaultPinned,
          currentMtimeMs: 0,
          currentSize: 0
        });
        continue;
      }

      let st;
      try {
        st = fs.statSync(abs);
      } catch {
        missing += 1;
        results.push({
          path: abs,
          basename: base,
          status: "missing",
          label: "来源不可读",
          vaultPinned,
          currentMtimeMs: 0,
          currentSize: 0
        });
        continue;
      }

      const curMtime = Math.floor(st.mtimeMs || 0);
      const curSize = Number(st.size || 0);
      const snap = snapMap.get(abs);
      let isChanged = false;
      if (snap && snap.snap_exists === 1) {
        isChanged = curSize !== Number(snap.snap_size || 0) || curMtime > Number(snap.snap_mtime_ms || 0) + 1000;
      } else {
        isChanged = createdAtMs > 0 && curMtime > createdAtMs + 1000;
      }

      if (isChanged) {
        changed += 1;
        results.push({
          path: abs,
          basename: base,
          status: "changed",
          label: "文件已变更·待复核",
          vaultPinned,
          currentMtimeMs: curMtime,
          currentSize: curSize
        });
      } else {
        unchanged += 1;
        results.push({
          path: abs,
          basename: base,
          status: "unchanged",
          label: "文件未变",
          vaultPinned,
          currentMtimeMs: curMtime,
          currentSize: curSize
        });
      }
    }

    return {
      ok: true,
      conversationId: convId,
      turnIndex: tIdx,
      files: results,
      summary: {
        total: results.length,
        unchanged,
        changed,
        missing,
        unresolved,
        vaultPinnedCount,
        hasDrift: changed > 0 || missing > 0
      }
    };
  }

  function toggleTurnPin({ conversationId, turnIndex, customTitle, note, pinned } = {}) {
    const convId = String(conversationId || "").trim();
    const tIdx = Number(turnIndex);
    const database = ensureDb();
    if (!database || !convId || !Number.isFinite(tIdx)) {
      return { ok: false, error: "参数无效" };
    }
    const existing = database
      .prepare("SELECT * FROM turn_pins WHERE conversation_id = ? AND turn_index = ?")
      .get(convId, tIdx);
    const wantPinned = typeof pinned === "boolean" ? pinned : !existing;

    if (!wantPinned) {
      database.prepare("DELETE FROM turn_pins WHERE conversation_id = ? AND turn_index = ?").run(convId, tIdx);
      return { ok: true, conversationId: convId, turnIndex: tIdx, pinned: false, customTitle: "", note: "" };
    }

    const nextTitle = customTitle !== undefined
      ? String(customTitle || "").trim().slice(0, 100)
      : (existing?.custom_title || "");
    const nextNote = note !== undefined
      ? String(note || "").trim().slice(0, 240)
      : (existing?.note || "");
    const pinnedAt = existing?.pinned_at || Date.now();

    database.prepare(`
      INSERT INTO turn_pins (conversation_id, turn_index, custom_title, note, pinned_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(conversation_id, turn_index) DO UPDATE SET
        custom_title = excluded.custom_title,
        note = excluded.note
    `).run(convId, tIdx, nextTitle, nextNote, pinnedAt);

    return { ok: true, conversationId: convId, turnIndex: tIdx, pinned: true, customTitle: nextTitle, note: nextNote, pinnedAt };
  }

  function listSameProjectConversations(conversationId, { maxSessions = 15 } = {}) {
    const convId = String(conversationId || "").trim();
    if (!convId) {
      return { ok: false, scopeConfirmed: false, projectLabel: "", workspaceKeys: [], projectId: "", sessions: [] };
    }
    const all = parseSummaryRows(appDataDir);
    const current = all.find((r) => r.conversationId === convId) || null;
    const cap = Math.max(1, Math.min(30, Number(maxSessions) || 15));

    if (!current || (current.workspaceKeys.length === 0 && !current.projectId)) {
      return {
        ok: true,
        scopeConfirmed: false,
        projectLabel: current?.title || convId.slice(0, 8),
        workspaceKeys: [],
        projectId: "",
        sessions: [
          {
            conversationId: convId,
            title: current?.title || `会话 ${convId.slice(0, 8)}`,
            modifiedMs: current?.modifiedMs || Date.now(),
            isCurrent: true
          }
        ]
      };
    }

    const curWsSet = new Set(current.workspaceKeys);
    const matched = all.filter((r) => {
      if (r.conversationId === convId) return false;
      if (curWsSet.size > 0) {
        return r.workspaceKeys.some((k) => curWsSet.has(k));
      }
      return Boolean(current.projectId && r.projectId === current.projectId);
    });

    const sessions = [
      {
        conversationId: convId,
        title: current.title,
        modifiedMs: current.modifiedMs || Date.now(),
        isCurrent: true
      },
      ...matched.slice(0, Math.max(0, cap - 1)).map((r) => ({
        conversationId: r.conversationId,
        title: r.title,
        modifiedMs: r.modifiedMs,
        isCurrent: false
      }))
    ];

    const firstWs = current.workspaces[0] || "";
    const projectLabel = firstWs
      ? firstWs.split(/[\\/]/).filter(Boolean).pop() || firstWs
      : current.projectId || current.title;

    return {
      ok: true,
      scopeConfirmed: true,
      projectLabel,
      workspaceKeys: current.workspaceKeys,
      projectId: current.projectId,
      sessions
    };
  }

  function syncProjectConversations(conversationId, { maxSessions = 12, forceRebuild = false } = {}) {
    const convId = String(conversationId || "").trim();
    if (!convId) return { ok: false, error: "缺少 conversationId", sessions: [] };
    const scopeInfo = listSameProjectConversations(convId, { maxSessions });
    let syncedCount = 0;
    for (const s of scopeInfo.sessions) {
      try {
        const res = syncConversation(s.conversationId, { forceRebuild });
        if (res?.ok) syncedCount += 1;
      } catch {}
    }
    return {
      ok: true,
      scopeConfirmed: scopeInfo.scopeConfirmed,
      projectLabel: scopeInfo.projectLabel,
      syncedCount,
      sessionCount: scopeInfo.sessions.length,
      sessions: scopeInfo.sessions
    };
  }

  function buildExcerptPack({
    conversationId,
    turnIndices = [],
    selections = [],
    maxItems = 3,
    maxBytes = 1200,
    taskHint = ""
  } = {}) {
    const convId = String(conversationId || "").trim();
    const database = ensureDb();
    if (!database || !convId) {
      return { ok: false, error: "缺少 conversationId" };
    }

    const limitItems = Math.max(1, Math.min(8, Number(maxItems) || 3));
    const budgetBytes = Math.max(300, Math.min(4000, Number(maxBytes) || 1200));

    // 归属白名单：仅允许当前会话或同项目已确认会话，严禁越权打包其他项目
    const scopeInfo = listSameProjectConversations(convId, { maxSessions: 30 });
    const allowedConvIds = new Set(scopeInfo.sessions.map((s) => s.conversationId));
    allowedConvIds.add(convId);

    const rawPairs = [];
    if (Array.isArray(selections) && selections.length > 0) {
      for (const sel of selections) {
        const cid = String(sel?.conversationId || convId).trim();
        const tid = Number(sel?.turnIndex);
        if (allowedConvIds.has(cid) && Number.isFinite(tid) && tid > 0) {
          rawPairs.push({ conversationId: cid, turnIndex: tid });
        }
      }
    } else {
      for (const tidRaw of Array.isArray(turnIndices) ? turnIndices : []) {
        const tid = Number(tidRaw);
        if (Number.isFinite(tid) && tid > 0) {
          rawPairs.push({ conversationId: convId, turnIndex: tid });
        }
      }
    }

    const seenKeys = new Set();
    const uniquePairs = [];
    for (const p of rawPairs) {
      const k = `${p.conversationId}:${p.turnIndex}`;
      if (!seenKeys.has(k)) {
        seenKeys.add(k);
        uniquePairs.push(p);
      }
    }

    uniquePairs.sort((a, b) => {
      const aCur = a.conversationId === convId ? 0 : 1;
      const bCur = b.conversationId === convId ? 0 : 1;
      if (aCur !== bCur) return aCur - bCur;
      if (a.conversationId !== b.conversationId) return a.conversationId.localeCompare(b.conversationId);
      return a.turnIndex - b.turnIndex;
    });

    if (!uniquePairs.length) {
      return { ok: false, error: "请先勾选至少 1 条有效轮次记录" };
    }

    const chosen = uniquePairs.slice(0, limitItems);
    const vaultSet = loadVaultPinnedSet(appDataDir);
    const pinsByConv = new Map();
    const getPinInfo = (cid, tid) => {
      if (!pinsByConv.has(cid)) pinsByConv.set(cid, loadPinsMap(database, cid));
      return pinsByConv.get(cid).get(tid) || null;
    };

    const rows = [];
    for (const pair of chosen) {
      const r = database
        .prepare("SELECT * FROM turns WHERE conversation_id = ? AND turn_index = ?")
        .get(pair.conversationId, pair.turnIndex);
      if (r) rows.push(r);
    }

    const evNames = {
      user_confirm: "用户确认",
      tool_verified: "工具实测",
      tool_called: "曾调用·结果未核",
      assistant_note: "助手历史陈述"
    };

    const header = "[历史证据包 · 仅作历史出处参考，改动代码前须 read_file 核实当前源码]";
    const cleanHint = String(taskHint || "").replace(/\s+/g, " ").trim().slice(0, 160);
    const footer = cleanHint ? `\n当前任务: ${cleanHint}` : "";

    const itemEntries = [];
    let totalDriftFiles = 0;
    let totalMissingFiles = 0;

    for (const r of rows) {
      const cid = r.conversation_id;
      const formatted = formatTurnRow(r, 0, getPinInfo(cid, r.turn_index), vaultSet);
      const verifyRes = verifyTurnFiles({ conversationId: cid, turnIndex: r.turn_index });
      const sum = verifyRes.summary || { changed: 0, missing: 0, unchanged: 0 };
      totalDriftFiles += sum.changed;
      totalMissingFiles += sum.missing;

      let driftTag = "文件未变";
      if (sum.missing > 0 && sum.changed > 0) driftTag = `⚠含${sum.missing}缺失/${sum.changed}变更`;
      else if (sum.missing > 0) driftTag = `✕含${sum.missing}来源缺失`;
      else if (sum.changed > 0) driftTag = `⚠含${sum.changed}文件已变更待复核`;
      else if ((verifyRes.files || []).length === 0) driftTag = "无本地绝对文件";

      const filePart = (verifyRes.files || [])
        .slice(0, 3)
        .map((f) => {
          const mark = f.status === "missing" ? "(缺失)" : f.status === "changed" ? "(⚠待复核)" : f.status === "unchanged" ? "(未变)" : "(相对)";
          return `${f.basename}${mark}`;
        })
        .join(", ");

      itemEntries.push({
        conversationId: cid,
        turnIndex: formatted.turnIndex,
        evLabel: evNames[formatted.primaryEvidence] || "助手历史陈述",
        tsLabel: formatStaticTimestamp(formatted.createdAtMs),
        driftTag,
        title: formatted.displayTitle,
        summary: formatted.summary,
        cite: `conv:${cid.slice(0, 8)} transcript.jsonl#L${formatted.lineStart}-L${formatted.lineEnd}`,
        filePart,
        pinned: formatted.pinned,
        verifySummary: sum
      });
    }

    const renderPackWithBodyCap = (bodyCap) => {
      const blocks = [header];
      itemEntries.forEach((it, idx) => {
        const rawBody = it.summary && it.summary !== it.title ? `${it.title} — ${it.summary}` : it.title;
        const body = rawBody.length > bodyCap ? rawBody.slice(0, Math.max(20, bodyCap - 1)) + "…" : rawBody;
        const pinPrefix = it.pinned ? "★" : "";
        let line = `${idx + 1}. [${pinPrefix}${it.evLabel} · Turn#${it.turnIndex} · ${it.tsLabel} · ${it.driftTag}] ${body}\n   出处: ${it.cite}`;
        if (it.filePart) line += `\n   文件: ${it.filePart}`;
        blocks.push(line);
      });
      return blocks.join("\n") + footer;
    };

    let text = "";
    let truncated = false;
    for (const cap of [180, 120, 80, 50, 32]) {
      const cand = renderPackWithBodyCap(cap);
      if (Buffer.byteLength(cand, "utf8") <= budgetBytes) {
        text = cand;
        truncated = cap < 180;
        break;
      }
      text = cand;
    }

    if (Buffer.byteLength(text, "utf8") > budgetBytes) {
      const safe = truncateUtf8Safe(text, budgetBytes);
      text = safe.text;
      truncated = true;
    }

    const utf8Bytes = Buffer.byteLength(text, "utf8");
    return {
      ok: true,
      text,
      utf8Bytes,
      maxBytes: budgetBytes,
      estimatedTokens: estimateTokens(text),
      itemCount: itemEntries.length,
      totalRequested: uniquePairs.length,
      maxItems: limitItems,
      overDefaultItems: uniquePairs.length > 3,
      overDefaultBudget: budgetBytes > 1200,
      truncated,
      items: itemEntries,
      driftSummary: {
        changedFiles: totalDriftFiles,
        missingFiles: totalMissingFiles,
        hasDrift: totalDriftFiles > 0 || totalMissingFiles > 0
      }
    };
  }

  function searchTurns({
    conversationId,
    query = "",
    evidenceType = "all",
    pinnedOnly = false,
    scope = "session",
    limit = 60
  } = {}) {
    const t0 = performance.now();
    const convId = String(conversationId || "").trim();
    const database = ensureDb();
    if (!database || !convId) {
      return { ok: false, items: [], elapsedMs: 0, total: 0 };
    }

    const maxRows = Math.max(1, Math.min(200, Number(limit) || 60));
    const q = String(query || "").trim();
    const evFilter = String(evidenceType || "all").trim();
    const onlyPinned = Boolean(pinnedOnly);
    const wantProject = scope === "project";

    let targetConvIds = [convId];
    let scopeUsed = "session";
    let scopeFallback = false;
    let projectLabel = "";
    const sessionTitleMap = new Map([[convId, "当前会话"]]);

    if (wantProject) {
      const scopeInfo = listSameProjectConversations(convId, { maxSessions: 15 });
      projectLabel = scopeInfo.projectLabel || "";
      if (scopeInfo.scopeConfirmed && scopeInfo.sessions.length > 1) {
        scopeUsed = "project";
        targetConvIds = scopeInfo.sessions.map((s) => s.conversationId);
        for (const s of scopeInfo.sessions) {
          sessionTitleMap.set(s.conversationId, s.isCurrent ? "当前会话" : s.title);
        }
      } else {
        scopeFallback = true;
      }
    }

    for (const cid of targetConvIds) {
      const tp = resolveTranscriptPath(appDataDir, cid);
      if (tp && fs.existsSync(tp)) {
        try { syncConversation(cid); } catch {}
      }
    }

    const convPh = targetConvIds.map(() => "?").join(",");
    const pinsByConv = new Map();
    for (const cid of targetConvIds) {
      pinsByConv.set(cid, loadPinsMap(database, cid));
    }
    const vaultSet = loadVaultPinnedSet(appDataDir);

    const decorateItem = (formatted) => ({
      ...formatted,
      sessionTitle: sessionTitleMap.get(formatted.conversationId) || formatted.conversationId.slice(0, 8),
      isCurrentSession: formatted.conversationId === convId
    });

    if (!q) {
      let rows;
      if (onlyPinned) {
        const pinnedWhere = [];
        const params = [];
        for (const cid of targetConvIds) {
          const pKeys = Array.from(pinsByConv.get(cid)?.keys() || []);
          if (pKeys.length) {
            pinnedWhere.push(`(conversation_id = ? AND turn_index IN (${pKeys.map(() => "?").join(",")}))`);
            params.push(cid, ...pKeys);
          }
        }
        if (!pinnedWhere.length) {
          return {
            ok: true,
            scopeUsed,
            scopeFallback,
            projectLabel,
            sessionCount: targetConvIds.length,
            items: [],
            total: 0,
            elapsedMs: Math.round((performance.now() - t0) * 100) / 100
          };
        }
        rows = database
          .prepare(`SELECT * FROM turns WHERE ${pinnedWhere.join(" OR ")} ORDER BY created_at_ms DESC, turn_index DESC LIMIT ?`)
          .all(...params, maxRows * 2);
      } else {
        rows = database
          .prepare(`SELECT * FROM turns WHERE conversation_id IN (${convPh}) ORDER BY CASE WHEN conversation_id = ? THEN 0 ELSE 1 END, created_at_ms DESC, turn_index DESC LIMIT ?`)
          .all(...targetConvIds, convId, maxRows * 2);
      }
      const filtered = [];
      for (const r of rows) {
        const pinInfo = pinsByConv.get(r.conversation_id)?.get(r.turn_index) || null;
        const formatted = decorateItem(formatTurnRow(r, 0, pinInfo, vaultSet));
        if (onlyPinned && !formatted.pinned) continue;
        if (evFilter !== "all" && !formatted.evidenceTypes.includes(evFilter)) continue;
        filtered.push(formatted);
        if (filtered.length >= maxRows) break;
      }
      filtered.sort((a, b) => {
        if ((b.pinned ? 1 : 0) !== (a.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
        if (a.isCurrentSession !== b.isCurrentSession) return a.isCurrentSession ? -1 : 1;
        return b.createdAtMs - a.createdAtMs || b.turnIndex - a.turnIndex;
      });
      return {
        ok: true,
        scopeUsed,
        scopeFallback,
        projectLabel,
        sessionCount: targetConvIds.length,
        items: filtered,
        total: filtered.length,
        elapsedMs: Math.round((performance.now() - t0) * 100) / 100
      };
    }

    const scores = new Map();
    const bump = (cid, turnIndex, pts) => {
      const k = `${cid}:${turnIndex}`;
      scores.set(k, (scores.get(k) || 0) + pts);
    };

    const qLower = q.toLowerCase();
    const exactRows = database
      .prepare(`SELECT DISTINCT conversation_id, turn_index FROM turn_entities WHERE conversation_id IN (${convPh}) AND value_lower = ?`)
      .all(...targetConvIds, qLower);
    for (const r of exactRows) bump(r.conversation_id, r.turn_index, 120);

    const likePattern = `%${qLower.replace(/[%_]/g, "\\$&")}%`;
    const prefixRows = database
      .prepare(`SELECT DISTINCT conversation_id, turn_index FROM turn_entities WHERE conversation_id IN (${convPh}) AND value_lower LIKE ? ESCAPE '\\' LIMIT 120`)
      .all(...targetConvIds, likePattern);
    for (const r of prefixRows) bump(r.conversation_id, r.turn_index, 65);

    const codeTokens = splitCodeTokens(q);
    const ftsTextExpr = buildFtsMatchExpr(codeTokens);
    if (ftsTextExpr) {
      try {
        const ftsRows = database
          .prepare(`SELECT conversation_id, turn_index FROM turns_fts WHERE conversation_id IN (${convPh}) AND text_tokens MATCH ? LIMIT 180`)
          .all(...targetConvIds, ftsTextExpr);
        for (const r of ftsRows) bump(r.conversation_id, r.turn_index, 45);
      } catch {}
    }

    const cjkBigrams = extractCjkBigrams(q);
    const ftsCjkExpr = buildFtsMatchExpr(cjkBigrams);
    if (ftsCjkExpr) {
      try {
        const cjkRows = database
          .prepare(`SELECT conversation_id, turn_index FROM turns_fts WHERE conversation_id IN (${convPh}) AND cjk_bigrams MATCH ? LIMIT 180`)
          .all(...targetConvIds, ftsCjkExpr);
        for (const r of cjkRows) bump(r.conversation_id, r.turn_index, 55);
      } catch {}
    }

    // 单字中文或特殊符号兜底（仅限定当前已确认范围）
    if (scores.size === 0 || (/[\u4e00-\u9fff]/.test(q) && cjkBigrams.length === 0)) {
      const fallbackRows = database
        .prepare(`SELECT conversation_id, turn_index FROM turns WHERE conversation_id IN (${convPh}) AND (title LIKE ? OR summary LIKE ?) LIMIT 80`)
        .all(...targetConvIds, `%${q}%`, `%${q}%`);
      for (const r of fallbackRows) bump(r.conversation_id, r.turn_index, 30);
    }

    if (scores.size === 0) {
      return {
        ok: true,
        scopeUsed,
        scopeFallback,
        projectLabel,
        sessionCount: targetConvIds.length,
        items: [],
        total: 0,
        elapsedMs: Math.round((performance.now() - t0) * 100) / 100
      };
    }

    for (const cid of targetConvIds) {
      const pm = pinsByConv.get(cid);
      if (!pm) continue;
      for (const ti of pm.keys()) {
        const key = `${cid}:${ti}`;
        if (scores.has(key)) scores.set(key, scores.get(key) + 200);
      }
    }

    const rankedPairs = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxRows * 2);

    const byConv = new Map();
    for (const [k] of rankedPairs) {
      const sepIdx = k.lastIndexOf(":");
      const cid = k.slice(0, sepIdx);
      const tid = Number(k.slice(sepIdx + 1));
      if (!byConv.has(cid)) byConv.set(cid, []);
      byConv.get(cid).push(tid);
    }

    const turnRows = [];
    for (const [cid, tids] of byConv.entries()) {
      const ph = tids.map(() => "?").join(",");
      const rows = database
        .prepare(`SELECT * FROM turns WHERE conversation_id = ? AND turn_index IN (${ph})`)
        .all(cid, ...tids);
      turnRows.push(...rows);
    }

    const evWeight = { user_confirm: 15, tool_verified: 10, tool_called: 4, assistant_note: 1 };
    const dedupHashes = new Set();
    const out = [];

    for (const r of turnRows) {
      const key = `${r.conversation_id}:${r.turn_index}`;
      const baseScore = (scores.get(key) || 0) + (r.conversation_id === convId ? 10 : 0);
      const pinInfo = pinsByConv.get(r.conversation_id)?.get(r.turn_index) || null;
      const formatted = decorateItem(formatTurnRow(r, baseScore + (evWeight[r.primary_evidence] || 0), pinInfo, vaultSet));
      if (onlyPinned && !formatted.pinned) continue;
      if (evFilter !== "all" && !formatted.evidenceTypes.includes(evFilter)) continue;
      if (dedupHashes.has(formatted.contentHash)) continue;
      dedupHashes.add(formatted.contentHash);
      out.push(formatted);
    }

    out.sort((a, b) => b.score - a.score || b.createdAtMs - a.createdAtMs || b.turnIndex - a.turnIndex);
    const sliced = out.slice(0, maxRows);

    return {
      ok: true,
      scopeUsed,
      scopeFallback,
      projectLabel,
      sessionCount: targetConvIds.length,
      items: sliced,
      total: sliced.length,
      elapsedMs: Math.round((performance.now() - t0) * 100) / 100
    };
  }

  function getOverview(conversationId, { limit = 60 } = {}) {
    const convId = String(conversationId || "").trim();
    if (!convId) {
      return {
        ok: true,
        conversationId: "",
        title: "未检测到活动会话",
        schemaStatus: "empty",
        turnCount: 0,
        cacheStats: getSessionCacheStats(""),
        items: [],
        sqliteAvailable
      };
    }

    const syncRes = syncConversation(convId);
    if (!syncRes.ok && !syncRes.sqliteAvailable) {
      return {
        ok: false,
        sqliteAvailable: false,
        conversationId: convId,
        error: syncRes.error,
        items: []
      };
    }

    const title = readConversationTitleFromSummaries(appDataDir, convId) || `会话 ${convId.slice(0, 8)}`;
    const cacheStats = getSessionCacheStats(convId);
    const listRes = searchTurns({ conversationId: convId, limit });
    const database = ensureDb();
    const cursor = database.prepare("SELECT * FROM session_cursors WHERE conversation_id = ?").get(convId);

    return {
      ok: true,
      sqliteAvailable: true,
      conversationId: convId,
      title,
      transcriptPath: cursor?.transcript_path || syncRes.transcriptPath || "",
      schemaStatus: cursor?.schema_status || syncRes.schemaStatus || "ok",
      turnCount: cursor?.turn_count ?? listRes.total,
      byteOffset: cursor?.byte_offset || 0,
      updatedAt: cursor?.updated_at || Date.now(),
      cacheStats,
      items: listRes.items,
      elapsedMs: listRes.elapsedMs
    };
  }

  function getTurnDetail({ conversationId, turnIndex }) {
    const convId = String(conversationId || "").trim();
    const tIdx = Number(turnIndex);
    const database = ensureDb();
    if (!database || !convId || !Number.isFinite(tIdx)) {
      return { ok: false, error: "参数无效" };
    }
    const row = database
      .prepare("SELECT * FROM turns WHERE conversation_id = ? AND turn_index = ?")
      .get(convId, tIdx);
    if (!row) return { ok: false, error: "未找到该轮次记录" };

    const cursor = database
      .prepare("SELECT transcript_path FROM session_cursors WHERE conversation_id = ?")
      .get(convId);
    const transcriptPath = cursor?.transcript_path || resolveTranscriptPath(appDataDir, convId);
    const base = formatTurnRow(row);

    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
      return {
        ok: true,
        turn: base,
        userText: row.title,
        tools: [],
        assistantText: row.summary,
        transcriptMissing: true
      };
    }

    const span = Math.max(0, row.byte_end - row.byte_start);
    const readLen = Math.min(span, 512 * 1024);
    const fd = fs.openSync(transcriptPath, "r");
    let rawChunk = "";
    try {
      const buf = Buffer.allocUnsafe(readLen);
      const got = fs.readSync(fd, buf, 0, readLen, row.byte_start);
      rawChunk = buf.subarray(0, got).toString("utf8");
    } finally {
      fs.closeSync(fd);
    }

    let userText = "";
    const tools = [];
    const assistantParts = [];

    for (const line of rawChunk.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (obj.type === "USER_INPUT" && typeof obj.content === "string") {
        userText = cleanUserText(obj.content);
      } else if (obj.type === "PLANNER_RESPONSE") {
        if (Array.isArray(obj.tool_calls)) {
          for (const tc of obj.tool_calls) {
            tools.push({
              name: String(tc?.name || "unknown"),
              args: tc?.args || {},
              status: "called",
              outputPreview: ""
            });
          }
        }
        if (typeof obj.content === "string" && obj.content.trim()) {
          assistantParts.push(obj.content.trim());
        }
      } else if (obj.type === "GENERIC" && typeof obj.content === "string") {
        const resKind = classifyGenericResult(obj);
        const snippet = obj.content.replace(/\s+/g, " ").trim().slice(0, 480);
        const targetTool = tools.find((t) => !t.outputPreview) || tools[tools.length - 1];
        if (targetTool) {
          targetTool.status = resKind === "tool_verified" ? "verified" : "called";
          targetTool.outputPreview = snippet;
        }
      }
    }

    return {
      ok: true,
      turn: base,
      userText: userText || row.title,
      tools,
      assistantText: assistantParts.join("\n\n").slice(0, 2400) || row.summary,
      truncatedChunk: span > 512 * 1024,
      transcriptPath
    };
  }

  function resetIndex(conversationId = "") {
    const database = ensureDb();
    if (!database) return { ok: false, error: "SQLite 不可用" };
    const convId = String(conversationId || "").trim();
    database.exec("BEGIN IMMEDIATE");
    try {
      if (convId) {
        clearConversationRows(database, convId);
      } else {
        database.exec("DELETE FROM turn_file_snapshots; DELETE FROM turn_pins; DELETE FROM turn_entities; DELETE FROM turns_fts; DELETE FROM turns; DELETE FROM session_cursors;");
      }
      database.exec("COMMIT");
    } catch (err) {
      try { database.exec("ROLLBACK"); } catch {}
      throw err;
    }
    if (convId) {
      return syncConversation(convId, { forceRebuild: true });
    }
    return { ok: true, clearedAll: true };
  }

  function close() {
    if (db) {
      try { db.close(); } catch {}
      db = null;
    }
  }

  return {
    dbPath,
    syncConversation,
    listSameProjectConversations,
    syncProjectConversations,
    getOverview,
    searchTurns,
    getTurnDetail,
    getSessionCacheStats,
    verifyTurnFiles,
    toggleTurnPin,
    buildExcerptPack,
    resetIndex,
    close
  };
}
