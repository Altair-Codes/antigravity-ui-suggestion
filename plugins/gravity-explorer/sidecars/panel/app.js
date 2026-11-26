/**
 * 引力目录 (Gravity Explorer) 前端交互引擎
 */
(function initGravityExplorer() {
  const api = (url, body) =>
    window.sidecar.fetch(url, {
      method: "POST",
      body: JSON.stringify(body || {})
    }).then((r) => r.json());

  const treeContainer = document.getElementById("gv-tree-container");
  const wsNameEl = document.getElementById("gv-ws-name");
  const wsPathEl = document.getElementById("gv-ws-path");
  const breadcrumbEl = document.getElementById("gv-breadcrumb");
  const countEl = document.getElementById("gv-status-count");
  const searchInput = document.getElementById("gv-search-input");
  const clearSearchBtn = document.getElementById("gv-btn-clear-search");
  const drawerEl = document.getElementById("gv-preview-drawer");
  const resizerEl = document.getElementById("gv-resizer");
  const prevNameEl = document.getElementById("gv-prev-name");
  const prevMetaEl = document.getElementById("gv-prev-meta");
  const prevBodyEl = document.getElementById("gv-prev-body");
  const ctxMenuEl = document.getElementById("gv-context-menu");
  const toastEl = document.getElementById("gv-toast");

  let currentRoot = "";
  let currentWorkspaceUri = "";
  let showHidden = false;
  let searchQuery = "";
  let expandedDirs = new Set();
  let dirCache = new Map(); // relDir -> items[]
  let visibleFlat = []; // { item, depth }
  let selectedPaths = new Map(); // relPath -> item
  let lastAnchorPath = "";
  let previewedItem = null;

  const BADGE_MAP = {
    ".md": ["M", "#4285F4"], ".markdown": ["M", "#4285F4"],
    ".js": ["JS", "#F59E0B"], ".mjs": ["JS", "#F59E0B"], ".cjs": ["JS", "#F59E0B"],
    ".ts": ["TS", "#3B82F6"], ".tsx": ["TSX", "#3B82F6"], ".jsx": ["JSX", "#06B6D4"],
    ".json": ["{}", "#8B5CF6"], ".py": ["PY", "#10B981"], ".go": ["GO", "#06B6D4"],
    ".rs": ["RS", "#EA4335"], ".java": ["JV", "#EF4444"], ".sh": ["SH", "#34A853"],
    ".css": ["CSS", "#EC4899"], ".html": ["HTML", "#F97316"], ".sql": ["SQL", "#6366F1"],
    ".yml": ["YML", "#A855F7"], ".yaml": ["YML", "#A855F7"],
    ".png": ["IMG", "#10B981"], ".jpg": ["IMG", "#10B981"], ".jpeg": ["IMG", "#10B981"],
    ".svg": ["SVG", "#F59E0B"], ".pdf": ["PDF", "#EA4335"], ".csv": ["CSV", "#10B981"]
  };

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(window.__gvToastTimer);
    window.__gvToastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
  }

  function formatDate(ms) {
    if (!ms) return "--";
    const d = new Date(ms);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${m}/${day} ${hh}:${mm}`;
  }

  function formatSize(bytes, isDir) {
    if (isDir) return "--";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  function getKind(ext, isDir) {
    if (isDir) return "文件夹";
    const map = {
      ".md": "Markdown", ".js": "JS 脚本", ".mjs": "ESM 模块", ".ts": "TypeScript",
      ".py": "Python", ".json": "JSON", ".css": "样式表", ".html": "网页",
      ".sh": "Shell", ".png": "PNG 图片", ".jpg": "JPEG 图片", ".svg": "SVG 矢量",
      ".pdf": "PDF 文稿", ".csv": "CSV 表格", ".txt": "纯文本"
    };
    return map[ext] || (ext ? `${ext.slice(1).toUpperCase()} 文件` : "文稿");
  }

  function iconHtml(ext, isDir) {
    if (isDir) {
      return `<svg width="16" height="16" viewBox="0 0 24 24"><defs><linearGradient id="gvDirIco" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#66c8ff"/><stop offset="100%" stop-color="#1e88e5"/></linearGradient></defs><path d="M2.5 6.5C2.5 5.12 3.62 4 5 4h4.2c.65 0 1.26.31 1.64.84l1.02 1.41c.19.26.49.42.81.42H19c1.38 0 2.5 1.12 2.5 2.5v8.33c0 1.38-1.12 2.5-2.5 2.5H5c-1.38 0-2.5-1.12-2.5-2.5V6.5z" fill="url(#gvDirIco)"/></svg>`;
    }
    const b = BADGE_MAP[ext] || ["DOC", "#64748B"];
    return `<span class="gv-badge-tag" style="background:${b[1]}">${b[0]}</span>`;
  }

  async function copyText(txt, toastMsg) {
    try { await navigator.clipboard.writeText(txt); }
    catch { await api("/api/clipboard", { text: txt }); }
    showToast(toastMsg || "已复制");
  }

  function formatMention(relPath) {
    return /[\s"'`]/.test(relPath) ? `@"${relPath}"` : `@${relPath}`;
  }

  async function openNative(item) {
    if (!item || item.isDirectory) return;
    try {
      if (window.sidecar?.ui?.toggleAuxPane) {
        await window.sidecar.ui.toggleAuxPane({ tabType: "fileView", uri: item.uri });
        return;
      }
    } catch {}
    await api("/api/open-native-tab", { root: currentRoot, fullPath: item.fullPath, path: item.relPath });
  }

  async function openPreview(item) {
    if (!item || item.isDirectory) return;
    previewedItem = item;
    drawerEl.hidden = false;
    resizerEl.hidden = false;
    prevNameEl.textContent = item.name;
    prevMetaEl.textContent = formatSize(item.size, false);
    prevBodyEl.innerHTML = '<div class="gv-empty">加载中...</div>';
    breadcrumbEl.textContent = item.fullPath;
    const payload = await api("/api/preview", { root: currentRoot, fullPath: item.fullPath, path: item.relPath });
    window.GravityPreview.render(prevBodyEl, payload, async (act) => {
      if (act === "open-tab") await openNative(item);
      if (act === "open-os") await api("/api/open-os", { root: currentRoot, fullPath: item.fullPath });
      if (act === "reveal") await api("/api/reveal", { root: currentRoot, fullPath: item.fullPath });
    });
  }

  function buildFlatList(dirRel, depth) {
    const list = dirCache.get(dirRel) || [];
    for (const item of list) {
      visibleFlat.push({ item, depth });
      if (item.isDirectory && expandedDirs.has(item.relPath)) {
        buildFlatList(item.relPath, depth + 1);
      }
    }
  }

  function renderTree() {
    if (searchQuery) {
      countEl.textContent = `${visibleFlat.length} 条匹配`;
    } else {
      visibleFlat = [];
      buildFlatList("", 0);
      countEl.textContent = `${visibleFlat.length} 个项目`;
    }

    if (visibleFlat.length === 0) {
      treeContainer.innerHTML = `<div class="gv-empty">${searchQuery ? "未找到匹配文件" : "目录为空"}</div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    for (const { item, depth } of visibleFlat) {
      const row = document.createElement("div");
      row.className = "gv-row" + (selectedPaths.has(item.relPath) ? " selected" : "");
      row.style.paddingLeft = `${depth * 14 + 8}px`;
      row.dataset.rel = item.relPath;
      row.innerHTML = `
        <div class="gv-name-cell">
          <span class="gv-expander ${item.isDirectory && expandedDirs.has(item.relPath) ? "open" : ""}">${item.isDirectory ? "▶" : ""}</span>
          <span class="gv-file-ico">${iconHtml(item.ext, item.isDirectory)}</span>
          <span class="gv-name-txt" title="${item.fullPath}">${item.name}</span>
        </div>
        <span class="gv-col-date">${formatDate(item.modified)}</span>
        <span class="gv-col-size">${formatSize(item.size, item.isDirectory)}</span>
        <span class="gv-col-kind">${getKind(item.ext, item.isDirectory)}</span>
        <div class="gv-row-actions">
          <button type="button" class="gv-row-act-btn" data-act="mention" title="复制 @引用">@</button>
          ${!item.isDirectory ? '<button type="button" class="gv-row-act-btn" data-act="tab" title="原生标签打开">↗</button>' : ""}
          <button type="button" class="gv-row-act-btn" data-act="reveal" title="在访达中显示">📁</button>
        </div>
      `;

      row.addEventListener("click", (e) => {
        const actBtn = e.target.closest("button[data-act]");
        if (actBtn) {
          e.stopPropagation();
          const a = actBtn.dataset.act;
          if (a === "mention") copyText(formatMention(item.relPath), `已复制 ${formatMention(item.relPath)}`);
          if (a === "tab") openNative(item);
          if (a === "reveal") api("/api/reveal", { root: currentRoot, fullPath: item.fullPath });
          return;
        }
        handleSelect(e, item);
      });

      row.addEventListener("dblclick", () => {
        if (item.isDirectory) toggleDir(item);
        else openNative(item);
      });

      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (!selectedPaths.has(item.relPath)) {
          selectedPaths.clear();
          selectedPaths.set(item.relPath, item);
          renderTree();
        }
        showContextMenu(e.clientX, e.clientY, item);
      });

      row.addEventListener("mousedown", (e) => {
        if (e.button !== 0 || e.target.closest("button")) return;
        startDragIfMoved(e, item);
      });

      frag.appendChild(row);
    }
    treeContainer.innerHTML = "";
    treeContainer.appendChild(frag);
  }

  async function toggleDir(item) {
    if (expandedDirs.has(item.relPath)) {
      expandedDirs.delete(item.relPath);
      renderTree();
      return;
    }
    expandedDirs.add(item.relPath);
    if (!dirCache.has(item.relPath)) {
      const res = await api("/api/tree", { root: currentRoot, dir: item.relPath, showHidden });
      dirCache.set(item.relPath, res.items || []);
    }
    renderTree();
  }

  async function handleSelect(e, item) {
    if (e.metaKey || e.ctrlKey) {
      if (selectedPaths.has(item.relPath)) selectedPaths.delete(item.relPath);
      else selectedPaths.set(item.relPath, item);
    } else if (e.shiftKey && lastAnchorPath) {
      const idx1 = visibleFlat.findIndex((x) => x.item.relPath === lastAnchorPath);
      const idx2 = visibleFlat.findIndex((x) => x.item.relPath === item.relPath);
      if (idx1 >= 0 && idx2 >= 0) {
        const [lo, hi] = idx1 <= idx2 ? [idx1, idx2] : [idx2, idx1];
        for (let i = lo; i <= hi; i++) selectedPaths.set(visibleFlat[i].item.relPath, visibleFlat[i].item);
      }
    } else {
      selectedPaths.clear();
      selectedPaths.set(item.relPath, item);
      lastAnchorPath = item.relPath;
      if (item.isDirectory) await toggleDir(item);
      else await openPreview(item);
      return;
    }
    lastAnchorPath = item.relPath;
    renderTree();
  }

  function startDragIfMoved(downEvent, item) {
    const startX = downEvent.clientX;
    const startY = downEvent.clientY;
    let started = false;
    const items = selectedPaths.has(item.relPath) ? Array.from(selectedPaths.values()) : [item];
    const uris = items.map((x) => x.uri);
    const plain = items.map((x) => formatMention(x.relPath));
    const label = items.length > 1 ? `引用 ${items.length} 个项目` : item.name;

    const onMove = (e) => {
      if (!started && Math.hypot(e.clientX - startX, e.clientY - startY) > 6) {
        started = true;
        window.parent.postMessage({ type: "GV_DRAG_START", uris, plainPaths: plain, label, clientX: e.clientX, clientY: e.clientY }, "*");
      }
      if (started) {
        window.parent.postMessage({ type: "GV_DRAG_MOVE", clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey }, "*");
      }
    };
    const onUp = (e) => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
      if (started) {
        window.parent.postMessage({ type: "GV_DRAG_END", clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey }, "*");
      }
    };
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
  }

  function showContextMenu(x, y, item) {
    const items = [
      !item.isDirectory ? { label: "在主标签页打开", act: () => openNative(item) } : null,
      !item.isDirectory ? { label: "在底部抽屉预览", act: () => openPreview(item) } : null,
      { label: "复制 @引用", act: () => copyText(formatMention(item.relPath), "已复制 @引用") },
      { label: "复制绝对路径", act: () => copyText(item.fullPath, "已复制绝对路径") },
      { sep: true },
      { label: "用系统默认应用打开", act: () => api("/api/open-os", { root: currentRoot, fullPath: item.fullPath }) },
      { label: "在访达 / 文件夹中显示", act: () => api("/api/reveal", { root: currentRoot, fullPath: item.fullPath }) },
      { sep: true },
      { label: "移至废纸篓...", danger: true, act: () => askTrash(item) }
    ].filter(Boolean);

    ctxMenuEl.innerHTML = items
      .map((it, idx) =>
        it.sep
          ? '<div class="gv-ctx-sep"></div>'
          : `<button type="button" class="gv-ctx-item ${it.danger ? "danger" : ""}" data-idx="${idx}">${it.label}</button>`
      )
      .join("");
    ctxMenuEl.hidden = false;
    ctxMenuEl.style.left = `${Math.min(x, window.innerWidth - 190)}px`;
    ctxMenuEl.style.top = `${Math.min(y, window.innerHeight - 240)}px`;
    ctxMenuEl.querySelectorAll("button[data-idx]").forEach((b) => {
      b.addEventListener("click", () => {
        ctxMenuEl.hidden = true;
        items[Number(b.dataset.idx)]?.act?.();
      });
    });
  }

  let trashTarget = null;
  function askTrash(item) {
    trashTarget = item;
    document.getElementById("gv-trash-name").textContent = item.relPath;
    document.getElementById("gv-trash-modal").hidden = false;
  }

  document.getElementById("gv-trash-cancel").addEventListener("click", () => {
    document.getElementById("gv-trash-modal").hidden = true;
  });
  document.getElementById("gv-trash-confirm").addEventListener("click", async () => {
    document.getElementById("gv-trash-modal").hidden = true;
    if (!trashTarget) return;
    const res = await api("/api/trash", { root: currentRoot, path: trashTarget.relPath });
    if (res.ok) {
      showToast(`已移至废纸篓: ${trashTarget.name}`);
      await refreshAll();
    } else {
      showToast(`移除失败: ${res.error || "未知错误"}`);
    }
  });

  document.addEventListener("click", (e) => {
    if (!ctxMenuEl.contains(e.target)) ctxMenuEl.hidden = true;
  });

  async function refreshAll() {
    dirCache.clear();
    if (searchQuery) {
      const res = await api("/api/search", { root: currentRoot, workspaceUri: currentWorkspaceUri, query: searchQuery, showHidden });
      visibleFlat = (res.items || []).map((item) => ({ item, depth: 0 }));
      renderTree();
      return;
    }
    const res = await api("/api/tree", { root: currentRoot, workspaceUri: currentWorkspaceUri, dir: "", showHidden });
    currentRoot = res.root || currentRoot;
    wsNameEl.textContent = res.name || currentRoot;
    wsPathEl.textContent = currentRoot;
    breadcrumbEl.textContent = currentRoot;
    dirCache.set("", res.items || []);
    for (const d of Array.from(expandedDirs)) {
      const sub = await api("/api/tree", { root: currentRoot, dir: d, showHidden });
      dirCache.set(d, sub.items || []);
    }
    renderTree();
  }

  let searchTimer = null;
  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value.trim();
    clearSearchBtn.hidden = !searchQuery;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refreshAll, 160);
  });
  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    searchQuery = "";
    clearSearchBtn.hidden = true;
    refreshAll();
  });

  document.getElementById("gv-btn-refresh").addEventListener("click", refreshAll);
  document.getElementById("gv-btn-collapse").addEventListener("click", () => {
    expandedDirs.clear();
    renderTree();
  });
  document.getElementById("gv-btn-hidden").addEventListener("click", (e) => {
    showHidden = !showHidden;
    e.currentTarget.classList.toggle("active", showHidden);
    refreshAll();
  });
  document.getElementById("gv-btn-reveal-root").addEventListener("click", () => {
    api("/api/reveal", { root: currentRoot, fullPath: currentRoot });
  });
  document.getElementById("gv-btn-switch-root").addEventListener("click", () => {
    const bar = document.getElementById("gv-path-bar");
    bar.hidden = !bar.hidden;
    if (!bar.hidden) {
      const inp = document.getElementById("gv-manual-path");
      inp.value = currentRoot;
      inp.focus();
    }
  });
  document.getElementById("gv-btn-cancel-path").addEventListener("click", () => {
    document.getElementById("gv-path-bar").hidden = true;
  });
  document.getElementById("gv-btn-apply-path").addEventListener("click", async () => {
    const next = document.getElementById("gv-manual-path").value.trim();
    document.getElementById("gv-path-bar").hidden = true;
    if (!next) return;
    currentRoot = next;
    currentWorkspaceUri = "";
    expandedDirs.clear();
    await refreshAll();
  });

  document.getElementById("gv-prev-close").addEventListener("click", () => {
    drawerEl.hidden = true;
    resizerEl.hidden = true;
  });
  document.getElementById("gv-prev-open-tab").addEventListener("click", () => previewedItem && openNative(previewedItem));
  document.getElementById("gv-prev-copy-at").addEventListener("click", () => {
    if (previewedItem) copyText(formatMention(previewedItem.relPath), `已复制 ${formatMention(previewedItem.relPath)}`);
  });

  // 拖拽调整预览高度
  resizerEl.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = drawerEl.getBoundingClientRect().height;
    const onMove = (ev) => {
      const nextH = Math.max(120, Math.min(window.innerHeight * 0.65, startH + (startY - ev.clientY)));
      drawerEl.style.height = `${nextH}px`;
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });

  (async function boot() {
    try {
      if (window.sidecar?.onWorkspaceChange) {
        window.sidecar.onWorkspaceChange(async (uris) => {
          currentWorkspaceUri = Array.isArray(uris) && uris[0] ? uris[0] : "";
          const ws = await api("/api/workspace", { workspaceUri: currentWorkspaceUri });
          currentRoot = ws.root || currentRoot;
          await refreshAll();
        });
      } else {
        const ws = await api("/api/workspace", {});
        currentRoot = ws.root || "";
        await refreshAll();
      }
    } catch {
      await refreshAll();
    }
  })();
})();
