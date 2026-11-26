import { existsSync, readdirSync, statSync, readFileSync, lstatSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const IGNORED_NAMES = new Set([
  ".git",
  "node_modules",
  ".venv",
  "__pycache__",
  ".gemini",
  ".DS_Store",
  "Thumbs.db",
  ".turbo",
  ".next",
  ".nuxt",
  "target",
  "dist",
  "build",
  ".cache"
]);

export const IMAGE_MIMES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp"
};

export const MEDIA_MIMES = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".mov": "video/quicktime"
};

const MAX_TEXT_BYTES = 512 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function toLocalPath(uriOrPath) {
  if (!uriOrPath) return null;
  const raw = String(uriOrPath).trim();
  if (!raw) return null;
  if (raw.startsWith("file://")) {
    try {
      return fileURLToPath(raw);
    } catch {
      const stripped = decodeURIComponent(raw.replace(/^file:\/\/\/?/i, ""));
      if (process.platform === "win32") return stripped;
      return stripped.startsWith("/") ? stripped : `/${stripped}`;
    }
  }
  return resolve(raw);
}

export function isInsideRoot(rootDir, targetPath) {
  const rootAbs = resolve(rootDir);
  const targetAbs = resolve(targetPath);
  if (targetAbs === rootAbs) return true;
  const prefix = rootAbs.endsWith(sep) ? rootAbs : rootAbs + sep;
  if (process.platform === "win32") {
    return targetAbs.toLowerCase().startsWith(prefix.toLowerCase());
  }
  return targetAbs.startsWith(prefix);
}

export function safeResolveInRoot(rootDir, relOrAbs) {
  if (!relOrAbs) return resolve(rootDir);
  const str = String(relOrAbs);
  const candidate = str.startsWith("file://")
    ? toLocalPath(str)
    : resolve(rootDir, str);
  if (!candidate || !isInsideRoot(rootDir, candidate)) {
    return null;
  }
  return candidate;
}

export function resolveWorkspaceRoot(data, fallbackRoot = null) {
  const candidates = [
    toLocalPath(data?.workspaceUri),
    toLocalPath(data?.root),
    fallbackRoot,
    process.env.ANTIGRAVITY_WORKSPACE_ROOT,
    process.env.WORKSPACE_ROOT
  ].filter(Boolean);

  for (const cand of candidates) {
    try {
      if (existsSync(cand) && statSync(cand).isDirectory()) {
        return resolve(cand);
      }
    } catch {}
  }
  return resolve(process.cwd());
}

function toPosixRel(rootDir, fullPath) {
  return relative(rootDir, fullPath).split(sep).join("/");
}

export function listDirectory({ root, dir = "", showHidden = false }) {
  const rootAbs = resolve(root);
  const targetDir = safeResolveInRoot(rootAbs, dir || ".");
  if (!targetDir) {
    return { error: "路径超出当前工作区范围", items: [], root: rootAbs, dir: "" };
  }
  if (!existsSync(targetDir)) {
    return { error: `目录不存在: ${targetDir}`, items: [], root: rootAbs, dir: "" };
  }

  let dirEntries;
  try {
    dirEntries = readdirSync(targetDir, { withFileTypes: true });
  } catch (err) {
    return { error: err.message || String(err), items: [], root: rootAbs, dir: "" };
  }

  const items = [];
  for (const entry of dirEntries) {
    const name = entry.name;
    if (!showHidden && (name.startsWith(".") || IGNORED_NAMES.has(name))) {
      continue;
    }
    const fullPath = join(targetDir, name);
    let isDirectory = entry.isDirectory();
    let size = 0;
    let modified = 0;
    try {
      const st = entry.isSymbolicLink() ? statSync(fullPath) : lstatSync(fullPath);
      isDirectory = st.isDirectory();
      size = isDirectory ? 0 : st.size;
      modified = st.mtimeMs;
    } catch {
      continue;
    }
    items.push({
      name,
      relPath: toPosixRel(rootAbs, fullPath),
      fullPath,
      uri: pathToFileURL(fullPath).href,
      isDirectory,
      size,
      modified,
      ext: isDirectory ? "" : extname(name).toLowerCase()
    });
  }

  items.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, "zh-Hans-CN", { numeric: true, sensitivity: "base" });
  });

  return {
    root: rootAbs,
    name: basename(rootAbs) || rootAbs,
    dir: toPosixRel(rootAbs, targetDir),
    items
  };
}

