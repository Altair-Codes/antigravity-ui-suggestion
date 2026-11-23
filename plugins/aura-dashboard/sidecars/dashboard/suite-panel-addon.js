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
    window.__ag_suite_toast_timer = setTimeout(() => el.classList.remove("show"), 3600);
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
        flex-wrap: wrap;
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
        transition: background-color 140ms ease, border-color 140ms ease;
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
        flex-wrap: wrap;
      }
      .ag-suite-row:first-of-type { border-top: none; padding-top: 2px; }
      .ag-suite-select, .ag-suite-input {
        background: rgba(255,255,255,0.05);
        border: 1px solid var(--aura-border, rgba(255,255,255,0.12));
        color: var(--aura-fg, #e3e3e3);
        border-radius: 8px;
        padding: 5px 9px;
        font-size: 12px;
        outline: none;
      }
      .ag-suite-select:focus, .ag-suite-input:focus {
        border-color: #8ab4f8;
      }
      .ag-quota-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
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
        margin: 5px 0 4px;
      }
      .ag-quota-bar-fill {
        height: 100%;
        border-radius: 999px;
        transition: width 300ms ease;
      }
      .ag-quota-subrow {
        margin-top: 8px;
        padding-top: 6px;
        border-top: 1px dashed rgba(255,255,255,0.07);
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
      .ag-as-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 8px;
        width: 100%;
      }
      .ag-as-order-list {
        width: 100%;
        margin-top: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .ag-as-order-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 7px 10px;
        border-radius: 9px;
        background: rgba(255,255,255,0.03);
        border: 1px solid var(--aura-border, rgba(255,255,255,0.08));
        font-size: 12px;
      }
      .ag-as-order-item.is-next {
        border-color: rgba(138, 180, 248, 0.36);
        background: rgba(66, 133, 244, 0.08);
      }
      .ag-as-idx {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 24px;
        height: 20px;
        padding: 0 5px;
        border-radius: 6px;
        font-family: var(--aura-font-mono);
        font-size: 11px;
        font-weight: 700;
        background: rgba(138, 180, 248, 0.16);
        color: #a8c7fa;
      }
      .ag-as-mini-btn {
        appearance: none;
        border: 1px solid var(--aura-border, rgba(255,255,255,0.12));
        background: rgba(255,255,255,0.04);
        color: var(--aura-fg, #e3e3e3);
        border-radius: 6px;
        padding: 2px 7px;
        font-size: 11px;
        cursor: pointer;
      }
      .ag-as-mini-btn:hover:not(:disabled) {
        border-color: rgba(138, 180, 248, 0.5);
        color: #a8c7fa;
      }
      .ag-as-mini-btn:disabled {
        opacity: 0.35;
        cursor: default;
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

  function pctColor(pct) {
    if (pct === null || pct === undefined) return "#8ab4f8";
    return pct <= 15 ? "#f28b82" : pct <= 40 ? "#fdd663" : "#81c995";
  }

  function renderQuotaCard(container, quotaData) {
    const body = container.querySelector("#ag-quota-body");
    if (!body) return;
    if (!quotaData || !Array.isArray(quotaData.groups) || quotaData.groups.length === 0) {
      body.innerHTML = `<div class="ag-suite-sub">正在等待宿主窗口同步当前账号每周 / 5小时额度池（数秒内自动更新）...</div>`;
      return;
    }
    const itemsHtml = quotaData.groups
      .map((g) => {
        const wPct = typeof g.weeklyPct === "number" ? Math.max(0, Math.min(100, Math.round(g.weeklyPct))) : (typeof g.pct === "number" ? Math.round(g.pct) : null);
        const hPct = typeof g.fiveHourPct === "number" ? Math.max(0, Math.min(100, Math.round(g.fiveHourPct))) : null;
        const wCol = pctColor(wPct);
        const hCol = pctColor(hPct);
        const wReset = formatResetTime(g.weeklyResetTime || g.resetTime);
        const hReset = formatResetTime(g.fiveHourResetTime);
        return `
          <div class="ag-quota-item">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:4px;">
              <span style="font-size:12.5px;font-weight:600;color:var(--aura-fg,#e3e3e3);">${g.label}</span>
              <span style="font-size:11px;color:var(--aura-muted,#9aa0a6);">每周限额 <b style="color:${wCol};font-family:var(--aura-font-mono);font-size:12px;">${wPct !== null ? wPct + "%" : "--"}</b></span>
            </div>
            <div class="ag-quota-bar-bg">
              <div class="ag-quota-bar-fill" style="width:${wPct !== null ? wPct : 0}%;background:${wCol};"></div>
            </div>
            <div class="ag-suite-sub" style="font-size:10.5px;">${wReset || "每周共享配额"}</div>
            ${hPct !== null ? `
              <div class="ag-quota-subrow">
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:10.5px;color:var(--aura-muted,#9aa0a6);">
                  <span>5小时限额</span>
                  <span><b style="color:${hCol};font-family:var(--aura-font-mono);">${hPct}%</b>${hReset ? " · " + hReset : ""}</span>
                </div>
                <div class="ag-quota-bar-bg" style="height:4px;">
                  <div class="ag-quota-bar-fill" style="width:${hPct}%;background:${hCol};"></div>
                </div>
              </div>
            ` : ""}
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
      <div id="ag-suite-cdp-banner" class="ag-update-banner" style="border-color:rgba(253,214,99,0.38);background:linear-gradient(135deg,rgba(253,214,99,0.12),rgba(138,180,248,0.10));">
        <div class="ag-suite-head" style="margin-bottom:0;flex-wrap:wrap;">
          <div>
            <div class="ag-suite-title">
              <span>当前处于官方纯净签名模式（未注入主题）</span>
              <span class="ag-suite-badge" style="background:rgba(253,214,99,0.16);color:#fdd663;border-color:rgba(253,214,99,0.35);">不修改 app.asar</span>
            </div>
            <div class="ag-suite-sub" style="margin-top:3px;">为保障官方一键热更新，已停止修改 app.asar；点击右侧即可带参重启启用主题（平时也可从「Antigravity Aura」启动）</div>
          </div>
          <button id="ag-btn-relaunch-cdp" class="ag-suite-btn primary" type="button">⚡ 主题模式重启</button>
        </div>
      </div>

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
        <div class="ag-suite-head" style="flex-wrap:wrap;">
          <div class="ag-suite-title">
            <span>模型额度池与快捷操作</span>
            <span id="ag-quota-meta" class="ag-suite-badge">Gemini 套件</span>
            <span id="ag-autoswitch-overview-badge" class="ag-suite-badge ok" style="display:none;">自动切号已开启</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            <button id="ag-btn-overview-reload" class="ag-suite-btn ghost" type="button">↻ 热重载样式</button>
            <button id="ag-btn-overview-check" class="ag-suite-btn ghost" type="button">↑ 检查更新</button>
            <button id="ag-btn-overview-cli" class="ag-suite-btn" type="button">&gt;_ 启动 agy CLI</button>
          </div>
        </div>
        <div id="ag-quota-body"><div class="ag-suite-sub">正在读取每周 / 5小时模型额度池...</div></div>
      </div>
    `;
    view.insertBefore(wrap, view.firstChild);

    wrap.querySelector("#ag-btn-overview-reload")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const res = await apiFetch("/api/reload", { method: "POST" });
        showToast(res.ok ? "样式与脚本已实时热重载" : "热重载失败");
      } catch {
        showToast("热重载请求失败");
      } finally {
        btn.disabled = false;
      }
    });

    wrap.querySelector("#ag-btn-overview-check")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "检查中...";
      try {
        const res = await apiFetch("/api/suite-update/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "check" })
        });
        const j = await res.json();
        if (j.hasUpdate) {
          const banner = document.getElementById("ag-suite-update-banner");
          if (banner) {
            banner.classList.add("show");
            const bVer = document.getElementById("ag-upd-ver-badge");
            if (bVer) bVer.textContent = `v${j.currentVersion} → v${j.latestVersion}`;
            const ul = document.getElementById("ag-upd-highlights");
            if (ul) ul.innerHTML = (j.highlights || []).slice(0, 4).map((h) => `<li>${h}</li>`).join("");
            banner.dataset.latestVer = j.latestVersion;
          }
          showToast(`发现新版本 v${j.latestVersion}！点击上方横幅即可一键更新`);
        } else {
          showToast(`当前已是最新版本 v${j.currentVersion}`);
        }
      } catch {
        showToast("检查更新失败");
      } finally {
        btn.disabled = false;
        btn.textContent = "↑ 检查更新";
      }
    });

    wrap.querySelector("#ag-btn-overview-cli")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const res = await apiFetch("/api/launch-cli", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
        const j = await res.json();
        const proxyTip = j.proxyApplied ? "（已自动注入系统代理）" : "";
        showToast(j.ok ? `已拉起 ${j.terminal || "CLI"}${proxyTip}：${j.cwd}` : `启动失败：${j.error || "未知错误"}`);
      } catch {
        showToast("启动 CLI 请求失败");
      } finally {
        btn.disabled = false;
      }
    });

    const refreshCdpBanner = async () => {
      try {
        const res = await apiFetch("/api/status", { method: "GET" });
        if (!res.ok) return;
        const j = await res.json();
        const banner = wrap.querySelector("#ag-suite-cdp-banner");
        if (banner) {
          banner.classList.toggle("show", !j.connected);
        }
      } catch {}
    };
    wrap.querySelector("#ag-btn-relaunch-cdp")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "正在重启...";
      try {
        const res = await apiFetch("/api/suite-relaunch-cdp", { method: "POST" });
        const j = await res.json();
        showToast(j.ok ? "正在以无侵入主题模式重启 Antigravity..." : `重启失败：${j.error || "未知错误"}`);
      } catch {
        showToast("重启请求失败");
        btn.disabled = false;
        btn.textContent = "⚡ 主题模式重启";
      }
    });
    refreshCdpBanner();
    setInterval(refreshCdpBanner, 8000);

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
            <span>防幻觉护栏、CLI、周额度自动切号与更新中心</span>
            <span id="ag-settings-ver-badge" class="ag-suite-badge">v--</span>
          </div>
          <div class="ag-suite-sub">全平台原生插件增强（macOS Intel / Apple Silicon / Windows 通用，热更新不丢失）</div>
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
        <div style="flex:1;min-width:220px;">
          <div style="font-size:12.5px;font-weight:600;color:var(--aura-fg,#e3e3e3);">每周额度阈值自动切号</div>
          <div id="ag-autoswitch-desc" class="ag-suite-sub">当监控模型池的每周剩余额度 ≤ 设定百分比时，自动切换至已保存的另一个账号并重载窗口</div>
        </div>
        <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--aura-fg,#e3e3e3);cursor:pointer;">
          <input id="ag-as-enabled" type="checkbox" style="accent-color:#8ab4f8;width:15px;height:15px;cursor:pointer;" />
          <span>启用自动切号</span>
        </label>
        <div class="ag-as-controls">
          <span class="ag-suite-sub">监控池：</span>
          <select id="ag-as-pool" class="ag-suite-select">
            <option value="gemini-weekly">Gemini 核心池 (每周限额)</option>
            <option value="3p-weekly">Claude / GPT (每周限额)</option>
            <option value="gemini-argon-wtu-weekly">Gemini 4 Argon (每周限额)</option>
            <option value="any-weekly">任意模型池 (最紧缩每周限额)</option>
          </select>
          <span class="ag-suite-sub">剩余 ≤</span>
          <input id="ag-as-threshold" class="ag-suite-input" type="number" min="1" max="95" value="10" style="width:62px;text-align:center;" />
          <span class="ag-suite-sub">% 自动切号</span>
          <button id="ag-as-save-btn" class="ag-suite-btn" type="button">保存策略</button>
          <button id="ag-as-save-acct-btn" class="ag-suite-btn ghost" type="button">+ 保存当前账号到备选库</button>
        </div>
        <div id="ag-autoswitch-vault-info" class="ag-suite-sub" style="width:100%;margin-top:2px;">正在读取账号备选库...</div>
        <div id="ag-as-order-list" class="ag-as-order-list"></div>
      </div>

      <div class="ag-suite-row">
        <div>
          <div style="font-size:12.5px;font-weight:600;color:var(--aura-fg,#e3e3e3);">退出后重开自动恢复上次页面</div>
          <div id="ag-last-route-desc" class="ag-suite-sub">退出 Antigravity 时自动记忆当前对话与右侧栏标签，下次打开直接回到原页面</div>
        </div>
        <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--aura-fg,#e3e3e3);cursor:pointer;">
          <input id="ag-lr-enabled" type="checkbox" checked style="accent-color:#8ab4f8;width:15px;height:15px;cursor:pointer;" />
          <span>启用自动恢复</span>
        </label>
      </div>

      <div class="ag-suite-row">
        <div>
          <div style="font-size:12.5px;font-weight:600;color:var(--aura-fg,#e3e3e3);">&gt;_ agy CLI 快捷启动器（自动继承当前账号与系统代理）</div>
          <div id="ag-cli-status-desc" class="ag-suite-sub">正在检测本机 agy CLI 路径与系统代理...</div>
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

    // 2. 每周额度阈值自动切号与切换顺序列表绑定
    const asEnabled = card.querySelector("#ag-as-enabled");
    const asPool = card.querySelector("#ag-as-pool");
    const asThreshold = card.querySelector("#ag-as-threshold");
    const asVaultInfo = card.querySelector("#ag-autoswitch-vault-info");
    const asOrderList = card.querySelector("#ag-as-order-list");
    let latestOrderedEmails = [];

    const renderOrderList = (accounts, poolKey) => {
      if (!asOrderList) return;
      if (!Array.isArray(accounts) || accounts.length === 0) {
        asOrderList.innerHTML = "";
        return;
      }
      latestOrderedEmails = accounts.map((a) => a.email);
      asOrderList.innerHTML = accounts
        .map((a, idx) => {
          const snap = a.lastWeekly || {};
          const wPct =
            poolKey && poolKey !== "any-weekly" && typeof snap[poolKey] === "number"
              ? snap[poolKey]
              : typeof snap["gemini-weekly"] === "number"
                ? snap["gemini-weekly"]
                : null;
          const pctBadge = wPct !== null ? `<span class="ag-suite-sub" style="font-family:var(--aura-font-mono);">周余 ${wPct}%</span>` : "";
          const curTag = a.isCurrent ? `<span class="ag-suite-badge ok">当前使用</span>` : "";
          const nextTag = a.isNext ? `<span class="ag-suite-badge">下一顺位</span>` : "";
          return `
            <div class="ag-as-order-item${a.isNext ? " is-next" : ""}">
              <div style="display:flex;align-items:center;gap:7px;min-width:0;flex:1;">
                <span class="ag-as-idx">#${a.orderIndex || idx + 1}</span>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--aura-fg,#e3e3e3);font-weight:500;">${a.email}</span>
                ${curTag}${nextTag}${pctBadge}
              </div>
              <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
                <button class="ag-as-mini-btn" type="button" data-move="up" data-idx="${idx}" ${idx === 0 ? "disabled" : ""} title="上移顺位">↑</button>
                <button class="ag-as-mini-btn" type="button" data-move="down" data-idx="${idx}" ${idx === accounts.length - 1 ? "disabled" : ""} title="下移顺位">↓</button>
                ${!a.isCurrent ? `<button class="ag-as-mini-btn" type="button" data-switch-email="${a.email}" title="立即切换至此账号">切换</button>` : ""}
              </div>
            </div>
          `;
        })
        .join("");

      asOrderList.querySelectorAll("button[data-move]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const idx = Number(btn.dataset.idx);
          const dir = btn.dataset.move === "up" ? -1 : 1;
          const targetIdx = idx + dir;
          if (targetIdx < 0 || targetIdx >= latestOrderedEmails.length) return;
          const nextOrder = [...latestOrderedEmails];
          const [moved] = nextOrder.splice(idx, 1);
          nextOrder.splice(targetIdx, 0, moved);
          const res = await apiFetch("/api/suite-auto-switch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accountOrder: nextOrder })
          });
          const j = await res.json();
          if (j.ok) {
            showToast("已更新账号轮换顺序");
            syncAutoSwitch();
          }
        });
      });

      asOrderList.querySelectorAll("button[data-switch-email]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const em = btn.dataset.switchEmail;
          btn.disabled = true;
          try {
            const res = await apiFetch("/api/accounts/switch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: em, reloadWindow: true })
            });
            const j = await res.json();
            showToast(j.ok ? `已切换至 ${em}，正在刷新窗口...` : `切换失败：${j.error || ""}`);
          } finally {
            btn.disabled = false;
          }
        });
      });
    };

    const syncAutoSwitch = async () => {
      try {
        const res = await apiFetch("/api/suite-auto-switch", { method: "GET" });
        const j = await res.json();
        if (!j.ok) return;
        const cfg = j.config || {};
        asEnabled.checked = Boolean(cfg.enabled);
        asPool.value = cfg.poolKey || "gemini-weekly";
        asThreshold.value = String(cfg.thresholdPct ?? 10);
        const overviewBadge = document.getElementById("ag-autoswitch-overview-badge");
        if (overviewBadge) {
          overviewBadge.style.display = cfg.enabled ? "inline-flex" : "none";
          overviewBadge.textContent = j.nextTargetEmail
            ? `周额度 ≤ ${cfg.thresholdPct}% → ${j.nextTargetEmail.split("@")[0]}`
            : `周额度 ≤ ${cfg.thresholdPct}% 自动切号`;
        }
        const lastLog = cfg.lastSwitchAt
          ? ` · 上次切号：${cfg.lastSwitchFrom || ""} → ${cfg.lastSwitchTo || ""}（${cfg.lastTriggerReason || ""}）`
          : "";
        asVaultInfo.textContent =
          j.vaultCount >= 2
            ? `轮换顺序已就绪（共 ${j.vaultCount} 个账号${j.nextTargetEmail ? "，下一顺位：" + j.nextTargetEmail : ""}），可用下方 ↑/↓ 自由调整切换顺位${lastLog}`
            : `备选库当前有 ${j.vaultCount} 个账号。先点「+ 保存当前账号到备选库」，再登录第 2/3 个账号并各保存一次，即可按下方 #1 → #2 → #3 顺序自动轮换切号${lastLog}`;
        renderOrderList(j.accounts || [], cfg.poolKey || "gemini-weekly");
      } catch {}
    };
    const saveAutoSwitch = async () => {
      const payload = {
        enabled: asEnabled.checked,
        poolKey: asPool.value,
        thresholdPct: Math.max(1, Math.min(95, parseInt(asThreshold.value, 10) || 10))
      };
      const res = await apiFetch("/api/suite-auto-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const j = await res.json();
      if (j.ok) {
        showToast(payload.enabled ? `已启用周额度自动切号（剩余 ≤ ${payload.thresholdPct}% 时自动切换）` : "已关闭周额度自动切号");
        syncAutoSwitch();
      }
    };
    asEnabled.addEventListener("change", saveAutoSwitch);
    card.querySelector("#ag-as-save-btn")?.addEventListener("click", saveAutoSwitch);
    card.querySelector("#ag-as-save-acct-btn")?.addEventListener("click", async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        const res = await apiFetch("/api/accounts/save-current", { method: "POST" });
        const j = await res.json();
        showToast(j.ok ? `已将当前账号保存至备选库` : `保存失败：${j.error || ""}`);
        syncAutoSwitch();
      } finally {
        b.disabled = false;
      }
    });
    syncAutoSwitch();

    // 2.5 退出重开自动恢复上次页面开关
    const lrEnabled = card.querySelector("#ag-lr-enabled");
    const lrDesc = card.querySelector("#ag-last-route-desc");
    const syncLastRoute = async () => {
      try {
        const res = await apiFetch("/api/suite-last-route", { method: "GET" });
        const j = await res.json();
        if (!j.ok) return;
        if (lrEnabled) lrEnabled.checked = j.enabled !== false;
        if (lrDesc) {
          lrDesc.textContent = j.route
            ? `当前已记忆：${j.title ? j.title + " · " : ""}${j.route.slice(0, 68)}${j.route.length > 68 ? "..." : ""}`
            : "退出 Antigravity 时自动记忆当前对话与右侧栏标签，下次打开直接回到原页面";
        }
      } catch {}
    };
    lrEnabled?.addEventListener("change", async () => {
      const res = await apiFetch("/api/suite-last-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: lrEnabled.checked })
      });
      const j = await res.json();
      if (j.ok) {
        showToast(lrEnabled.checked ? "已开启：重启后自动恢复上次关闭时的页面" : "已关闭：重启后保持打开默认首页");
        syncLastRoute();
      }
    });
    syncLastRoute();

    // 3. CLI 路径与代理探测 + 启动
    const cliDesc = card.querySelector("#ag-cli-status-desc");
    (async () => {
      try {
        const res = await apiFetch("/api/launch-cli", { method: "GET" });
        const j = await res.json();
        const proxyStr = j.proxy && (j.proxy.HTTPS_PROXY || j.proxy.HTTP_PROXY || j.proxy.ALL_PROXY);
        cliDesc.textContent = j.installed
          ? `已就绪：${j.cliPath}${proxyStr ? " · 自动注入代理：" + proxyStr : " · 直连模式"}`
          : "未检测到 agy CLI，请先安装官方 agy CLI";
      } catch {}
    })();
    card.querySelector("#ag-btn-settings-cli")?.addEventListener("click", async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        const res = await apiFetch("/api/launch-cli", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
        const j = await res.json();
        const proxyTip = j.proxyApplied ? "（已自动注入系统代理）" : "";
        showToast(j.ok ? `已启动 ${j.terminal || "CLI"}${proxyTip}` : `启动失败：${j.error || ""}`);
      } finally {
        b.disabled = false;
      }
    });

    // 4. GitHub 更新检查与一键更新
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
