/**
 * 引力文库 (Gravity Vault) 前端交互引擎
 */
(function initGravityVault() {
  const api = (url, body, method = "POST") =>
    window.sidecar.fetch(url, {
      method,
      body: method === "GET" ? undefined : JSON.stringify(body || {})
    }).then((r) => r.json());

  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const listEl = document.getElementById("gvv-list");
  const scopeEl = document.getElementById("gvv-scope");
  const searchEl = document.getElementById("gvv-search");
  const sortEl = document.getElementById("gvv-sort");
  const codeBtn = document.getElementById("gvv-btn-code");
  const archBtn = document.getElementById("gvv-btn-archived");
  const selBtn = document.getElementById("gvv-btn-select-mode");
  const batchBar = document.getElementById("gvv-batch-bar");
  const menuEl = document.getElementById("gvv-action-menu");
  const toastEl = document.getElementById("gvv-toast");

  let state = { items: [], archives: [], config: {} };
  let workspaceUris = [];
  let sourceFilter = "all";
  let typeFilter = "all";
  let showArchivedView = false;
  let selectMode = false;
  let selectedIds = new Set();
  let previewTarget = null;

  const CAT_COLORS = {
    Markdown: "#4285F4", Word: "#2563EB", PPT: "#EA580C", 表格: "#16A34A",
    PDF: "#DC2626", 图片: "#0D9488", 音视频: "#9333EA", 代码: "#6366F1",
    文本: "#4B5563", 压缩包: "#CA8A04", 文件夹: "#0284C7", 其他: "#64748B"
  };

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(window.__gvvToast);
    window.__gvvToast = setTimeout(() => { toastEl.hidden = true; }, 2600);
  }

  function relTime(ms) {
    if (!ms) return "";
    const diff = Date.now() - ms;
    const min = Math.floor(diff / 60000);
    if (min < 1) return "刚刚";
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    return `${Math.floor(hr / 24)}d`;
  }

  function fmtSize(sz) {
    if (!sz) return "";
    if (sz < 1024) return `${sz}B`;
    if (sz < 1048576) return `${(sz / 1024).toFixed(1)}K`;
    return `${(sz / 1048576).toFixed(1)}M`;
  }

  function formatRef(item) {
    return `@${item.name}（${item.path}）`;
  }

  async function copyRefText(txt, toast) {
    try { await navigator.clipboard.writeText(txt); }
    catch { await api("/api/clipboard", { text: txt }); }
    showToast(toast || "已复制引用");
  }

  async function openSidebar(item) {
    if (!item || !item.exists) return showToast("文件不存在");
    if (item.canSidecarOpen && window.sidecar?.ui?.toggleAuxPane) {
      await window.sidecar.ui.toggleAuxPane({ tabType: "fileView", uri: item.uri });
      return;
    }
    await openBuiltInPreview(item);
  }

  async function openBuiltInPreview(item) {
    previewTarget = item;
    document.getElementById("gvv-prev-title").textContent = item.name;
    const bodyEl = document.getElementById("gvv-prev-body");
    bodyEl.innerHTML = '<div class="gvv-empty">读取中...</div>';
    document.getElementById("gvv-preview-modal").hidden = false;

    const res = await api("/api/preview", { path: item.path });
    if (!res.ok) {
      bodyEl.innerHTML = `<div class="gvv-empty">${esc(res.error || "无法预览")}</div>`;
      return;
    }
    if (res.kind === "image") {
      bodyEl.innerHTML = `<div style="text-align:center;"><img src="${res.dataUrl}" style="max-width:100%;max-height:72vh;border-radius:8px;" /></div>`;
      return;
    }
    if (res.kind === "binary") {
      bodyEl.innerHTML = `<div class="gvv-empty"><p>${esc(res.reason)}</p><button id="gvv-bin-os-btn" class="gvv-mini-btn primary">用系统默认应用打开</button></div>`;
      bodyEl.querySelector("#gvv-bin-os-btn")?.addEventListener("click", () => api("/api/open-os", { path: item.path }));
      return;
    }
    bodyEl.innerHTML = `<pre class="gvv-prev-pre">${esc(res.content || "")}</pre>`;
  }

  async function handleDefaultClick(item) {
    const mode = state.config?.defaultOpenAction || "sidebar";
    if (mode === "os") {
      await api("/api/open-os", { path: item.path });
    } else if (mode === "preview") {
      await openBuiltInPreview(item);
    } else {
      await openSidebar(item);
    }
  }

  function filteredItems() {
    const q = searchEl.value.trim().toLowerCase();
    const list = (state.items || []).filter((it) => {
      if (sourceFilter === "pinned" && !it.pinned) return false;
      if (sourceFilter === "generated" && it.source !== "generated" && it.source !== "modified") return false;
      if (sourceFilter === "sent" && it.source !== "sent") return false;
      if (typeFilter !== "all" && it.category !== typeFilter) return false;
      if (q && !it.name.toLowerCase().includes(q) && !it.path.toLowerCase().includes(q) && !(it.convTitle || "").toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
    const sortBy = sortEl.value;
    if (sortBy === "name") list.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
    else if (sortBy === "type") list.sort((a, b) => a.category.localeCompare(b.category, "zh-Hans-CN") || b.mtimeMs - a.mtimeMs);
    else list.sort((a, b) => (a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : b.mtimeMs - a.mtimeMs));
    return list;
  }

  function renderTypePills() {
    const wrap = document.getElementById("gvv-type-pills");
    const counts = new Map();
    for (const it of state.items || []) {
      counts.set(it.category, (counts.get(it.category) || 0) + 1);
    }
    const cats = Array.from(counts.entries());
    if (cats.length <= 1) {
      wrap.innerHTML = "";
      return;
    }
    wrap.innerHTML =
      `<button type="button" class="gvv-pill ${typeFilter === "all" ? "active" : ""}" data-cat="all">全部类型</button>` +
      cats
        .map(([c, n]) => `<button type="button" class="gvv-pill ${typeFilter === c ? "active" : ""}" data-cat="${esc(c)}">${esc(c)} ${n}</button>`)
        .join("");
    wrap.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => {
        typeFilter = b.dataset.cat || "all";
        render();
      });
    });
  }

  function render() {
    document.getElementById("gvv-cnt-all").textContent = String((state.items || []).length);
    document.getElementById("gvv-cnt-pin").textContent = String(state.pinnedCount || 0);
    document.getElementById("gvv-arch-cnt").textContent = String(state.archivedCount || 0);
    codeBtn.textContent = state.config?.showCodeFiles ? "含代码" : "仅文档";
    codeBtn.classList.toggle("active", Boolean(state.config?.showCodeFiles));
    archBtn.classList.toggle("active", showArchivedView);
    selBtn.classList.toggle("active", selectMode);
    batchBar.hidden = !selectMode;
    document.getElementById("gvv-batch-info").textContent = `已选 ${selectedIds.size} 项`;

    if (showArchivedView) {
      const arch = state.archives || [];
      if (arch.length === 0) {
        listEl.innerHTML = '<div class="gvv-empty">暂无按日归档记录</div>';
        return;
      }
      listEl.innerHTML = arch
        .map(
          (a) => `
          <div class="gvv-row">
            <span class="gvv-badge" style="background:#0284C7">归档</span>
            <div class="gvv-main" data-arch-path="${esc(a.archivePath)}">
              <div class="gvv-name-line"><span class="gvv-name">${esc(a.name)}</span></div>
              <div class="gvv-sub">${esc(a.dateKey)} · ${esc(a.archivePath)}</div>
            </div>
            <div class="gvv-row-btns">
              <button class="gvv-mini-btn" data-rev="${esc(a.archivePath)}">定位</button>
            </div>
          </div>`
        )
        .join("");
      listEl.querySelectorAll(".gvv-main[data-arch-path]").forEach((el) => {
        el.addEventListener("click", () => api("/api/open-os", { path: el.dataset.archPath }));
      });
      listEl.querySelectorAll("button[data-rev]").forEach((b) => {
        b.addEventListener("click", () => api("/api/reveal", { path: b.dataset.rev }));
      });
      return;
    }

    renderTypePills();
    const list = filteredItems();
    if (list.length === 0) {
      listEl.innerHTML = '<div class="gvv-empty">当前筛选条件下暂无文档</div>';
      return;
    }

    listEl.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (const item of list) {
      const row = document.createElement("div");
      row.className = "gvv-row" + (!item.exists ? " missing" : "");
      const bg = CAT_COLORS[item.category] || "#64748B";
      row.innerHTML = `
        ${selectMode ? `<input type="checkbox" class="gvv-chk" ${selectedIds.has(item.path) ? "checked" : ""} />` : ""}
        <span class="gvv-badge" style="background:${bg}">${esc(item.category.slice(0, 3))}</span>
        <div class="gvv-main" title="${esc(item.path)}">
          <div class="gvv-name-line">
            ${item.pinned ? '<span class="gvv-pin-star">★</span>' : ""}
            <span class="gvv-name">${esc(item.name)}</span>
          </div>
          <div class="gvv-sub">${!item.exists ? "已从磁盘移除 · " : ""}${relTime(item.mtimeMs)} ${fmtSize(item.size)}${item.convTitle ? " · " + esc(item.convTitle) : ""}</div>
        </div>
        <div class="gvv-row-btns">
          <button type="button" class="gvv-mini-btn" data-act="copy">复制引用</button>
          <button type="button" class="gvv-mini-btn" data-act="menu">打开方式 ▾</button>
        </div>
      `;

      row.querySelector(".gvv-chk")?.addEventListener("change", (e) => {
        if (e.currentTarget.checked) selectedIds.add(item.path);
        else selectedIds.delete(item.path);
        document.getElementById("gvv-batch-info").textContent = `已选 ${selectedIds.size} 项`;
      });

      row.querySelector(".gvv-main").addEventListener("click", () => handleDefaultClick(item));
      row.querySelector('[data-act="copy"]').addEventListener("click", (e) => {
        e.stopPropagation();
        copyRefText(formatRef(item), `已复制 ${item.name} 的 @引用`);
      });
      row.querySelector('[data-act="menu"]').addEventListener("click", (e) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        showActionMenu(r.left - 80, r.bottom + 4, item);
      });
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        showActionMenu(e.clientX, e.clientY, item);
      });
      frag.appendChild(row);
    }
    listEl.appendChild(frag);
  }

  function showActionMenu(x, y, item) {
    const actions = [
      item.exists ? { label: "在侧边栏分栏打开", fn: () => openSidebar(item) } : null,
      item.exists ? { label: "文库内置轻量预览", fn: () => openBuiltInPreview(item) } : null,
      item.exists ? { label: "用默认软件打开", fn: () => api("/api/open-os", { path: item.path }) } : null,
      item.exists ? { label: "在访达 / 文件夹中显示", fn: () => api("/api/reveal", { path: item.path }) } : null,
      { sep: true },
      { label: "复制 @引用", fn: () => copyRefText(formatRef(item), "已复制 @引用") },
      { label: "复制完整路径", fn: () => copyRefText(item.path, "已复制完整路径") },
      {
        label: item.pinned ? "取消 ★ 防压缩收藏" : "加入 ★ 防压缩收藏",
        fn: async () => {
          await api("/api/pin", { path: item.path, name: item.name, conversationId: item.convId });
          await loadState();
        }
      },
      item.exists
        ? {
            label: "📦 按日归档副本",
            fn: async () => {
              const res = await api("/api/archive", { path: item.path });
              showToast(res.ok ? `已归档至 ${res.record.dateKey}` : res.error || "归档失败");
              await loadState();
            }
          }
        : null,
      { sep: true },
      {
        label: "移除此条记录",
        fn: async () => {
          await api("/api/forget", { path: item.path });
          await loadState();
        }
      }
    ].filter(Boolean);

    menuEl.innerHTML = actions
      .map((a, i) => (a.sep ? '<div class="gvv-menu-sep"></div>' : `<button class="gvv-menu-item" data-i="${i}">${a.label}</button>`))
      .join("");
    menuEl.hidden = false;
    menuEl.style.left = `${Math.max(8, Math.min(x, window.innerWidth - 185))}px`;
    menuEl.style.top = `${Math.max(8, Math.min(y, window.innerHeight - 260))}px`;
    menuEl.querySelectorAll("button[data-i]").forEach((b) => {
      b.addEventListener("click", () => {
        menuEl.hidden = true;
        actions[Number(b.dataset.i)]?.fn?.();
      });
    });
  }

  document.addEventListener("click", (e) => {
    if (!menuEl.contains(e.target)) menuEl.hidden = true;
  });

  async function loadState() {
    const res = await api("/api/state", {
      conversationId: window.sidecar?.conversationId || "",
      workspaceUris,
      scope: scopeEl.value || "session"
    });
    if (res && res.ok) {
      state = res;
      render();
    }
  }

  scopeEl.addEventListener("change", () => { showArchivedView = false; loadState(); });
  searchEl.addEventListener("input", render);
  sortEl.addEventListener("change", render);
  document.getElementById("gvv-btn-refresh").addEventListener("click", loadState);

  document.querySelectorAll("#gvv-source-pills button").forEach((b) => {
    b.addEventListener("click", () => {
      showArchivedView = false;
      sourceFilter = b.dataset.src || "all";
      document.querySelectorAll("#gvv-source-pills button").forEach((x) => x.classList.toggle("active", x === b));
      render();
    });
  });

  codeBtn.addEventListener("click", async () => {
    const next = !(state.config?.showCodeFiles);
    await api("/api/settings", { showCodeFiles: next });
    await loadState();
  });

  archBtn.addEventListener("click", () => {
    showArchivedView = !showArchivedView;
    render();
  });

  selBtn.addEventListener("click", () => {
    selectMode = !selectMode;
    if (!selectMode) selectedIds.clear();
    render();
  });

  document.getElementById("gvv-batch-copy").addEventListener("click", () => {
    const picked = (state.items || []).filter((i) => selectedIds.has(i.path));
    if (!picked.length) return showToast("请先勾选文件");
    copyRefText(picked.map(formatRef).join("\n"), `已复制 ${picked.length} 条 @引用`);
  });

  document.getElementById("gvv-batch-pin").addEventListener("click", async () => {
    const picked = (state.items || []).filter((i) => selectedIds.has(i.path));
    for (const it of picked) await api("/api/pin", { path: it.path, name: it.name, conversationId: it.convId });
    showToast(`已更新 ${picked.length} 项收藏状态`);
    await loadState();
  });

  document.getElementById("gvv-batch-archive").addEventListener("click", async () => {
    const picked = (state.items || []).filter((i) => selectedIds.has(i.path) && i.exists);
    let okCnt = 0;
    for (const it of picked) {
      const r = await api("/api/archive", { path: it.path });
      if (r.ok) okCnt++;
    }
    showToast(`已按日归档 ${okCnt} 份文件`);
    await loadState();
  });

  document.getElementById("gvv-prev-close").addEventListener("click", () => {
    document.getElementById("gvv-preview-modal").hidden = true;
  });
  document.getElementById("gvv-prev-sidecar").addEventListener("click", () => {
    if (previewTarget) openSidebar(previewTarget);
  });
  document.getElementById("gvv-prev-os").addEventListener("click", () => {
    if (previewTarget) api("/api/open-os", { path: previewTarget.path });
  });

  document.getElementById("gvv-btn-settings").addEventListener("click", () => {
    document.getElementById("gvv-set-arch-root").value = state.config?.archiveRoot || "";
    document.getElementById("gvv-set-open-act").value = state.config?.defaultOpenAction || "sidebar";
    document.getElementById("gvv-set-show-code").checked = Boolean(state.config?.showCodeFiles);
    document.getElementById("gvv-settings-modal").hidden = false;
  });
  document.getElementById("gvv-set-close").addEventListener("click", () => {
    document.getElementById("gvv-settings-modal").hidden = true;
  });
  document.getElementById("gvv-set-save").addEventListener("click", async () => {
    await api("/api/settings", {
      archiveRoot: document.getElementById("gvv-set-arch-root").value.trim(),
      defaultOpenAction: document.getElementById("gvv-set-open-act").value,
      showCodeFiles: document.getElementById("gvv-set-show-code").checked
    });
    document.getElementById("gvv-settings-modal").hidden = true;
    showToast("设置已保存");
    await loadState();
  });

  (async function boot() {
    try {
      if (window.sidecar?.onWorkspaceChange) {
        window.sidecar.onWorkspaceChange((uris) => {
          workspaceUris = Array.isArray(uris) ? uris : [];
          loadState();
        });
      } else {
        await loadState();
      }
    } catch {
      await loadState();
    }
  })();
})();