export function searchTree({ root, query = "", showHidden = false, limit = 260 }) {
  const rootAbs = resolve(root);
  const q = String(query || "").trim().toLowerCase();
  if (!q) return { root: rootAbs, query: "", items: [], truncated: false };

  const results = [];
  let truncated = false;
  const stack = [{ abs: rootAbs, depth: 0 }];
  const MAX_DEPTH = 10;

  while (stack.length > 0) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur.abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const name = entry.name;
      if (!showHidden && (name.startsWith(".") || IGNORED_NAMES.has(name))) continue;
      const fullPath = join(cur.abs, name);
      const isDirectory = entry.isDirectory();
      const relPath = toPosixRel(rootAbs, fullPath);

      if (name.toLowerCase().includes(q) || relPath.toLowerCase().includes(q)) {
        let size = 0;
        let modified = 0;
        try {
          const st = statSync(fullPath);
          size = isDirectory ? 0 : st.size;
          modified = st.mtimeMs;
        } catch {}
        results.push({
          name,
          relPath,
          fullPath,
          uri: pathToFileURL(fullPath).href,
          isDirectory,
          size,
          modified,
          ext: isDirectory ? "" : extname(name).toLowerCase()
        });
        if (results.length >= limit) {
          truncated = true;
          break;
        }
      }

      if (isDirectory && cur.depth < MAX_DEPTH && !entry.isSymbolicLink()) {
        stack.push({ abs: fullPath, depth: cur.depth + 1 });
      }
    }
    if (truncated) break;
  }

  results.sort((a, b) => {
    const aNameHit = a.name.toLowerCase().includes(q);
    const bNameHit = b.name.toLowerCase().includes(q);
    if (aNameHit !== bNameHit) return aNameHit ? -1 : 1;
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.relPath.localeCompare(b.relPath, "zh-Hans-CN", { numeric: true, sensitivity: "base" });
  });

  return { root: rootAbs, query: q, items: results, truncated };
}

export function isProbablyBinary(buf) {
  const len = Math.min(buf.length, 4096);
  if (len === 0) return false;
  let nullBytes = 0;
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) nullBytes++;
    if (nullBytes > 2) return true;
  }
  return false;
}

export function readPreviewPayload({ root, path: relPath, fullPath }) {
  const rootAbs = resolve(root);
  const target = fullPath && isInsideRoot(rootAbs, fullPath)
    ? resolve(fullPath)
    : safeResolveInRoot(rootAbs, relPath);

  if (!target) return { error: "路径超出工作区边界，已拒绝访问" };
  if (!existsSync(target)) return { error: `文件不存在: ${target}` };

  const st = statSync(target);
  if (st.isDirectory()) return { kind: "directory", name: basename(target), fullPath: target, size: 0 };

  const ext = extname(target).toLowerCase();
  const base = {
    name: basename(target),
    relPath: toPosixRel(rootAbs, target),
    fullPath: target,
    uri: pathToFileURL(target).href,
    ext,
    size: st.size,
    modified: st.mtimeMs
  };

  if (IMAGE_MIMES[ext]) {
    if (st.size > MAX_IMAGE_BYTES) {
      return { ...base, kind: "binary", reason: `图片体积 ${(st.size / 1048576).toFixed(1)} MB 超过 8 MB 限制，请原生打开` };
    }
    const b64 = readFileSync(target).toString("base64");
    return { ...base, kind: "image", mime: IMAGE_MIMES[ext], dataUrl: `data:${IMAGE_MIMES[ext]};base64,${b64}` };
  }

  if (MEDIA_MIMES[ext]) {
    return {
      ...base,
      kind: MEDIA_MIMES[ext].startsWith("video/") ? "video" : "audio",
      mime: MEDIA_MIMES[ext]
    };
  }

  const probe = readFileSync(target);
  if (isProbablyBinary(probe)) {
    return { ...base, kind: "binary", reason: "二进制文件，点击上方按钮在原生标签或系统默认应用中打开" };
  }

  const truncated = probe.length > MAX_TEXT_BYTES;
  const content = (truncated ? probe.subarray(0, MAX_TEXT_BYTES) : probe).toString("utf8");
  const previewKind =
    ext === ".md" || ext === ".markdown"
      ? "markdown"
      : ext === ".csv" || ext === ".tsv"
      ? "csv"
      : ext === ".json"
      ? "json"
      : "code";

  return { ...base, kind: previewKind, content, truncated };
}
