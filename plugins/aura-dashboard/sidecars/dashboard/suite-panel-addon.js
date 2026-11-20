(function () {
  if (window.__ag_suite_panel_addon_v1) return;
  window.__ag_suite_panel_addon_v1 = true;

  const apiFetch = (path, opts) =>
    window.sidecar && typeof window.sidecar.fetch === "function"
      ? window.sidecar.fetch(path, opts)
      : fetch(path, opts);

  function showToast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(window.__ag_suite_toast_timer);
    window.__ag_suite_toast_timer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function injectStyles() {
    if (document.getElementById("ag-suite-addon-style")) return;
    const style = document.createElement("style");
    style.id = "ag-suite-addon-style";
    style.textContent = `
      .ag-suite-card {
        background: var(--aura-card, #1e1f20);
        border: 1px solid var(--aura-border, rgba(255,255,255,0.08));
        border-radius: 12px;
        padding: 14px 16px;
        margin-bottom: 14px;
      }
      .ag-suite-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
      }
      .ag-suite-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--aura-fg, #e3e3e3);
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .ag-suite-sub {
        font-size: 11.5px;
        color: var(--aura-muted, #9aa0a6);
      }
      .ag-suite-badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        background: rgba(138, 180, 248, 0.14);
        color: #8ab4f8;
        border: 1px solid rgba(138, 180, 248, 0.28);
      }
      .ag-suite-badge.ok {
        background: rgba(52, 168, 83, 0.14);
        color: #81c995;
        border-color: rgba(129, 201, 149, 0.28);
      }
      .ag-suite-badge.warn {
        background: rgba(251, 188, 5, 0.14);
        color: #fdd663;
        border-color: rgba(253, 214, 99, 0.30);
      }
      .ag-suite-btn {
        appearance: none;
        border: 1px solid rgba(138, 180, 248, 0.30);
        background: rgba(66, 133, 244, 0.14);
        color: #a8c7fa;
        border-radius: 8px;
        padding: 5px 11px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 140ms ease, border-color 140ms ease, transform 120ms ease;
      }
      .ag-suite-btn:hover {
        background: rgba(66, 133, 244, 0.24);
        border-color: rgba(138, 180, 248, 0.55);
      }
      .ag-suite-btn:disabled {
        opacity: 0.55;
        cursor: default;
      }
      .ag-suite-btn.primary {
        background: linear-gradient(135deg, #4285f4, #9b72cb);
        border-color: transparent;
        color: #ffffff;
      }
      .ag-suite-btn.ghost {
        background: transparent;
        border-color: var(--aura-border, rgba(255,255,255,0.12));
        color: var(--aura-muted, #9aa0a6);
      }
      .ag-suite-seg {
        display: inline-flex;
        gap: 4px;
        padding: 3px;
        border-radius: 9px;
        background: rgba(255,255,255,0.04);
        border: 1px solid var(--aura-border, rgba(255,255,255,0.08));
      }
      .ag-suite-seg button {
        appearance: none;
        border: none;
        background: transparent;
        color: var(--aura-muted, #9aa0a6);
        font-size: 12px;
        padding: 5px 11px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 140ms ease;
      }
      .ag-suite-seg button.active {
        background: rgba(138, 180, 248, 0.18);
        color: #a8c7fa;
        font-weight: 600;
      }
      .ag-suite-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 0;
        border-top: 1px solid var(--aura-border, rgba(255,255,255,0.06));
      }
      .ag-suite-row:first-of-type { border-top: none; padding-top: 2px; }
      .ag-quota-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
        gap: 10px;
      }
      .ag-quota-item {
        background: rgba(255,255,255,0.025);
        border: 1px solid var(--aura-border, rgba(255,255,255,0.07));
        border-radius: 10px;
        padding: 10px 12px;
      }
      .ag-quota-bar-bg {
        height: 5px;
        border-radius: 999px;
        background: rgba(255,255,255,0.08);
        overflow: hidden;
        margin: 7px 0 5px;
      }
      .ag-quota-bar-fill {
        height: 100%;
        border-radius: 999px;
        transition: width 300ms ease;
      }
      .ag-update-banner {
        display: none;
        background: linear-gradient(135deg, rgba(66,133,244,0.14), rgba(155,114,203,0.14));
        border: 1px solid rgba(138, 180, 248, 0.35);
        border-radius: 12px;
        padding: 12px 14px;
        margin-bottom: 14px;
      }
      .ag-update-banner.show { display: block; }
      .ag-update-list {
        margin: 6px 0 10px 16px;
        padding: 0;
        font-size: 12px;
        color: var(--aura-fg, #e3e3e3);
        line-height: 1.55;
      }
    `;
    document.head.appendChild(style);
  }

  function formatResetTime(iso) {
    if (!iso) return "";
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "";
    const diff = t - Date.now();
    if (diff <= 0) return "即将重置";
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (days > 0) return `${days}天${hrs % 24}小时后重置`;
    if (hrs > 0) return `${hrs}小时${mins % 60}分后重置`;
    return `${mins}分钟后重置`;
  }

  function renderQuotaCard(container, quotaData) {
    const body = container.querySelector("#ag-quota-body");
    if (!body) return;
    if (!quotaData || !Array.isArray(quotaData.groups) || quotaData.groups.length === 0) {
      body.innerHTML = `<div class="ag-suite-sub">正在等待宿主窗口同步当前账号模型额度池（约数秒内自动更新）...</div>`;
      return;
    }
    const itemsHtml = quotaData.groups
      .map((g) => {
        const pct = typeof g.pct === "number" ? Math.max(0, Math.min(100, Math.round(g.pct))) : null;
        const color = pct === null ? "#8ab4f8" : pct <= 15 ? "#f28b82" : pct <= 40 ? "#fdd663" : "#81c995";
        const resetTxt = formatResetTime(g.resetTime);
        return `
          <div class="ag-quota-item">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
              <span style="font-size:12px;font-weight:600;color:var(--aura-fg,#e3e3e3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${g.label}</span>
              <span style="font-size:12px;font-weight:700;color:${color};font-family:var(--aura-font-mono);">${pct !== null ? pct + "%" : "--"}</span>
            </div>
            <div class="ag-quota-bar-bg">
              <div class="ag-quota-bar-fill" style="width:${pct !== null ? pct : 0}%;background:${color};"></div>
            </div>
            <div class="ag-suite-sub" style="display:flex;justify-content:space-between;font-size:10.5px;">
              <span>${g.modelsCount ? g.modelsCount + " 个模型" : "共享额度池"}</span>
              <span>${resetTxt || ""}</span>
            </div>
          </div>
        `;
      })
      .join("");
    body.innerHTML = `<div class="ag-quota-grid">${itemsHtml}</div>`;
    const meta = container.querySelector("#ag-quota-meta");
    if (meta && quotaData.planName) {
      meta.textContent = `${quotaData.planName}${quotaData.email ? " · " + quotaData.email : ""}`;
    }
  }

  function mountAnalyticsAddon() {
    const view = document.getElementById("view-analytics");
    if (!view || document.getElementById("ag-suite-overview-wrap")) return;

    const wrap = document.createElement("div");
    wrap.id = "ag-suite-overview-wrap";
    wrap.innerHTML = `
      <div id="ag-suite-update-banner" class="ag-update-banner">
        <div class="ag-suite-head" style="margin-bottom:4px;">
          <div class="ag-suite-title">
            <span>发现主题与扩展套件新版本</span>
            <span id="ag-upd-ver-badge" class="ag-suite-badge">v--</span>
          </div>
          <div style="display:flex;gap:6px;">
            <button id="ag-btn-banner-update" class="ag-suite-btn primary" type="button">一键在线更新</button>
            <button id="ag-btn-banner-dismiss" class="ag-suite-btn ghost" type="button">忽略此版本</button>
          </div>
        </div>
        <ul id="ag-upd-highlights" class="ag-update-list"></ul>
      </div>

      <div class="ag-suite-card" id="ag-suite-quota-card">
        <div class="ag-suite-head">
          <div>
            <div class="ag-suite-title">
              <span>模型额度池与快捷 CLI</span>
              <span id="ag-quota-meta" class="ag-suite-badge">Gemini 套件</span>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button id="ag-btn-overview-cli" class="ag-suite-btn" type="button">&gt;_ 启动 agy CLI</button>
          </div>
        </div>
        <div id="ag-quota-body"><div class="ag-suite-sub">正在读取模型额度池...</div></div>
      </div>
    `;
    view.insertBefore(wrap, view.firstChild);

    wrap.querySelector("#ag-btn-overview-cli")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const res = await apiFetch("/api/launch-cli", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
        const j = await res.json();
        showToast(j.ok ? `已拉起终端 (${j.terminal || "CLI"})：${j.cwd}` : `启动失败：${j.error || "未知错误"}`);
      } catch {
        showToast("启动 CLI 请求失败");
      } finally {
        btn.disabled = false;
      }
    });

    const refreshQuota = async () => {
      try {
        const res = await apiFetch("/api/suite-quota", { method: "GET" });
        if (res.ok) {
          const j = await res.json();
          if (j.ok) renderQuotaCard(wrap, j.data);
        }
      } catch {}
    };
    refreshQuota();
    setInterval(refreshQuota, 15000);
  }

  function mountSettingsAddon() {
    const view = document.getElementById("view-settings");
    if (!view || document.getElementById("ag-suite-settings-card")) return;

    const card = document.createElement("div");
    card.id = "ag-suite-settings-card";
    card.className = "ag-suite-card";
    card.innerHTML = `
      <div class="ag-suite-head">
        <div>
          <div class="ag-suite-title">
            <span>防幻觉护栏、CLI 与 GitHub 更新中心</span>
            <span id="ag-settings-ver-badge" class="ag-suite-badge">v--</span>
          </div>
          <div class="ag-suite-sub">全平台原生插件规则（macOS Intel / Apple Silicon / Windows 通用，热更新不丢失）</div>
        </div>
      </div>

      <div class="ag-suite-row">
        <div>
          <div style="font-size:12.5px;font-weight:600;color:var(--aura-fg,#e3e3e3);">防幻觉与工程纪律规则 (rules/AGENTS.md)</div>
          <div id="ag-guardrail-desc" class="ag-suite-sub">未读禁猜・最小改动・edit_file 唯一锚点・诚实实测验证</div>
        </div>
        <div id="ag-guardrail-seg" class="ag-suite-seg">
          <button type="button" data-tier="off">关闭</button>
          <button type="button" data-tier="standard">标准</button>
          <button type="button" data-tier="strict">严格 (推荐)</button>
        </div>
      </div>

      <div class="ag-suite-row">
        <div>
          <div style="font-size:12.5px;font-weight:600;color:var(--aura-fg,#e3e3e3);">&gt;_ agy CLI 快捷启动器</div>
          <div id="ag-cli-status-desc" class="ag-suite-sub">正在检测本机 agy CLI 路径...</div>
        </div>
        <button id="ag-btn-settings-cli" class="ag-suite-btn" type="button">打开 CLI 终端</button>
      </div>

      <div class="ag-suite-row">
        <div>
          <div style="font-size:12.5px;font-weight:600;color:var(--aura-fg,#e3e3e3);">GitHub 套件版本同步</div>
          <div id="ag-update-status-desc" class="ag-suite-sub">仓库：Songh0918/antigravity-ui-suggestion</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button id="ag-btn-check-update" class="ag-suite-btn ghost" type="button">检查更新</button>
          <button id="ag-btn-do-update" class="ag-suite-btn primary" type="button" style="display:none;">立即一键更新</button>
        </div>
      </div>
    `;
    view.insertBefore(card, view.firstChild);

    // 1. 防幻觉开关绑定
    const seg = card.querySelector("#ag-guardrail-seg");
    const descEl = card.querySelector("#ag-guardrail-desc");
    const syncGuardrails = async () => {
      try {
        const res = await apiFetch("/api/suite-guardrails", { method: "GET" });
        const j = await res.json();
        if (j.ok) {
          seg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.tier === j.tier));
          descEl.textContent = j.enabled
            ? `已生效（${j.tier === "strict" ? "严格 5 项完整护栏" : "标准 3 项核心护栏"} · ${j.bytes} 字节）`
            : "当前已关闭（仅使用 Antigravity 默认行为）";
        }
      } catch {}
    };
    seg.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const tier = btn.dataset.tier;
        const res = await apiFetch("/api/suite-guardrails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier })
        });
        const j = await res.json();
        if (j.ok) {
          showToast(tier === "off" ? "已关闭防幻觉规则" : `已切换为「${tier === "strict" ? "严格防幻觉" : "标准防幻觉"}」并即时生效`);
          syncGuardrails();
        } else {
          showToast("规则切换失败：" + (j.error || ""));
        }
      });
    });
    syncGuardrails();

    // 2. CLI 路径探测与启动
    const cliDesc = card.querySelector("#ag-cli-status-desc");
    (async () => {
      try {
        const res = await apiFetch("/api/launch-cli", { method: "GET" });
        const j = await res.json();
        cliDesc.textContent = j.installed ? `已就绪：${j.cliPath}` : "未检测到 agy CLI，请先安装官方 agy CLI";
      } catch {}
    })();
    card.querySelector("#ag-btn-settings-cli")?.addEventListener("click", async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        const res = await apiFetch("/api/launch-cli", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
        const j = await res.json();
        showToast(j.ok ? `已启动 ${j.terminal || "CLI"}` : `启动失败：${j.error || ""}`);
      } finally {
        b.disabled = false;
      }
    });

    // 3. GitHub 更新检查与一键更新
    const applyUpdateUi = (info) => {
      if (!info || !info.ok) return;
      const verBadge = card.querySelector("#ag-settings-ver-badge");
      const updDesc = card.querySelector("#ag-update-status-desc");
      const doBtn = card.querySelector("#ag-btn-do-update");
      if (verBadge) verBadge.textContent = `v${info.currentVersion}`;

      if (info.hasUpdate) {
        if (updDesc) updDesc.textContent = `发现新版本 v${info.latestVersion}（当前 v${info.currentVersion}），点击右侧一键同步更新`;
        if (doBtn) doBtn.style.display = "inline-flex";
      } else {
        if (updDesc) updDesc.textContent = `已是最新版本 v${info.currentVersion} · Songh0918/antigravity-ui-suggestion`;
        if (doBtn) doBtn.style.display = "none";
      }

      const banner = document.getElementById("ag-suite-update-banner");
      if (banner) {
        if (info.shouldNotify) {
          banner.classList.add("show");
          const bVer = document.getElementById("ag-upd-ver-badge");
          if (bVer) bVer.textContent = `v${info.currentVersion} → v${info.latestVersion}`;
          const ul = document.getElementById("ag-upd-highlights");
          if (ul) {
            ul.innerHTML = (info.highlights || []).slice(0, 4).map((h) => `<li>${h}</li>`).join("");
          }
          banner.dataset.latestVer = info.latestVersion;
        } else {
          banner.classList.remove("show");
        }
      }
    };

    const runUpdateFlow = async (btn) => {
      if (btn) { btn.disabled = true; btn.textContent = "正在同步更新..."; }
      try {
        const res = await apiFetch("/api/suite-update/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update" })
        });
        const j = await res.json();
        if (j.ok) {
          showToast(`已成功同步至 v${j.updatedTo}，样式已热更新（完整插件改动重启后生效）`);
          const fresh = await (await apiFetch("/api/suite-update", { method: "GET" })).json();
          applyUpdateUi(fresh);
        } else {
          showToast("自动更新失败：" + (j.error || "请检查网络/代理"));
        }
      } catch {
        showToast("更新请求失败");
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = "一键在线更新"; }
      }
    };

    card.querySelector("#ag-btn-check-update")?.addEventListener("click", async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      b.textContent = "检查中...";
      try {
        const res = await apiFetch("/api/suite-update/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "check" })
        });
        const j = await res.json();
        applyUpdateUi(j);
        showToast(j.hasUpdate ? `发现新版本 v${j.latestVersion}！` : `当前已是最新版本 v${j.currentVersion}`);
      } finally {
        b.disabled = false;
        b.textContent = "检查更新";
      }
    });

    card.querySelector("#ag-btn-do-update")?.addEventListener("click", (e) => runUpdateFlow(e.currentTarget));
    document.getElementById("ag-btn-banner-update")?.addEventListener("click", (e) => runUpdateFlow(e.currentTarget));
    document.getElementById("ag-btn-banner-dismiss")?.addEventListener("click", async () => {
      const banner = document.getElementById("ag-suite-update-banner");
      const ver = banner?.dataset.latestVer || "";
      if (banner) banner.classList.remove("show");
      await apiFetch("/api/suite-update/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", version: ver })
      });
      showToast(`已忽略 v${ver} 更新提示`);
    });

    apiFetch("/api/suite-update", { method: "GET" })
      .then((r) => r.json())
      .then(applyUpdateUi)
      .catch(() => {});
  }

  function boot() {
    injectStyles();
    mountAnalyticsAddon();
    mountSettingsAddon();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
