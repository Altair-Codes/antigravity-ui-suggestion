import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import os from "node:os";

export function defaultDataDir() {
  return join(os.homedir(), ".gemini", "antigravity", "plugin_data", "gravity-vault");
}

export function defaultArchiveRoot() {
  return join(os.homedir(), "Documents", "GravityVault", "Archived");
}

function readJson(filePath, fallback) {
  try {
    if (!existsSync(filePath)) return fallback;
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  renameSync(tmp, filePath);
}

function isPlausibleLocalPath(p) {
  if (!p || typeof p !== "string") return false;
  if (process.platform !== "win32" && /^[A-Za-z]:[\\/]/.test(p)) return false;
  return true;
}

export function createVaultStore({
  dataDir = defaultDataDir(),
  legacyAppDataDir = join(os.homedir(), ".gemini", "antigravity")
} = {}) {
  mkdirSync(dataDir, { recursive: true });
  const configFile = join(dataDir, "config.json");
  const pinsFile = join(dataDir, "pins.json");
  const archivesFile = join(dataDir, "archives.json");
  const tombstonesFile = join(dataDir, "tombstones.json");
  const migratedFlag = join(dataDir, "migrated_from_file_launcher.flag");
  const manifestFile = join(dataDir, "PINNED_FILES_MANIFEST.md");

  function defaultConfig() {
    return {
      archiveRoot: defaultArchiveRoot(),
      defaultOpenAction: "sidebar", // "sidebar" | "preview" | "os"
      showCodeFiles: false,
      themeMode: "host"
    };
  }

  function loadConfig() {
    const raw = readJson(configFile, {});
    const def = defaultConfig();
    const archiveRoot = isPlausibleLocalPath(raw?.archiveRoot) && String(raw.archiveRoot).trim()
      ? resolve(String(raw.archiveRoot).trim())
      : def.archiveRoot;
    return {
      archiveRoot,
      defaultOpenAction: ["sidebar", "preview", "os"].includes(raw?.defaultOpenAction)
        ? raw.defaultOpenAction
        : def.defaultOpenAction,
      showCodeFiles: Boolean(raw?.showCodeFiles),
      themeMode: ["host", "dark", "light"].includes(raw?.themeMode) ? raw.themeMode : "host"
    };
  }

  function saveConfig(patch) {
    const cur = loadConfig();
    const next = {
      ...cur,
      ...(patch && typeof patch === "object" ? patch : {})
    };
    if (!isPlausibleLocalPath(next.archiveRoot) || !String(next.archiveRoot || "").trim()) {
      next.archiveRoot = cur.archiveRoot;
    } else {
      next.archiveRoot = resolve(String(next.archiveRoot).trim());
    }
    if (!["sidebar", "preview", "os"].includes(next.defaultOpenAction)) next.defaultOpenAction = cur.defaultOpenAction;
    next.showCodeFiles = Boolean(next.showCodeFiles);
    if (!["host", "dark", "light"].includes(next.themeMode)) next.themeMode = cur.themeMode;
    writeJsonAtomic(configFile, next);
    return next;
  }

  function loadPins() {
    const raw = readJson(pinsFile, {});
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  }

  function syncPinnedManifest(pinsMap) {
    const entries = Object.values(pinsMap || {});
    const lines = [
      "# 引力文库防压缩收藏清单 (PINNED FILES MANIFEST)",
      "",
      `> 更新时间: ${new Date().toISOString()} · 共 ${entries.length} 项受保护文件`,
      ""
    ];
    for (const item of entries) {
      lines.push(`- **${item.name || basename(item.path)}**: \`${item.path}\``);
    }
    lines.push("");
    mkdirSync(dirname(manifestFile), { recursive: true });
    writeFileSync(manifestFile, lines.join("\n"), "utf8");
  }

  function togglePin({ path: filePath, name, convId = "" }) {
    if (!filePath) return { ok: false, error: "缺少文件路径" };
    const abs = resolve(filePath);
    const pins = loadPins();
    let pinned = false;
    if (pins[abs]) {
      delete pins[abs];
      pinned = false;
    } else {
      pins[abs] = {
        path: abs,
        name: name || basename(abs),
        convId: convId || "",
        pinnedAt: Date.now()
      };
      pinned = true;
    }
    writeJsonAtomic(pinsFile, pins);
    syncPinnedManifest(pins);
    return { ok: true, pinned, count: Object.keys(pins).length, pins };
  }

  function loadArchives() {
    const raw = readJson(archivesFile, []);
    return Array.isArray(raw) ? raw : [];
  }

  function buildNonOverwritingDest(dateDir, fileName) {
    const ext = extname(fileName);
    const stem = ext ? fileName.slice(0, -ext.length) : fileName;
    let candidate = join(dateDir, fileName);
    let idx = 2;
    while (existsSync(candidate)) {
      candidate = join(dateDir, `${stem} (${idx})${ext}`);
      idx++;
    }
    return candidate;
  }

  function archiveFile(sourcePath) {
    if (!sourcePath) return { ok: false, error: "缺少源文件路径" };
    const abs = resolve(sourcePath);
    if (!existsSync(abs)) return { ok: false, error: `源文件不存在: ${abs}` };
    const st = statSync(abs);
    if (st.isDirectory()) return { ok: false, error: "暂不支持直接归档文件夹" };

    const cfg = loadConfig();
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const dateKey = `${yyyy}-${mm}-${dd}`;
    const targetDir = join(cfg.archiveRoot, dateKey);
    mkdirSync(targetDir, { recursive: true });

    const destPath = buildNonOverwritingDest(targetDir, basename(abs));
    copyFileSync(abs, destPath);

    const archives = loadArchives();
    const record = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: basename(destPath),
      sourcePath: abs,
      archivePath: destPath,
      dateKey,
      size: st.size,
      archivedAt: Date.now()
    };
    archives.unshift(record);
    writeJsonAtomic(archivesFile, archives);
    return { ok: true, record, totalArchived: archives.length };
  }

  function loadTombstones() {
    const raw = readJson(tombstonesFile, []);
    return new Set(Array.isArray(raw) ? raw : []);
  }

  function addTombstone(filePath) {
    if (!filePath) return { ok: false };
    const abs = resolve(filePath);
    const set = loadTombstones();
    set.add(abs);
    writeJsonAtomic(tombstonesFile, Array.from(set));

    const pins = loadPins();
    if (pins[abs]) {
      delete pins[abs];
      writeJsonAtomic(pinsFile, pins);
      syncPinnedManifest(pins);
    }
    return { ok: true };
  }

  function migrateLegacyData() {
    if (existsSync(migratedFlag)) return;
    try {
      const legacyCfg = readJson(join(legacyAppDataDir, "file_launcher_config.json"), null);
      if (legacyCfg && typeof legacyCfg === "object") {
        const cur = loadConfig();
        const patch = {};
        if (isPlausibleLocalPath(legacyCfg.archive_root || legacyCfg.archiveRoot)) {
          patch.archiveRoot = legacyCfg.archive_root || legacyCfg.archiveRoot;
        }
        if (Array.isArray(legacyCfg.pinned_files) && legacyCfg.pinned_files.length) {
          const pins = loadPins();
          for (const p of legacyCfg.pinned_files) {
            if (isPlausibleLocalPath(p) && !pins[p]) {
              pins[p] = { path: p, name: basename(p), convId: "", pinnedAt: Date.now() };
            }
          }
          writeJsonAtomic(pinsFile, pins);
          syncPinnedManifest(pins);
        }
        writeJsonAtomic(configFile, { ...cur, ...patch });
      }

      const legacyArch = readJson(join(legacyAppDataDir, "file_launcher_archive.json"), null);
      if (legacyArch) {
        const curArch = loadArchives();
        const existingPaths = new Set(curArch.map((x) => x.archivePath));
        const rows = Array.isArray(legacyArch)
          ? legacyArch
          : Array.isArray(legacyArch.entries)
          ? legacyArch.entries
          : Object.values(legacyArch || {});
        for (const r of rows) {
          const ap = r?.archive_path || r?.archivePath;
          const sp = r?.source_path || r?.sourcePath || ap;
          if (!ap || !isPlausibleLocalPath(ap) || existingPaths.has(ap)) continue;
          existingPaths.add(ap);
          curArch.push({
            id: `mig_${Math.random().toString(36).slice(2, 8)}`,
            name: r.name || basename(ap),
            sourcePath: sp,
            archivePath: ap,
            dateKey: r.date || r.dateKey || "legacy",
            size: Number(r.size) || 0,
            archivedAt: Number(r.archived_at || r.archivedAt) || Date.now()
          });
        }
        writeJsonAtomic(archivesFile, curArch);
      }

      const legacyDel = readJson(join(legacyAppDataDir, "file_launcher_deleted.json"), null);
      if (Array.isArray(legacyDel) && legacyDel.length) {
        const t = loadTombstones();
        for (const d of legacyDel) {
          if (typeof d === "string" && isPlausibleLocalPath(d)) t.add(d);
        }
        writeJsonAtomic(tombstonesFile, Array.from(t));
      }
      writeFileSync(migratedFlag, new Date().toISOString() + "\n", "utf8");
    } catch {}
  }

  migrateLegacyData();

  return {
    dataDir,
    manifestFile,
    loadConfig,
    saveConfig,
    loadPins,
    togglePin,
    loadArchives,
    archiveFile,
    loadTombstones,
    addTombstone
  };
}
