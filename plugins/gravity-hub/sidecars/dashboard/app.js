/**
 * 引力中枢 (Gravity Hub v2.1) — 原生中文三舱 Bento 网格控制台前端引擎
 * 100% 自研编写：完整会话/全局多维度遥测、交互式 SVG 图表、30/90 天配额热力图与多账号顺位自动切号
 */
(function initNebulaHubPanel() {
  const apiFetch = (path, opts) =>
    window.sidecar && typeof window.sidecar.fetch === "function"
      ? window.sidecar.fetch(path, opts)
      : fetch(path, opts);

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showToast(msg) {
    const el = document.getElementById("nb-toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(window.__nb_toast_timer);
    window.__nb_toast_timer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function fmtInt(n) {
    return Math.round(Number(n) || 0).toLocaleString("en-US");
  }

  function fmtNum(n) {
    const v = Number(n) || 0;
    if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(1) + "k";
    return String(Math.round(v));
  }

  function fmtCompactInt(n) {
    const v = Number(n) || 0;
    if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return Math.round(v / 1e3) + "k";
    return String(Math.round(v));
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

  // 共享浮动 Tooltip（挂载于 body，防止卡片 overflow 裁剪）
  const popoverEl = document.getElementById("nb-popover-tooltip");
  let popoverHideTimer = null;

  function positionPopover(x, y) {
    if (!popoverEl) return;
    const pad = 12;
    const rect = popoverEl.getBoundingClientRect();
    let left = x + 14;
    let top = y - rect.height - 10;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, x - rect.width - 14);
    }
    if (top < pad) {
      top = Math.min(window.innerHeight - rect.height - pad, y + 16);
    }
    popoverEl.style.left = `${Math.max(pad, left)}px`;
    popoverEl.style.top = `${Math.max(pad, top)}px`;
  }

  function showPopover(html, clientX, clientY) {
    if (!popoverEl || !html) return;
    clearTimeout(popoverHideTimer);
    popoverEl.innerHTML = html;
    popoverEl.style.display = "block";
    positionPopover(clientX, clientY);
  }

  function hidePopover(delayMs = 40) {
    if (!popoverEl) return;
    clearTimeout(popoverHideTimer);
    if (delayMs <= 0) {
      popoverEl.style.display = "none";
      return;
    }
    popoverHideTimer = setTimeout(() => {
      popoverEl.style.display = "none";
    }, delayMs);
  }

  function bindDataTooltips(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll("[data-tooltip-html]").forEach((node) => {
      node.addEventListener("mouseenter", (e) => {
        showPopover(node.getAttribute("data-tooltip-html"), e.clientX, e.clientY);
      });
      node.addEventListener("mousemove", (e) => {
        if (popoverEl && popoverEl.style.display === "block") {
          positionPopover(e.clientX, e.clientY);
        }
      });
      node.addEventListener("mouseleave", () => hidePopover(60));
    });
  }

  function lsGet(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v !== null ? v : fallback;
    } catch {
      return fallback;
    }
  }

  function lsSet(key, val) {
    try {
      localStorage.setItem(key, String(val));
    } catch {}
  }

  // 0. 面板亮暗外观（跟随系统 / 深空暗夜 / 极光浅色）
  const sysLightQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
  let panelThemePref = lsGet("nb.panel.theme", "auto");

  function applyPanelTheme(pref) {
    panelThemePref = pref || "auto";
    const resolved = panelThemePref === "auto" ? (sysLightQuery && sysLightQuery.matches ? "light" : "dark") : panelThemePref;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    document.querySelectorAll("#nb-panel-theme-seg button").forEach((b) => {
      b.classList.toggle("active", b.dataset.panelTheme === panelThemePref);
    });
  }
  applyPanelTheme(panelThemePref);
  sysLightQuery?.addEventListener?.("change", () => {
    if (panelThemePref === "auto") applyPanelTheme("auto");
  });

  // 1. 三舱 Tab 切换（持久化记忆上次停留舱位）
  const tabs = document.querySelectorAll(".nb-tab");
  const views = {
    cockpit: document.getElementById("nb-view-cockpit"),
    studio: document.getElementById("nb-view-studio"),
    system: document.getElementById("nb-view-system")
  };
  function activateTab(target) {
    const valid = views[target] ? target : "cockpit";
    tabs.forEach((b) => b.classList.toggle("active", b.dataset.tab === valid));
    Object.entries(views).forEach(([k, el]) => {
      if (el) el.classList.toggle("active", k === valid);
    });
    hidePopover(0);
  }
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab || "cockpit";
      lsSet("nb.panel.tab", target);
      activateTab(target);
    });
  });
  activateTab(lsGet("nb.panel.tab", "cockpit"));

  // 2. 顶部快捷动作：热重载、检查更新、启动 CLI、主题模式重启
  document.getElementById("nb-btn-top-reload")?.addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try {
      const r = await apiFetch("/api/reload", { method: "POST" });
      showToast(r.ok ? "✦ 引力视觉样式与脚本已实时热重载" : "热重载失败");
      refreshStatus();
    } catch {
      showToast("热重载请求失败");
    } finally {
      b.disabled = false;
    }
  });

  async function triggerLaunchCli(btn) {
    if (btn) btn.disabled = true;
    try {
      const r = await apiFetch("/api/launch-cli", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const j = await r.json();
      const proxyTip = j.proxyApplied ? "（已自动注入系统代理）" : "";
      showToast(j.ok ? `已启动 ${j.terminal || "CLI"}${proxyTip}：${j.cwd}` : `启动失败：${j.error || ""}`);
    } catch {
      showToast("启动 CLI 请求失败");
    } finally {
      if (btn) btn.disabled = false;
    }
  }
  document.getElementById("nb-btn-top-cli")?.addEventListener("click", (e) => triggerLaunchCli(e.currentTarget));
  document.getElementById("nb-btn-sys-cli")?.addEventListener("click", (e) => triggerLaunchCli(e.currentTarget));

  document.getElementById("nb-btn-relaunch-cdp")?.addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    b.textContent = "正在切入引力模式...";
    try {
      const r = await apiFetch("/api/suite-relaunch-cdp", { method: "POST" });
      const j = await r.json();
      showToast(j.ok ? "正在通过 Antigravity Gravity 启动器无感重启..." : `重启失败：${j.error || ""}`);
    } catch {
      b.disabled = false;
      b.textContent = "⚡ 主题模式重启";
    }
  });

  // 3. CDP 状态与模型额度池同步
  async function refreshStatus() {
    try {
      const r = await apiFetch("/api/status", { method: "GET" });
      if (!r.ok) return;
      const j = await r.json();
      const pill = document.getElementById("nb-cdp-pill");
      const banner = document.getElementById("nb-banner-cdp");
      if (pill) {
        if (j.connected) {
          pill.textContent = `● 已挂载 (${j.targetCount} 窗口)`;
          pill.classList.remove("warn");
        } else {
          pill.textContent = "○ 纯净未挂载";
          pill.classList.add("warn");
        }
      }
      if (banner) {
        banner.style.display = j.connected ? "none" : "block";
      }
    } catch {}
  }

  async function refreshQuota(force = false) {
    try {
      const r = await apiFetch(`/api/suite-quota${force ? "?refresh=1" : ""}`, { method: "GET" });
      if (!r.ok) return;
      const j = await r.json();
      const data = j.data;
      const grid = document.getElementById("nb-quota-grid");
      const badge = document.getElementById("nb-quota-plan-badge");
      const updEl = document.getElementById("nb-quota-updated-at");
      if (!grid) return;
      if (!data || !Array.isArray(data.groups) || data.groups.length === 0) {
        grid.innerHTML = `<div class="nb-empty-hint">正在等待宿主窗口或 Language Server 同步当前账号每周 / 5 小时模型配额池...</div>`;
        return;
      }
      if (badge) {
        badge.textContent = `${data.planName || "Google AI"}${data.email ? " · " + data.email : ""}`;
      }
      if (updEl && data.updatedAt) {
        const dt = new Date(data.updatedAt);
        updEl.textContent = `同步于 ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}:${String(dt.getSeconds()).padStart(2, "0")}`;
      }
      grid.innerHTML = data.groups
        .map((g) => {
          const wPct = typeof g.weeklyPct === "number" ? Math.max(0, Math.min(100, Math.round(g.weeklyPct))) : (typeof g.pct === "number" ? Math.round(g.pct) : null);
          const hPct = typeof g.fiveHourPct === "number" ? Math.max(0, Math.min(100, Math.round(g.fiveHourPct))) : null;
          const wCol = pctColor(wPct);
          const hCol = pctColor(hPct);
          const wReset = formatResetTime(g.weeklyResetTime || g.resetTime);
          const hReset = formatResetTime(g.fiveHourResetTime);
          return `
            <div class="nb-quota-box">
              <div class="nb-quota-top">
                <span class="nb-quota-name">${esc(g.label)}</span>
                <span class="nb-muted">每周限额 <b class="nb-quota-pct" style="color:${wCol}">${wPct !== null ? wPct + "%" : "--"}</b></span>
              </div>
              <div class="nb-track">
                <div class="nb-fill" style="width:${wPct !== null ? wPct : 0}%;background:${wCol}"></div>
              </div>
              <div class="nb-muted">${esc(wReset || "每周共享配额池")}</div>
              ${
                hPct !== null
                  ? `<div class="nb-quota-5h">
                      <div class="nb-quota-top" style="margin-bottom:3px;">
                        <span class="nb-muted">5 小时限额</span>
                        <span class="nb-muted"><b class="nb-quota-pct" style="color:${hCol};font-size:11.5px;">${hPct}%</b>${hReset ? " · " + esc(hReset) : ""}</span>
                      </div>
                      <div class="nb-track" style="height:4px;">
                        <div class="nb-fill" style="width:${hPct}%;background:${hCol}"></div>
                      </div>
                    </div>`
                  : ""
              }
            </div>
          `;
        })
        .join("");
    } catch {}
  }

  document.getElementById("nb-btn-refresh-quota")?.addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try {
      await Promise.all([refreshQuota(true), syncAutoSwitch()]);
      showToast("已刷新当前账号模型额度池与自动切号状态");
    } finally {
      b.disabled = false;
    }
  });

  // 4. 多账号备选金库与自动切号
  let latestOrderedEmails = [];
  async function syncAutoSwitch() {
    try {
      const r = await apiFetch("/api/suite-auto-switch", { method: "GET" });
      if (!r.ok) return;
      const j = await r.json();
      if (!j.ok) return;
      const cfg = j.config || {};
      const enEl = document.getElementById("nb-as-enabled");
      const poolEl = document.getElementById("nb-as-pool");
      const weeklyEnEl = document.getElementById("nb-as-weekly-enabled");
      const thEl = document.getElementById("nb-as-threshold");
      const fiveHourEnEl = document.getElementById("nb-as-5h-enabled");
      const fiveHourThEl = document.getElementById("nb-as-5h-threshold");
      const cdEl = document.getElementById("nb-as-cooldown");
      const reloadEl = document.getElementById("nb-as-reload");
      const countBadge = document.getElementById("nb-vault-count-badge");
      const activeBadge = document.getElementById("nb-autoswitch-active-badge");
      const summaryEl = document.getElementById("nb-as-summary");
      const listEl = document.getElementById("nb-as-order-list");

      const weeklyOn = cfg.weeklyEnabled !== false;
      const fiveHourOn = cfg.fiveHourEnabled !== false;
      const weeklyTh = cfg.thresholdPct ?? 10;
      const fiveHourTh = cfg.fiveHourThresholdPct ?? 10;

      if (enEl) enEl.checked = Boolean(cfg.enabled);
      if (poolEl) poolEl.value = cfg.poolKey || "gemini-weekly";
      if (weeklyEnEl) weeklyEnEl.checked = weeklyOn;
      if (thEl) thEl.value = String(weeklyTh);
      if (fiveHourEnEl) fiveHourEnEl.checked = fiveHourOn;
      if (fiveHourThEl) fiveHourThEl.value = String(fiveHourTh);
      if (cdEl) cdEl.value = String(cfg.cooldownMinutes ?? 10);
      if (reloadEl) reloadEl.checked = cfg.reloadWindow !== false;
      if (countBadge) countBadge.textContent = `${j.vaultCount || 0} 个备选账号`;

      const ruleParts = [];
      if (weeklyOn) ruleParts.push(`周≤${weeklyTh}%`);
      if (fiveHourOn) ruleParts.push(`5h≤${fiveHourTh}%`);
      const ruleText = ruleParts.length > 0 ? ruleParts.join(" · ") : `≤${weeklyTh}%`;

      if (activeBadge) {
        activeBadge.style.display = cfg.enabled ? "inline-flex" : "none";
        activeBadge.textContent = j.nextTargetEmail
          ? `${ruleText} → ${j.nextTargetEmail.split("@")[0]}`
          : `${ruleText} 自动切号`;
      }
      if (summaryEl) {
        const monParts = [];
        if (typeof j.monitoredPct === "number") {
          monParts.push(`周 ${j.monitoredPct}%${weeklyOn ? `(≤${weeklyTh}%)` : "(未启用)"}`);
        }
        if (typeof j.monitoredFiveHourPct === "number") {
          monParts.push(`5h ${j.monitoredFiveHourPct}%${fiveHourOn ? `(≤${fiveHourTh}%)` : "(未启用)"}`);
        }
        const monNote =
          monParts.length > 0
            ? `当前监控池「${j.monitoredLabel || j.monitoredFiveHourLabel || cfg.poolKey}」实时余量 ${monParts.join(" / ")} · `
            : "";
        const coolNote = j.cooldownRemainingSec > 0 ? ` · 冷却剩余 ${Math.ceil(j.cooldownRemainingSec / 60)} 分钟` : "";
        const lastLog = cfg.lastSwitchAt
          ? ` · 上次自动切号：${cfg.lastSwitchFrom || ""} → ${cfg.lastSwitchTo || ""}（${cfg.lastTriggerReason || ""}）`
          : "";
        summaryEl.textContent =
          j.vaultCount >= 2
            ? `${monNote}轮换队列已就绪（共 ${j.vaultCount} 个账号${j.nextTargetEmail ? "，下一顺位：" + j.nextTargetEmail : ""}），可用 ↑/↓ 调整顺位${coolNote}${lastLog}`
            : `${monNote}当前金库已存 ${j.vaultCount} 个账号。先点「+ 保存当前账号入库」，切换登录其他账号后再保存一次即可启用自动轮换${lastLog}`;
      }
      if (listEl) {
        const accounts = j.accounts || [];
        latestOrderedEmails = accounts.map((a) => a.email);
        const fmtSyncAgo = (ts) => {
          if (!ts) return "未同步";
          const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
          if (sec < 60) return "刚刚同步";
          const min = Math.floor(sec / 60);
          if (min < 60) return `${min}分钟前`;
          const hr = Math.floor(min / 60);
          if (hr < 24) return `${hr}小时前`;
          return `${Math.floor(hr / 24)}天前`;
        };
        const shortPoolName = (lbl, key) => {
          if (/argon/i.test(key || lbl || "")) return "Argon";
          if (/3p|claude|gpt/i.test(key || lbl || "")) return "Claude/GPT";
          if (/gemini/i.test(key || lbl || "")) return "Gemini";
          return lbl || key;
        };
        listEl.innerHTML = accounts
          .map((a, idx) => {
            const pools = Array.isArray(a.pools) ? a.pools : [];
            const poolsHtml =
              pools.length > 0
                ? `<div class="nb-acct-pool-tags">${pools
                    .map((p) => {
                      const wPct = typeof p.effectiveWeeklyPct === "number" ? p.effectiveWeeklyPct : p.weeklyPct;
                      const hPct = typeof p.effectiveFiveHourPct === "number" ? p.effectiveFiveHourPct : p.fiveHourPct;
                      const minPct = hPct !== null && typeof hPct === "number" ? Math.min(wPct, hPct) : wPct;
                      const col = pctColor(minPct);
                      const wTxt = p.resetRecovered ? "周已重置≈100%" : `周 ${wPct}%`;
                      const hTxt = hPct !== null && typeof hPct === "number" ? ` · ${p.fiveHourResetRecovered ? "5h已重置≈100%" : `5h ${hPct}%`}` : "";
                      const txt = `${shortPoolName(p.label, p.key)} ${wTxt}${hTxt}`;
                      return `<span class="nb-pool-chip" style="color:${col};border-color:${col}44">${esc(txt)}</span>`;
                    })
                    .join("")}</div>`
                : "";
            const agoTxt = a.snapshotUpdatedAt ? `<span class="nb-muted" style="font-size:10.5px;">${fmtSyncAgo(a.snapshotUpdatedAt)}</span>` : "";
            return `
              <div class="nb-order-item${a.isNext ? " is-next" : ""}">
                <div style="display:flex;flex-direction:column;gap:4px;min-width:0;flex:1;">
                  <div style="display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap;">
                    <span class="nb-order-idx">#${a.orderIndex || idx + 1}</span>
                    <span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(a.email)}</span>
                    ${a.isCurrent ? `<span class="nb-badge ok">当前在线</span>` : ""}
                    ${a.isNext ? `<span class="nb-badge">下一顺位</span>` : ""}
                    ${agoTxt}
                  </div>
                  ${poolsHtml}
                </div>
                <div style="display:flex;gap:4px;flex-shrink:0;">
                  <button type="button" class="nb-mini-btn" data-move="up" data-idx="${idx}" ${idx === 0 ? "disabled" : ""} title="上移顺位">↑</button>
                  <button type="button" class="nb-mini-btn" data-move="down" data-idx="${idx}" ${idx === accounts.length - 1 ? "disabled" : ""} title="下移顺位">↓</button>
                  ${!a.isCurrent ? `<button type="button" class="nb-mini-btn" data-switch="${esc(a.email)}">切换</button>` : ""}
                  ${!a.isCurrent ? `<button type="button" class="nb-mini-btn danger" data-delete="${esc(a.email)}" title="从备选金库移除">移除</button>` : ""}
                </div>
              </div>
            `;
          })
          .join("");

        listEl.querySelectorAll("button[data-move]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const idx = Number(btn.dataset.idx);
            const dir = btn.dataset.move === "up" ? -1 : 1;
            const targetIdx = idx + dir;
            if (targetIdx < 0 || targetIdx >= latestOrderedEmails.length) return;
            const nextOrder = [...latestOrderedEmails];
            const [moved] = nextOrder.splice(idx, 1);
            nextOrder.splice(targetIdx, 0, moved);
            await apiFetch("/api/suite-auto-switch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ accountOrder: nextOrder })
            });
            showToast("已更新账号轮换顺位");
            syncAutoSwitch();
          });
        });

        listEl.querySelectorAll("button[data-switch]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const email = btn.dataset.switch;
            btn.disabled = true;
            try {
              const r = await apiFetch("/api/accounts/switch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, reloadWindow: document.getElementById("nb-as-reload")?.checked !== false })
              });
              const resJson = await r.json();
              showToast(resJson.ok ? `已切换至 ${email}，正在刷新宿主窗口...` : `切换失败：${resJson.error || ""}`);
              syncAutoSwitch();
            } finally {
              btn.disabled = false;
            }
          });
        });

        listEl.querySelectorAll("button[data-delete]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const email = btn.dataset.delete;
            if (btn.dataset.confirm !== "1") {
              btn.dataset.confirm = "1";
              btn.textContent = "确认移除?";
              setTimeout(() => {
                if (btn.isConnected && btn.dataset.confirm === "1") {
                  delete btn.dataset.confirm;
                  btn.textContent = "移除";
                }
              }, 3000);
              return;
            }
            btn.disabled = true;
            try {
              const r = await apiFetch("/api/accounts/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email })
              });
              const resJson = await r.json();
              showToast(resJson.ok ? `已从金库移除 ${email}` : `移除失败：${resJson.error || ""}`);
              syncAutoSwitch();
            } finally {
              btn.disabled = false;
            }
          });
        });
      }
    } catch {}
  }

  async function saveAutoSwitchPolicy() {
    const enabled = Boolean(document.getElementById("nb-as-enabled")?.checked);
    const poolKey = document.getElementById("nb-as-pool")?.value || "gemini-weekly";
    const weeklyEnabledEl = document.getElementById("nb-as-weekly-enabled");
    const fiveHourEnabledEl = document.getElementById("nb-as-5h-enabled");
    let weeklyEnabled = weeklyEnabledEl ? Boolean(weeklyEnabledEl.checked) : true;
    const fiveHourEnabled = fiveHourEnabledEl ? Boolean(fiveHourEnabledEl.checked) : true;
    if (enabled && !weeklyEnabled && !fiveHourEnabled) {
      weeklyEnabled = true;
      if (weeklyEnabledEl) weeklyEnabledEl.checked = true;
    }
    const thresholdPct = Math.max(1, Math.min(95, parseInt(document.getElementById("nb-as-threshold")?.value || "10", 10) || 10));
    const fiveHourThresholdPct = Math.max(1, Math.min(95, parseInt(document.getElementById("nb-as-5h-threshold")?.value || "10", 10) || 10));
    const cooldownMinutes = Math.max(1, Math.min(180, parseInt(document.getElementById("nb-as-cooldown")?.value || "10", 10) || 10));
    const reloadWindow = document.getElementById("nb-as-reload")?.checked !== false;
    const r = await apiFetch("/api/suite-auto-switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled,
        poolKey,
        weeklyEnabled,
        thresholdPct,
        fiveHourEnabled,
        fiveHourThresholdPct,
        cooldownMinutes,
        reloadWindow
      })
    });
    const j = await r.json();
    if (j.ok) {
      const ruleNotes = [];
      if (weeklyEnabled) ruleNotes.push(`周余 ≤ ${thresholdPct}%`);
      if (fiveHourEnabled) ruleNotes.push(`5h余 ≤ ${fiveHourThresholdPct}%`);
      showToast(enabled ? `已启用双限额自动切号（${ruleNotes.join(" 或 ")} · 冷却 ${cooldownMinutes} 分钟）` : "已关闭低额度自动切号");
      syncAutoSwitch();
    }
  }
  document.getElementById("nb-as-enabled")?.addEventListener("change", saveAutoSwitchPolicy);
  document.getElementById("nb-as-weekly-enabled")?.addEventListener("change", saveAutoSwitchPolicy);
  document.getElementById("nb-as-5h-enabled")?.addEventListener("change", saveAutoSwitchPolicy);
  document.getElementById("nb-as-reload")?.addEventListener("change", saveAutoSwitchPolicy);
  document.getElementById("nb-btn-as-save")?.addEventListener("click", saveAutoSwitchPolicy);
  document.getElementById("nb-btn-save-current-acct")?.addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try {
      const r = await apiFetch("/api/accounts/save-current", { method: "POST" });
      const j = await r.json();
      showToast(j.ok ? "已将当前登录账号凭据保存至引力金库" : `保存失败：${j.error || ""}`);
      syncAutoSwitch();
    } finally {
      b.disabled = false;
    }
  });

  // 5. 全量会话与全局 SQLite 遥测引擎 + 交互式图表 + 热力图
  const MODEL_COLORS = ["#3B82F6", "#F59E0B", "#10B981", "#8B5CF6", "#EC4899", "#06B6D4", "#6366F1", "#14B8A6"];

  const USD_TO_CNY = 7.25;

  const TOOL_META = {
    run_command: { name: "终端命令执行", category: "执行", color: "#F59E0B" },
    view_file: { name: "文件与代码读取", category: "读取", color: "#00A67E" },
    read_file: { name: "文件与代码读取", category: "读取", color: "#00A67E" },
    list_dir: { name: "文件与代码读取", category: "读取", color: "#00A67E" },
    read_url_content: { name: "网页内容读取", category: "读取", color: "#00A67E" },
    replace_file_content: { name: "代码编辑与写入", category: "编辑", color: "#3B82F6" },
    edit_file: { name: "代码编辑与写入", category: "编辑", color: "#3B82F6" },
    write_to_file: { name: "代码编辑与写入", category: "编辑", color: "#3B82F6" },
    write_file: { name: "代码编辑与写入", category: "编辑", color: "#3B82F6" },
    grep_search: { name: "代码库检索", category: "检索", color: "#8B5CF6" },
    find_by_name: { name: "文件定位检索", category: "检索", color: "#8B5CF6" },
    search_web: { name: "联网搜索与文档", category: "联网", color: "#06B6D4" },
    invoke_subagent: { name: "多智能体协作", category: "协作", color: "#EC4899" },
    manage_subagents: { name: "多智能体协作", category: "协作", color: "#EC4899" },
    send_message: { name: "智能体间通信", category: "协作", color: "#EC4899" },
    define_subagent: { name: "定义子智能体", category: "协作", color: "#EC4899" },
    schedule: { name: "定时与任务调度", category: "调度", color: "#10B981" },
    manage_task: { name: "后台任务管理", category: "调度", color: "#10B981" },
    ask_question: { name: "用户交互确认", category: "交互", color: "#6366F1" },
    update_steps: { name: "进度清单更新", category: "扩展", color: "#948F85" },
    update_focus: { name: "当前焦点更新", category: "扩展", color: "#948F85" },
    search_marketplace: { name: "插件市场检索", category: "扩展", color: "#948F85" },
    swarm: { name: "多智能体集群", category: "协作", color: "#EC4899" },
    enter_plan_mode: { name: "切换规划模式", category: "扩展", color: "#948F85" },
    exit_plan_mode: { name: "确认执行计划", category: "扩展", color: "#948F85" }
  };

  function getToolMeta(rawName) {
    const known = TOOL_META[rawName];
    if (known) return known;
    return { name: rawName, category: "扩展", color: "#948F85" };
  }

  function formatModelDisplay(modelId, modelName) {
    const id = String(modelId || "").trim();
    const rawName = String(modelName || id || "未知模型").trim();
    const base = rawName.replace(/\s*\((High|Medium|Low)\)\s*$/i, "").trim() || rawName;
    const low = `${id} ${rawName}`.toLowerCase();
    const tierZh = /\bhigh\b|\(high\)/i.test(low)
      ? "高"
      : /\bmedium\b|\(medium\)/i.test(low)
        ? "中"
        : /\blow\b|\(low\)/i.test(low)
          ? "低"
          : "";

    if (low.includes("neon")) return `${base} (霓虹·${tierZh ? tierZh + "阶推理" : "高阶推理"})`;
    if (low.includes("argon")) return `${base} (氩·${tierZh ? tierZh + "阶推理" : "高阶推理"})`;
    if (low.includes("hydrogen")) return `${base} (氢·${tierZh ? tierZh + "速推理" : "高速推理"})`;
    if (low.includes("carbon")) return `${base} (碳·${tierZh ? tierZh + "阶旗舰" : "旗舰推理"})`;
    if (low.includes("flash")) return `${base} (闪速轻量)`;
    if (low.includes("claude") && low.includes("opus")) return `${base} (旗舰${tierZh ? "·" + tierZh : "思考"})`;
    if (low.includes("claude") && low.includes("sonnet")) return `${base} (均衡高效${tierZh ? "·" + tierZh : ""})`;
    if (low.includes("claude") && low.includes("haiku")) return `${base} (极速轻量)`;
    if (low.includes("gpt")) return `${base} (通用推理${tierZh ? "·" + tierZh : ""})`;
    if (low.includes("2.5") || low.includes("pro")) return `${base} (专业推理)`;
    return `${base} (${tierZh ? tierZh + "档模型" : "智能推理"})`;
  }

  function getModelPricing(idOrName) {
    const s = String(idOrName || "").toLowerCase();
    if (!s) return { inputRate: 0, outputRate: 0, cacheRate: 0 };
    if (s.includes("claude")) {
      if (s.includes("opus")) return { inputRate: 15, outputRate: 75, cacheRate: 1.5 };
      if (s.includes("haiku")) return { inputRate: 0.8, outputRate: 4, cacheRate: 0.08 };
      return { inputRate: 3, outputRate: 15, cacheRate: 0.3 };
    }
    if (s.includes("gpt")) return { inputRate: 2.5, outputRate: 10, cacheRate: 0.25 };
    if (!s.includes("gemini")) return { inputRate: 0, outputRate: 0, cacheRate: 0 };
    if (s.includes("carbon") || s.includes("argon") || s.includes("neon")) {
      return { inputRate: 2, outputRate: 10, cacheRate: 0.2 };
    }
    if (s.includes("hydrogen")) return { inputRate: 1.5, outputRate: 7.5, cacheRate: 0.15 };
    if (s.includes("pro") || s.includes("2.5")) return { inputRate: 1.25, outputRate: 10, cacheRate: 0.125 };
    return { inputRate: 0.75, outputRate: 3.75, cacheRate: 0.075 };
  }

  function calcCost(idOrName, inTok, outTok, cacheRead) {
    const r = getModelPricing(idOrName);
    return ((Number(inTok) || 0) * r.inputRate + (Number(outTok) || 0) * r.outputRate + (Number(cacheRead) || 0) * r.cacheRate) / 1e6;
  }

  function calcCacheSavings(idOrName, cacheRead) {
    const r = getModelPricing(idOrName);
    return ((Number(cacheRead) || 0) * Math.max(0, r.inputRate - r.cacheRate)) / 1e6;
  }

  function formatDateKeyLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function parseDateKeyLocal(key) {
    const [y, m, d] = String(key || "").split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  function shortDateLabel(key) {
    const dt = parseDateKeyLocal(key);
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
  }

  function enumerateDateKeys(startDate, endDate) {
    const res = [];
    const cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    while (cur <= end && res.length < 400) {
      res.push(formatDateKeyLocal(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return res;
  }

  function resolveRangeSpec(rangeKey, customStart, customEnd) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const labels = {
      session: { zh: "当前会话", en: "Active Session" },
      today: { zh: "今日", en: "Today" },
      yesterday: { zh: "昨日", en: "Yesterday" },
      "this-week": { zh: "本周", en: "This Week" },
      "this-month": { zh: "本月", en: "This Month" },
      "last-7-days": { zh: "近 7 天", en: "Last 7 Days" },
      "last-30-days": { zh: "近 30 天", en: "Last 30 Days" },
      custom: { zh: "自定义", en: "Custom Range" }
    };
    const meta = labels[rangeKey] || labels["last-30-days"];
    let dates = [];
    if (rangeKey === "today") {
      dates = [formatDateKeyLocal(today)];
    } else if (rangeKey === "yesterday") {
      const yest = new Date(today);
      yest.setDate(yest.getDate() - 1);
      dates = [formatDateKeyLocal(yest)];
    } else if (rangeKey === "this-week") {
      const dow = (today.getDay() + 6) % 7; // Mon = 0
      const start = new Date(today);
      start.setDate(start.getDate() - dow);
      dates = enumerateDateKeys(start, today);
    } else if (rangeKey === "this-month") {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      dates = enumerateDateKeys(start, today);
    } else if (rangeKey === "last-7-days") {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      dates = enumerateDateKeys(start, today);
    } else if (rangeKey === "custom" && customStart && customEnd) {
      const s = parseDateKeyLocal(customStart);
      const e = parseDateKeyLocal(customEnd);
      dates = s <= e ? enumerateDateKeys(s, e) : enumerateDateKeys(e, s);
    } else if (rangeKey !== "session") {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      dates = enumerateDateKeys(start, today);
    }
    return {
      range: rangeKey,
      labelZh: meta.zh,
      labelEn: meta.en,
      dates,
      dateSet: new Set(dates)
    };
  }

  function medianFromHist(tpsHist) {
    if (!tpsHist || typeof tpsHist !== "object") return 0;
    const entries = Object.entries(tpsHist)
      .map(([k, c]) => [Number(k), Number(c) || 0])
      .filter(([v, c]) => Number.isFinite(v) && v > 0 && c > 0)
      .sort((a, b) => a[0] - b[0]);
    const total = entries.reduce((acc, [, c]) => acc + c, 0);
    if (total <= 0) return 0;
    let seen = 0;
    const mid = total * 0.5;
    for (const [v, c] of entries) {
      seen += c;
      if (seen >= mid) return Math.round(v);
    }
    return entries[entries.length - 1][0];
  }

  function quantile(sortedArr, q) {
    if (!sortedArr.length) return 0;
    const pos = (sortedArr.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sortedArr[base + 1] !== undefined) {
      return sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base]);
    }
    return sortedArr[base];
  }

  let cachedOverview = null;
  let cachedSession = null;
  let activeRange = lsGet("nb.analytics.range", "last-30-days");
  let projectsScope = lsGet("nb.analytics.projectScope", "follow");
  let accountsScope = lsGet("nb.analytics.accountScope", "follow");
  function normalizeHeatmapDays(v) {
    const n = Number(v);
    return n === 90 || n === 365 ? n : 30;
  }

  let accountPrefs = {
    hideUntracked: lsGet("nb.analytics.hideUntracked", "0") === "1",
    assignUntrackedTo: lsGet("nb.analytics.assignUntrackedTo", ""),
    heatmapDays: normalizeHeatmapDays(lsGet("nb.analytics.heatmapDays", "30"))
  };
  let customStart = lsGet("nb.analytics.customStart", formatDateKeyLocal(new Date(Date.now() - 6 * 86400000)));
  let customEnd = lsGet("nb.analytics.customEnd", formatDateKeyLocal(new Date()));

  const customStartEl = document.getElementById("nb-custom-start");
  const customEndEl = document.getElementById("nb-custom-end");
  if (customStartEl) customStartEl.value = customStart;
  if (customEndEl) customEndEl.value = customEnd;
  document.querySelectorAll("#nb-range-seg button").forEach((b) => {
    b.classList.toggle("active", b.dataset.range === activeRange);
  });
  const initCustomRow = document.getElementById("nb-custom-range-row");
  if (initCustomRow) initCustomRow.style.display = activeRange === "custom" ? "flex" : "none";
  document.querySelectorAll("#nb-projects-scope-seg button").forEach((b) => {
    b.classList.toggle("active", b.dataset.scope === projectsScope);
  });
  document.querySelectorAll("#nb-accounts-scope-seg button").forEach((b) => {
    b.classList.toggle("active", b.dataset.scope === accountsScope);
  });

  // 商业 API 单价表悬浮窗
  const costInfoBtn = document.getElementById("nb-cost-info-btn");
  if (costInfoBtn) {
    const pricingRows = [
      { name: "Gemini 4 Carbon / Neon / Argon", color: "#3B82F6", inR: 2.0, outR: 10.0, cR: 0.2 },
      { name: "Gemini 4 Hydrogen", color: "#06B6D4", inR: 1.5, outR: 7.5, cR: 0.15 },
      { name: "Gemini 3.8 Flash", color: "#10B981", inR: 0.75, outR: 3.75, cR: 0.075 },
      { name: "Claude Opus / Sonnet", color: "#EC4899", inR: 15.0, outR: 75.0, cR: 1.5 }
    ];
    const pricingHtml = `
      <div class="nb-tip-head"><span>商业 API 参考单价</span><span class="nb-tip-tag">per 1M tok</span></div>
      <table class="nb-tip-table">
        <thead><tr><th>Model</th><th>Input</th><th>Output</th><th>Cache</th></tr></thead>
        <tbody>
          ${pricingRows
            .map(
              (r) =>
                `<tr><td><i class="nb-dot" style="background:${r.color}"></i>${r.name}</td><td>$${r.inR.toFixed(2)}</td><td>$${r.outR.toFixed(2)}</td><td>$${r.cR.toFixed(3)}</td></tr>`
            )
            .join("")}
        </tbody>
      </table>
    `;
    costInfoBtn.addEventListener("mouseenter", (e) => showPopover(pricingHtml, e.clientX, e.clientY));
    costInfoBtn.addEventListener("mouseleave", () => hidePopover(60));
  }

  function buildRangeAggregate(overview, session, spec) {
    if (spec.range === "session") {
      if (!session) return null;
      const t = session.totalTokens || { input: 0, output: 0, cacheRead: 0, thinking: 0, total: 0 };
      const steps = Array.isArray(session.steps) ? session.steps : [];
      const activityBars = steps.map((s, idx) => ({
        label: `#${s.idx || idx + 1}`,
        fullLabel: `Step #${s.idx || idx + 1}${s.modelName ? " · " + s.modelName : ""}`,
        inTok: s.inTok || 0,
        outTok: s.outTok || 0,
        cacheRead: s.cacheRead || 0,
        requests: 1
      }));
      const models = (session.models || []).map((m) => ({
        ...m,
        inTok: m.inputTok ?? m.inTok ?? 0,
        outTok: m.outTok ?? 0,
        cacheRead: m.cacheRead ?? 0,
        thinkTok: m.thinkTok ?? 0
      }));
      const acctCost = (session.accounts || []).reduce((acc, a) => acc + (a.cost || 0), 0);
      const modelCost = models.reduce((acc, m) => acc + calcCost(m.modelId || m.modelName, m.inTok, m.outTok, m.cacheRead), 0);
      const cost = acctCost > 0 ? acctCost : modelCost;
      const speedSeries = buildSessionSpeedSeries(session);
      const scatterPts = steps
        .filter((s) => (s.ttft || 0) > 0 && (s.totDur || 0) > 0)
        .map((s, idx) => ({
          ttft: Number(s.ttft) || 0,
          totDur: Number(s.totDur) || 0,
          outTok: Number(s.outTok) || 0,
          speed: Number(s.tokPerSec) || 0,
          label: `Step #${s.idx || idx + 1}`
        }));
      const projects = session.project
        ? [{ ...session.project, conversationCount: 1, tokenCount: t.total || 0, inputTok: t.input || 0, outTok: t.output || 0, cacheRead: t.cacheRead || 0, requests: session.totalRequests || 0 }]
        : [];
      return {
        isSession: true,
        totalTokens: t,
        requests: session.totalRequests || 0,
        userTurns: session.sessionTurns || 0,
        avgTokPerSec: Math.round(Number(session.avgTokPerSec) || 0),
        p50TokPerSec: Math.round(Number(session.p50TokPerSec || session.e2eTokPerSec) || 0),
        avgTurnLatency: Number(session.avgTurnLatency) || 0,
        avgTtft: Number(session.avgTtft) || 0,
        cacheEfficiency: Number(session.cacheEfficiency) || 0,
        estimatedCost: cost,
        activityBars,
        models,
        speedSeries,
        scatterPts,
        tools: session.tools || [],
        projects,
        accounts: session.accounts || []
      };
    }

    if (!overview) return null;
    const isSingleDay = spec.range === "today" || spec.range === "yesterday";
    const seriesByDate = new Map((overview.timeRangeSeries || []).map((d) => [d.date, d]));

    let inTok = 0;
    let outTok = 0;
    let cacheRead = 0;
    let thinkTok = 0;
    let requests = 0;
    let userTurns = 0;
    let effOutTok = 0;
    let effSec = 0;
    let ttftSum = 0;
    let ttftCount = 0;
    let turnDurSum = 0;
    let validTurnCount = 0;
    const tpsHist = {};
    const scatterPts = [];
    const activityBars = [];

    if (isSingleDay && spec.dates.length === 1) {
      const targetDate = spec.dates[0];
      const hourMap = new Map((overview.hourlySeries || []).map((h) => [h.hourKey, h]));
      for (let hr = 0; hr < 24; hr++) {
        const hKey = `${targetDate} ${String(hr).padStart(2, "0")}:00`;
        const row = hourMap.get(hKey);
        if (row) {
          inTok += row.inputTok || 0;
          outTok += row.outTok || 0;
          cacheRead += row.cacheRead || 0;
          thinkTok += row.thinkTok || 0;
          requests += row.requests || 0;
          userTurns += row.userTurns || 0;
          effOutTok += row.effOutTok || 0;
          effSec += row.effSec || 0;
          ttftSum += row.ttftSum || 0;
          ttftCount += row.ttftCount || 0;
          turnDurSum += row.turnDurSum || 0;
          validTurnCount += row.validTurnCount || 0;
          if (row.tpsHist) {
            for (const [k, v] of Object.entries(row.tpsHist)) {
              tpsHist[k] = (tpsHist[k] || 0) + v;
            }
          }
        }
        activityBars.push({
          label: `${String(hr).padStart(2, "0")}:00`,
          fullLabel: hKey,
          inTok: row?.inputTok || 0,
          outTok: row?.outTok || 0,
          cacheRead: row?.cacheRead || 0,
          requests: row?.requests || 0
        });
      }
      const dayRow = seriesByDate.get(targetDate);
      if (dayRow?.latencySamples) {
        for (const pt of dayRow.latencySamples) {
          if ((pt.ttft || 0) > 0 && (pt.totDur || 0) > 0) scatterPts.push({ ...pt, label: targetDate });
        }
      }
    } else {
      for (const dtKey of spec.dates) {
        const row = seriesByDate.get(dtKey);
        if (row) {
          inTok += row.inputTok || 0;
          outTok += row.outTok || 0;
          cacheRead += row.cacheRead || 0;
          thinkTok += row.thinkTok || 0;
          requests += row.requests || 0;
          userTurns += row.userTurns || 0;
          effOutTok += row.effOutTok || 0;
          effSec += row.effSec || 0;
          ttftSum += row.ttftSum || 0;
          ttftCount += row.ttftCount || 0;
          turnDurSum += row.turnDurSum || 0;
          validTurnCount += row.validTurnCount || 0;
          if (row.tpsHist) {
            for (const [k, v] of Object.entries(row.tpsHist)) {
              tpsHist[k] = (tpsHist[k] || 0) + v;
            }
          }
          if (Array.isArray(row.latencySamples)) {
            for (const pt of row.latencySamples) {
              if ((pt.ttft || 0) > 0 && (pt.totDur || 0) > 0) scatterPts.push({ ...pt, label: dtKey });
            }
          }
        }
        activityBars.push({
          label: shortDateLabel(dtKey),
          fullLabel: dtKey,
          inTok: row?.inputTok || 0,
          outTok: row?.outTok || 0,
          cacheRead: row?.cacheRead || 0,
          requests: row?.requests || 0
        });
      }
    }

    // 聚合模型统计 + 模型速度趋势
    const modelMap = new Map();
    const speedBuckets = [];
    if (isSingleDay && spec.dates.length === 1 && overview.hourlyModelStats) {
      const targetDate = spec.dates[0];
      for (let hr = 0; hr < 24; hr++) {
        const hKey = `${targetDate} ${String(hr).padStart(2, "0")}:00`;
        const hModels = overview.hourlyModelStats[hKey];
        if (!hModels) continue;
        const slotModels = {};
        for (const [mKey, m] of Object.entries(hModels)) {
          if (!mKey || mKey === "unknown" || (m.modelName || "").toLowerCase().includes("unknown")) continue;
          const prev = modelMap.get(mKey) || { modelId: m.modelId || mKey, modelName: m.modelName || mKey, inTok: 0, outTok: 0, cacheRead: 0, thinkTok: 0, requests: 0, effOutTok: 0, effSec: 0, ttftSec: 0 };
          prev.inTok += m.inTok || 0;
          prev.outTok += m.outTok || 0;
          prev.cacheRead += m.cacheRead || 0;
          prev.thinkTok += m.thinkTok || 0;
          prev.requests += m.requests || 0;
          prev.effOutTok += m.effOutTok || 0;
          prev.effSec += m.effSec || 0;
          prev.ttftSec += m.ttftSec || 0;
          modelMap.set(mKey, prev);
          if ((m.effOutTok || 0) > 0 && (m.effSec || 0) > 0) {
            slotModels[mKey] = { modelId: prev.modelId, modelName: prev.modelName, tps: Math.round(m.effOutTok / m.effSec), requests: m.requests || 0 };
          }
        }
        if (Object.keys(slotModels).length > 0) {
          speedBuckets.push({ label: `${String(hr).padStart(2, "0")}:00`, fullLabel: hKey, models: slotModels });
        }
      }
    } else if (overview.dailyModelStats) {
      for (const dtKey of spec.dates) {
        const dModels = overview.dailyModelStats[dtKey];
        if (!dModels) continue;
        const slotModels = {};
        for (const [mKey, m] of Object.entries(dModels)) {
          if (!mKey || mKey === "unknown" || (m.modelName || "").toLowerCase().includes("unknown")) continue;
          const prev = modelMap.get(mKey) || { modelId: m.modelId || mKey, modelName: m.modelName || mKey, inTok: 0, outTok: 0, cacheRead: 0, thinkTok: 0, requests: 0, effOutTok: 0, effSec: 0, ttftSec: 0 };
          prev.inTok += m.inTok || 0;
          prev.outTok += m.outTok || 0;
          prev.cacheRead += m.cacheRead || 0;
          prev.thinkTok += m.thinkTok || 0;
          prev.requests += m.requests || 0;
          prev.effOutTok += m.effOutTok || 0;
          prev.effSec += m.effSec || 0;
          prev.ttftSec += m.ttftSec || 0;
          modelMap.set(mKey, prev);
          if ((m.effOutTok || 0) > 0 && (m.effSec || 0) > 0) {
            slotModels[mKey] = { modelId: prev.modelId, modelName: prev.modelName, tps: Math.round(m.effOutTok / m.effSec), requests: m.requests || 0 };
          }
        }
        if (Object.keys(slotModels).length > 0) {
          speedBuckets.push({ label: shortDateLabel(dtKey), fullLabel: dtKey, models: slotModels });
        }
      }
    }

    const models = Array.from(modelMap.values())
      .map((m) => ({
        ...m,
        totalTokens: m.inTok + m.outTok + m.cacheRead,
        avgTps: m.effSec > 0 ? Math.round(m.effOutTok / m.effSec) : 0,
        avgTtft: m.requests > 0 ? Math.round((m.ttftSec / m.requests) * 100) / 100 : 0
      }))
      .filter((m) => m.totalTokens > 0 || m.requests > 0)
      .sort((a, b) => b.totalTokens - a.totalTokens);

    const modelEstimatedCost = models.reduce((acc, m) => acc + calcCost(m.modelId || m.modelName, m.inTok, m.outTok, m.cacheRead), 0);

    // 聚合工具分布
    const toolCounts = new Map();
    if (overview.dailyToolStats) {
      for (const dtKey of spec.dates) {
        const dtTools = overview.dailyToolStats[dtKey];
        if (!dtTools) continue;
        for (const [rawName, cnt] of Object.entries(dtTools)) {
          toolCounts.set(rawName, (toolCounts.get(rawName) || 0) + (Number(cnt) || 0));
        }
      }
    }
    const toolTotal = Array.from(toolCounts.values()).reduce((a, b) => a + b, 0);
    const tools = Array.from(toolCounts.entries())
      .map(([rawName, count]) => {
        const meta = getToolMeta(rawName);
        return {
          rawName,
          name: meta.name,
          category: meta.category,
          color: meta.color,
          count,
          percentage: toolTotal > 0 ? Math.round((count / toolTotal) * 1000) / 10 : 0
        };
      })
      .sort((a, b) => b.count - a.count);

    // 聚合工作区分布
    const projMap = new Map();
    const projConvSets = new Map();
    if (overview.dailyProjectStats) {
      for (const dtKey of spec.dates) {
        const dp = overview.dailyProjectStats[dtKey];
        if (!dp) continue;
        for (const [pk, p] of Object.entries(dp)) {
          if (!projMap.has(pk)) {
            projMap.set(pk, {
              projectKey: p.projectKey,
              name: p.name,
              fullPath: p.fullPath,
              displayPath: p.displayPath,
              badgeText: p.badgeText,
              isWorkspace: p.isWorkspace,
              tokenCount: 0,
              inputTok: 0,
              outTok: 0,
              cacheRead: 0,
              requests: 0,
              conversationCount: 0
            });
            projConvSets.set(pk, new Set());
          }
          const cur = projMap.get(pk);
          cur.inputTok += p.inTok || 0;
          cur.outTok += p.outTok || 0;
          cur.cacheRead += p.cacheRead || 0;
          cur.tokenCount += (p.inTok || 0) + (p.outTok || 0) + (p.cacheRead || 0);
          cur.requests += p.requests || 0;
          const set = projConvSets.get(pk);
          for (const cid of p.conversationIds || []) set.add(cid);
        }
      }
    }
    for (const [pk, cur] of projMap.entries()) {
      cur.conversationCount = projConvSets.get(pk)?.size || 0;
    }
    const projects = Array.from(projMap.values()).sort((a, b) => b.tokenCount - a.tokenCount || b.conversationCount - a.conversationCount);

    // 聚合账号分布
    const acctMap = new Map();
    const acctConvSets = new Map();
    const acctOverviewByEmail = new Map((overview.accountDistribution || []).map((a) => [a.account, a]));
    if (overview.dailyAccountStats) {
      for (const dtKey of spec.dates) {
        const da = overview.dailyAccountStats[dtKey];
        if (!da) continue;
        for (const [em, a] of Object.entries(da)) {
          if (!acctMap.has(em)) {
            const ov = acctOverviewByEmail.get(em);
            acctMap.set(em, {
              account: em,
              totalTokens: 0,
              cost: 0,
              inputTok: 0,
              outTok: 0,
              cacheRead: 0,
              thinkTok: 0,
              requests: 0,
              conversationCount: 0,
              isCurrent: Boolean(ov?.isCurrent),
              isUntracked: Boolean(ov?.isUntracked || em.toLowerCase().includes("untracked")),
              quotaCapacity: ov?.quotaCapacity,
              userTier: ov?.userTier,
              planName: ov?.planName,
              planDetails: ov?.planDetails
            });
            acctConvSets.set(em, new Set());
          }
          const cur = acctMap.get(em);
          cur.inputTok += a.inTok || 0;
          cur.outTok += a.outTok || 0;
          cur.cacheRead += a.cacheRead || 0;
          cur.thinkTok += a.thinkTok || 0;
          cur.totalTokens += (a.inTok || 0) + (a.outTok || 0) + (a.cacheRead || 0);
          cur.cost += a.cost || 0;
          cur.requests += a.requests || 0;
          const set = acctConvSets.get(em);
          for (const cid of a.conversationIds || []) set.add(cid);
        }
      }
    }
    for (const [em, cur] of acctMap.entries()) {
      const set = acctConvSets.get(em);
      cur.convIds = set ? Array.from(set) : [];
      cur.conversationCount = cur.convIds.length;
    }
    const accounts = Array.from(acctMap.values()).sort((a, b) => {
      if (a.isUntracked !== b.isUntracked) return a.isUntracked ? 1 : -1;
      if (Math.abs((b.cost || 0) - (a.cost || 0)) > 0.0001) return (b.cost || 0) - (a.cost || 0);
      return b.totalTokens - a.totalTokens;
    });

    const acctRangeCost = accounts.reduce((acc, a) => acc + (a.cost || 0), 0);
    const estimatedCost = acctRangeCost > 0 ? acctRangeCost : modelEstimatedCost;

    const totalTok = inTok + outTok + cacheRead;
    const denom = inTok + cacheRead;
    const cacheEfficiency = denom > 0 ? Math.round((cacheRead / denom) * 1000) / 10 : 0;
    const avgTokPerSec = effSec > 0 ? Math.round(effOutTok / effSec) : 0;
    const p50TokPerSec = medianFromHist(tpsHist) || avgTokPerSec;
    const avgTtft = ttftCount > 0 ? Math.round((ttftSum / ttftCount) * 100) / 100 : 0;
    const avgTurnLatency = validTurnCount > 0 ? Math.round((turnDurSum / validTurnCount) * 100) / 100 : 0;

    return {
      isSession: false,
      totalTokens: { input: inTok, output: outTok, cacheRead, thinking: thinkTok, total: totalTok },
      requests,
      userTurns,
      avgTokPerSec,
      p50TokPerSec,
      avgTurnLatency,
      avgTtft,
      cacheEfficiency,
      estimatedCost,
      activityBars,
      models,
      speedSeries: { models, buckets: speedBuckets, dateBounds: spec.dates },
      scatterPts,
      tools,
      projects,
      accounts
    };
  }

  function buildSessionSpeedSeries(session) {
    const models = (session.models || []).filter((m) => m.modelId !== "unknown");
    const slots = session.speedTimeline?.slots || [];
    const buckets = slots.map((slot) => {
      const dt = new Date(slot.bucketStartSec * 1000);
      const lbl = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
      const mOut = {};
      for (const [mKey, m] of Object.entries(slot.models || {})) {
        if ((m.effOutTok || 0) > 0 && (m.effSec || 0) > 0) {
          mOut[mKey] = {
            modelId: m.modelId || mKey,
            modelName: m.modelName || mKey,
            tps: Math.round(m.effOutTok / m.effSec),
            requests: m.requests || 0
          };
        }
      }
      return { label: lbl, fullLabel: dt.toLocaleString(), models: mOut };
    });
    return { models, buckets, dateBounds: buckets.map((b) => b.label) };
  }

  function renderHeroAndKpis(agg, spec) {
    const t = agg?.totalTokens || { input: 0, output: 0, cacheRead: 0, thinking: 0, total: 0 };
    const total = Number(t.total) || 0;
    const approx = total >= 1e6 ? `~${(total / 1e6).toFixed(1)}M` : total >= 1e3 ? `~${(total / 1e3).toFixed(1)}k` : "";

    document.getElementById("nb-hero-total").textContent = fmtInt(total);
    document.getElementById("nb-hero-approx").textContent = approx;

    const pctOf = (v) => (total > 0 ? `(${((v / total) * 100).toFixed(1)}%)` : "(0.0%)");
    document.getElementById("nb-hb-in").textContent = fmtInt(t.input);
    document.getElementById("nb-hb-in-pct").textContent = pctOf(t.input);
    document.getElementById("nb-hb-cache").textContent = fmtInt(t.cacheRead);
    document.getElementById("nb-hb-cache-pct").textContent = pctOf(t.cacheRead);
    document.getElementById("nb-hb-think").textContent = fmtInt(t.thinking);
    document.getElementById("nb-hb-think-pct").textContent = pctOf(t.thinking);
    document.getElementById("nb-hb-out").textContent = fmtInt(t.output);
    document.getElementById("nb-hb-out-pct").textContent = pctOf(t.output);

    const bar = document.getElementById("nb-hero-bar");
    if (bar) {
      const denom = Math.max(1, (t.input || 0) + (t.cacheRead || 0) + (t.thinking || 0) + (t.output || 0));
      const segs = [
        { val: t.cacheRead || 0, color: "#10b981", name: "缓存读取" },
        { val: t.input || 0, color: "#6366f1", name: "输入" },
        { val: t.thinking || 0, color: "#a855f7", name: "思考过程" },
        { val: t.output || 0, color: "#60a5fa", name: "输出" }
      ].filter((s) => s.val > 0);
      bar.innerHTML = segs
        .map((s) => {
          const w = Math.max(0.4, (s.val / denom) * 100);
          return `<span class="nb-hero-seg" style="width:${w.toFixed(2)}%;background:${s.color}" title="${s.name}: ${fmtInt(s.val)}"></span>`;
        })
        .join("");
    }

    document.getElementById("nb-kpi-tps").textContent = agg && agg.avgTokPerSec > 0 ? String(agg.avgTokPerSec) : "--";
    document.getElementById("nb-kpi-p50").textContent = agg && agg.p50TokPerSec > 0 ? `${agg.p50TokPerSec} tok/s` : "--";
    document.getElementById("nb-kpi-turn-lat").textContent = agg && agg.avgTurnLatency > 0 ? `${agg.avgTurnLatency.toFixed(2)}s` : "--";

    const reqs = agg?.requests || 0;
    const turns = agg?.userTurns || 0;
    const tokPerTurn = turns > 0 ? Math.round(total / turns) : 0;
    document.getElementById("nb-kpi-reqs").textContent = fmtInt(reqs);
    document.getElementById("nb-kpi-turns").textContent = `${fmtInt(turns)} 轮`;
    document.getElementById("nb-kpi-tok-per-turn").textContent = tokPerTurn > 0 ? fmtInt(tokPerTurn) : "--";

    document.getElementById("nb-kpi-cache").textContent = agg ? `${agg.cacheEfficiency.toFixed(1)}%` : "--";
    document.getElementById("nb-kpi-ttft").textContent = agg && agg.avgTtft > 0 ? agg.avgTtft.toFixed(2) : "--";
    document.getElementById("nb-kpi-cost").textContent = agg ? `$${agg.estimatedCost.toFixed(2)}` : "$0.00";
    document.getElementById("nb-activity-title").textContent = `Token 活跃趋势（${spec.labelZh}）`;
  }

  function niceAxisMax(maxVal) {
    if (maxVal <= 0) return 100;
    const exp = Math.pow(10, Math.floor(Math.log10(maxVal)));
    const frac = maxVal / exp;
    const mult = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
    return mult * exp;
  }

  function renderActivityChart(bars) {
    const el = document.getElementById("nb-activity-chart");
    if (!el) return;
    if (!bars || bars.length === 0 || bars.every((b) => b.inTok + b.outTok + b.cacheRead === 0)) {
      el.innerHTML = `<div class="nb-empty-hint" style="text-align:center;padding:34px 0;">当前时间范围内暂无 Token 活动记录</div>`;
      return;
    }

    const W = 720;
    const H = 200;
    const padL = 52;
    const padR = 12;
    const padT = 14;
    const padB = 26;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    const maxSum = Math.max(100, ...bars.map((b) => (b.inTok || 0) + (b.outTok || 0) + (b.cacheRead || 0)));
    const yMax = niceAxisMax(maxSum);
    const ticks = [0, 0.25, 0.5, 0.75, 1];

    const gridSvg = ticks
      .map((r) => {
        const y = padT + chartH - r * chartH;
        const val = yMax * r;
        const lbl = val === 0 ? "0" : fmtNum(val);
        return `
          <line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="2 3" />
          <text x="${padL - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" fill="#6b7280" font-size="10" font-family="var(--nb-font-mono)">${lbl}</text>
        `;
      })
      .join("");

    const n = bars.length;
    const step = chartW / n;
    const barW = Math.max(4, Math.min(20, step * 0.62));
    const labelStep = Math.max(1, Math.ceil(n / 10));

    const barsSvg = bars
      .map((b, i) => {
        const x = padL + i * step + (step - barW) / 2;
        const cacheH = ((b.cacheRead || 0) / yMax) * chartH;
        const inH = ((b.inTok || 0) / yMax) * chartH;
        const outH = ((b.outTok || 0) / yMax) * chartH;
        const tot = (b.inTok || 0) + (b.outTok || 0) + (b.cacheRead || 0);

        const yCache = padT + chartH - cacheH;
        const yIn = yCache - inH;
        const yOut = yIn - outH;

        const tip = `
          <div class="nb-tip-head"><span>${esc(b.fullLabel)}</span><span class="nb-tip-tag">${b.requests} 次调用</span></div>
          <div class="nb-tip-row"><span>总计</span><b>${fmtNum(tot)}</b></div>
          <div class="nb-tip-row"><span><i class="nb-dot" style="background:#60a5fa"></i>输出</span><b>${fmtNum(b.outTok)}</b></div>
          <div class="nb-tip-row"><span><i class="nb-dot" style="background:#6366f1"></i>输入</span><b>${fmtNum(b.inTok)}</b></div>
          <div class="nb-tip-row"><span><i class="nb-dot" style="background:#10b981"></i>缓存读取</span><b>${fmtNum(b.cacheRead)}</b></div>
        `;

        const showLbl = i % labelStep === 0 || i === n - 1;
        return `
          <g class="nb-svg-bar-grp" data-tooltip-html="${esc(tip)}">
            <rect x="${(padL + i * step).toFixed(1)}" y="${padT}" width="${step.toFixed(1)}" height="${chartH}" fill="transparent" />
            ${cacheH > 0 ? `<rect x="${x.toFixed(1)}" y="${yCache.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1, cacheH).toFixed(1)}" rx="1.5" fill="#10b981" />` : ""}
            ${inH > 0 ? `<rect x="${x.toFixed(1)}" y="${yIn.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1, inH).toFixed(1)}" fill="#6366f1" />` : ""}
            ${outH > 0 ? `<rect x="${x.toFixed(1)}" y="${yOut.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1, outH).toFixed(1)}" rx="1.5" fill="#60a5fa" />` : ""}
          </g>
          ${showLbl ? `<text x="${(x + barW / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" fill="#6b7280" font-size="9.5" font-family="var(--nb-font-mono)">${esc(b.label)}</text>` : ""}
        `;
      })
      .join("");

    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="nb-svg-chart">${gridSvg}${barsSvg}</svg>`;
    bindDataTooltips(el);
  }

  function renderModelsDistribution(models, spec) {
    const el = document.getElementById("nb-models-list");
    const sumEl = document.getElementById("nb-models-summary");
    if (!el) return;
    const activeModels = (models || []).filter((m) => (m.totalTokens || 0) > 0);
    if (activeModels.length === 0) {
      if (sumEl) sumEl.style.display = "none";
      el.innerHTML = `<div class="nb-empty-hint">当前范围暂无模型调用记录</div>`;
      return;
    }

    const enriched = activeModels.map((m) => {
      const cost = calcCost(m.modelId || m.modelName, m.inTok, m.outTok, m.cacheRead);
      const saved = calcCacheSavings(m.modelId || m.modelName, m.cacheRead);
      return { ...m, _cost: cost, _saved: saved, _display: formatModelDisplay(m.modelId, m.modelName) };
    });

    const totTok = enriched.reduce((a, m) => a + (m.totalTokens || 0), 0);
    const totCost = enriched.reduce((a, m) => a + m._cost, 0);
    const totSaved = enriched.reduce((a, m) => a + m._saved, 0);

    if (sumEl) {
      sumEl.style.display = "flex";
      sumEl.innerHTML = `
        <span>API 折算总额 <b>≈ $${totCost.toFixed(2)}</b> <span class="nb-muted">(约 ¥${(totCost * USD_TO_CNY).toFixed(1)})</span> · 总计 <b>${fmtNum(totTok)}</b> Token · 缓存省下 <b>≈ $${totSaved.toFixed(2)}</b></span>
        <span class="nb-scope-pill">${esc(spec?.labelZh || "近 30 天")}</span>
      `;
    }

    const maxTok = Math.max(1, ...enriched.map((m) => m.totalTokens || 0));
    el.innerHTML = enriched
      .map((m, idx) => {
        const color = MODEL_COLORS[idx % MODEL_COLORS.length];
        const tot = m.totalTokens || 0;
        const barPct = tot > 0 ? Math.max(0.8, (tot / maxTok) * 100) : 0;
        const denom = (m.inTok || 0) + (m.cacheRead || 0);
        const cachePct = denom > 0 ? Math.round(((m.cacheRead || 0) / denom) * 100) : 0;
        const cnyStr = (m._cost * USD_TO_CNY).toFixed(1);
        return `
          <div class="nb-model-row">
            <div class="nb-model-top">
              <div class="nb-model-id-wrap">
                <i class="nb-dot" style="background:${color}"></i>
                <span class="nb-model-name">${esc(m._display)}</span>
                <span class="nb-code-pill">${esc(m.modelId)}</span>
              </div>
              <div class="nb-model-totals">
                <span class="nb-model-cost" title="按商业 API 公开单价折算 (美元 / 人民币)">≈ $${m._cost.toFixed(2)} <small>(¥${cnyStr})</small></span>
                <b>${fmtNum(tot)}</b> <span class="nb-muted">Token (${m.requests} 次调用)</span>
              </div>
            </div>
            <div class="nb-model-track"><div class="nb-model-fill" style="width:${barPct.toFixed(2)}%;background:${color}"></div></div>
            <div class="nb-model-foot">
              <span class="nb-muted">缓存 ${cachePct}% (${fmtNum(m.cacheRead)}) · 输出 ${fmtNum(m.outTok)} · 输入 ${fmtNum(m.inTok)} · 思考 ${fmtNum(m.thinkTok)}</span>
              <span class="nb-tps-pill">${m.avgTps > 0 ? `${m.avgTps} tok/s` : "-- tok/s"}</span>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderSpeedTrendsChart(speedSeries, models) {
    const el = document.getElementById("nb-speed-trends-chart");
    const legEl = document.getElementById("nb-speed-legend");
    if (!el || !legEl) return;

    const topModels = (models || []).filter((m) => (m.totalTokens || 0) > 0).slice(0, 6);
    legEl.innerHTML = topModels
      .map((m, idx) => `<span class="nb-leg-item"><i class="nb-leg-line" style="background:${MODEL_COLORS[idx % MODEL_COLORS.length]}"></i>${esc(formatModelDisplay(m.modelId, m.modelName))}</span>`)
      .join("");

    const rawBuckets = speedSeries?.buckets || [];
    if (topModels.length === 0 || rawBuckets.length === 0) {
      el.innerHTML = `<div class="nb-empty-hint" style="text-align:center;padding:30px 0;">暂无足够流式速率样本</div>`;
      return;
    }

    // 若存在完整日期轴，按真实日期刻度对齐（保留空日期位置，使趋势横轴时间比例真实）
    const bounds = Array.isArray(speedSeries?.dateBounds) ? speedSeries.dateBounds : [];
    let buckets = rawBuckets;
    if (bounds.length >= 2 && bounds.length <= 60 && /^\d{4}-\d{2}-\d{2}$/.test(bounds[0])) {
      const byFull = new Map(rawBuckets.map((b) => [b.fullLabel, b]));
      const firstActive = bounds.findIndex((d) => byFull.has(d));
      const trimmed = firstActive > 0 ? bounds.slice(firstActive) : bounds;
      buckets = trimmed.map((dtKey) => byFull.get(dtKey) || { label: shortDateLabel(dtKey), fullLabel: dtKey, models: {} });
    }

    const W = 720;
    const H = 195;
    const padL = 42;
    const padR = 16;
    const padT = 14;
    const padB = 26;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    let maxTps = 100;
    for (const b of buckets) {
      for (const m of Object.values(b.models || {})) {
        if (m.tps > maxTps) maxTps = m.tps;
      }
    }
    const yMax = niceAxisMax(maxTps * 1.1);
    const ticks = [0, 0.25, 0.5, 0.75, 1];
    const gridSvg = ticks
      .map((r) => {
        const y = padT + chartH - r * chartH;
        const val = Math.round(yMax * r);
        return `
          <line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="2 3" />
          <text x="${padL - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" fill="#6b7280" font-size="10" font-family="var(--nb-font-mono)">${val}</text>
        `;
      })
      .join("");

    const n = buckets.length;
    const xOf = (i) => (n <= 1 ? padL + chartW / 2 : padL + (i / (n - 1)) * chartW);
    const labelStep = Math.max(1, Math.ceil(n / 7));
    const xLblSvg = buckets
      .map((b, i) => {
        if (i % labelStep !== 0 && i !== n - 1) return "";
        return `<text x="${xOf(i).toFixed(1)}" y="${H - 6}" text-anchor="middle" fill="#6b7280" font-size="9.5" font-family="var(--nb-font-mono)">${esc(b.label)}</text>`;
      })
      .join("");

    const seriesSvg = topModels
      .map((m, idx) => {
        const color = MODEL_COLORS[idx % MODEL_COLORS.length];
        const displayTitle = formatModelDisplay(m.modelId, m.modelName);
        const pts = [];
        buckets.forEach((b, i) => {
          const hit = b.models?.[m.modelId] || Object.values(b.models || {}).find((x) => x.modelName === m.modelName);
          if (hit && hit.tps > 0) {
            pts.push({ x: xOf(i), y: padT + chartH - (hit.tps / yMax) * chartH, tps: hit.tps, reqs: hit.requests, bucket: b.fullLabel });
          }
        });
        if (pts.length === 0) return "";
        const lineSvg =
          pts.length >= 2
            ? `<polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}" opacity="0.88" />`
            : "";
        const dotsSvg = pts
          .map((p) => {
            const tip = `
              <div class="nb-tip-head"><span>${esc(displayTitle)}</span><span class="nb-tip-tag">${esc(p.bucket)}</span></div>
              <div class="nb-tip-row"><span>流式速率</span><b>${p.tps} tok/s</b></div>
              <div class="nb-tip-row"><span>调用次数</span><b>${p.reqs} 次</b></div>
            `;
            return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.4" fill="${color}" stroke="#131314" stroke-width="1.2" class="nb-svg-pt" data-tooltip-html="${esc(tip)}" />`;
          })
          .join("");
        return lineSvg + dotsSvg;
      })
      .join("");

    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="nb-svg-chart">${gridSvg}${xLblSvg}${seriesSvg}</svg>`;
    bindDataTooltips(el);
  }

  function renderLatencyScatterChart(rawPts, spec) {
    const titleEl = document.getElementById("nb-scatter-title");
    const legEl = document.getElementById("nb-scatter-legend");
    const el = document.getElementById("nb-latency-scatter-chart");
    if (!el || !legEl) return;

    if (titleEl) {
      titleEl.textContent = `单轮耗时与首字延迟分布（${spec.labelZh}）`;
    }

    const pts = (rawPts || []).filter((p) => p.ttft > 0 && p.totDur > 0 && p.ttft < 300 && p.totDur < 600);
    if (pts.length === 0) {
      legEl.innerHTML = "";
      el.innerHTML = `<div class="nb-empty-hint" style="text-align:center;padding:30px 0;">暂无足够响应耗时散点数据</div>`;
      return;
    }

    const ttfts = pts.map((p) => p.ttft).sort((a, b) => a - b);
    const durs = pts.map((p) => p.totDur).sort((a, b) => a - b);
    const p50X = quantile(ttfts, 0.5);
    const p50Y = quantile(durs, 0.5);
    const p95X = quantile(ttfts, 0.95);
    const p95Y = quantile(durs, 0.95);

    legEl.innerHTML = `
      <span class="nb-leg-item"><i class="nb-dot" style="background:#10b981"></i>轮次 (${fmtInt(pts.length)})</span>
      <span class="nb-leg-item"><i class="nb-leg-dash" style="border-color:#3B82F6"></i>P50 中位 (${p50X.toFixed(1)}s · ${p50Y.toFixed(1)}s)</span>
      <span class="nb-leg-item"><i class="nb-leg-dash" style="border-color:#F59E0B"></i>P95 尾部 (${p95X.toFixed(1)}s · ${p95Y.toFixed(1)}s)</span>
    `;

    const xMax = Math.max(5, Math.ceil(Math.max(p95X * 1.45, ...ttfts.slice(-5)) / 5) * 5);
    const yMax = Math.max(5, Math.ceil(Math.max(p95Y * 1.45, ...durs.slice(-5)) / 5) * 5);

    const W = 720;
    const H = 225;
    const padL = 44;
    const padR = 24;
    const padT = 22;
    const padB = 34;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    const xOf = (v) => padL + Math.min(1, Math.max(0, v / xMax)) * chartW;
    const yOf = (v) => padT + chartH - Math.min(1, Math.max(0, v / yMax)) * chartH;

    const gridSvg = [0, 0.2, 0.4, 0.6, 0.8, 1]
      .map((r) => {
        const y = padT + chartH - r * chartH;
        const x = padL + r * chartW;
        return `
          <line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="2 3" />
          <text x="${padL - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" fill="#6b7280" font-size="9.5" font-family="var(--nb-font-mono)">${Math.round(yMax * r)}s</text>
          <text x="${x.toFixed(1)}" y="${H - 14}" text-anchor="middle" fill="#6b7280" font-size="9.5" font-family="var(--nb-font-mono)">${Math.round(xMax * r)}s</text>
        `;
      })
      .join("");

    const diagEnd = Math.min(xMax, yMax);
    const diagSvg = `
      <line x1="${xOf(0).toFixed(1)}" y1="${yOf(0).toFixed(1)}" x2="${xOf(diagEnd).toFixed(1)}" y2="${yOf(diagEnd).toFixed(1)}" stroke="rgba(255,255,255,0.16)" stroke-dasharray="3 4" />
      <text x="${(xOf(diagEnd) - 8).toFixed(1)}" y="${(yOf(diagEnd) - 6).toFixed(1)}" text-anchor="end" fill="#6b7280" font-size="9.5" font-family="var(--nb-font-mono)">y = x（零流式参考线）</text>
    `;

    const refSvg = `
      <line x1="${xOf(p50X).toFixed(1)}" y1="${padT}" x2="${xOf(p50X).toFixed(1)}" y2="${padT + chartH}" stroke="#3B82F6" stroke-dasharray="3 3" opacity="0.7" />
      <line x1="${padL}" y1="${yOf(p50Y).toFixed(1)}" x2="${W - padR}" y2="${yOf(p50Y).toFixed(1)}" stroke="#3B82F6" stroke-dasharray="3 3" opacity="0.7" />
      <line x1="${xOf(p95X).toFixed(1)}" y1="${padT}" x2="${xOf(p95X).toFixed(1)}" y2="${padT + chartH}" stroke="#F59E0B" stroke-dasharray="3 3" opacity="0.7" />
      <line x1="${padL}" y1="${yOf(p95Y).toFixed(1)}" x2="${W - padR}" y2="${yOf(p95Y).toFixed(1)}" stroke="#F59E0B" stroke-dasharray="3 3" opacity="0.7" />
      <rect x="${(xOf(p50X) - 26).toFixed(1)}" y="3" width="52" height="15" rx="4" fill="#1d4ed8" opacity="0.88" />
      <text x="${xOf(p50X).toFixed(1)}" y="13.5" text-anchor="middle" fill="#eff6ff" font-size="9" font-family="var(--nb-font-mono)">P50 ${p50X.toFixed(1)}s</text>
      <rect x="${(xOf(p95X) - 26).toFixed(1)}" y="3" width="52" height="15" rx="4" fill="#b45309" opacity="0.9" />
      <text x="${xOf(p95X).toFixed(1)}" y="13.5" text-anchor="middle" fill="#fffbeb" font-size="9" font-family="var(--nb-font-mono)">P95 ${p95X.toFixed(1)}s</text>
      <rect x="${(W - padR - 36).toFixed(1)}" y="${(yOf(p50Y) - 8).toFixed(1)}" width="36" height="15" rx="4" fill="#1d4ed8" opacity="0.88" />
      <text x="${(W - padR - 18).toFixed(1)}" y="${(yOf(p50Y) + 2.5).toFixed(1)}" text-anchor="middle" fill="#eff6ff" font-size="9" font-family="var(--nb-font-mono)">${p50Y.toFixed(1)}s</text>
      <rect x="${(W - padR - 36).toFixed(1)}" y="${(yOf(p95Y) - 8).toFixed(1)}" width="36" height="15" rx="4" fill="#b45309" opacity="0.9" />
      <text x="${(W - padR - 18).toFixed(1)}" y="${(yOf(p95Y) + 2.5).toFixed(1)}" text-anchor="middle" fill="#fffbeb" font-size="9" font-family="var(--nb-font-mono)">${p95Y.toFixed(1)}s</text>
    `;

    const maxDraw = 420;
    const sampled = pts.length <= maxDraw ? pts : Array.from({ length: maxDraw }, (_, i) => pts[Math.floor((i * pts.length) / maxDraw)]);
    const ptsSvg = sampled
      .map((p) => {
        const tip = `
          <div class="nb-tip-head"><span>${esc(p.label || "轮次")}</span>${p.speed ? `<span class="nb-tip-tag">${p.speed} tok/s</span>` : ""}</div>
          <div class="nb-tip-row"><span>首字延迟</span><b>${p.ttft.toFixed(2)}s</b></div>
          <div class="nb-tip-row"><span>总耗时</span><b>${p.totDur.toFixed(2)}s</b></div>
          ${p.outTok ? `<div class="nb-tip-row"><span>输出</span><b>${fmtInt(p.outTok)} Token</b></div>` : ""}
        `;
        return `<circle cx="${xOf(p.ttft).toFixed(1)}" cy="${yOf(p.totDur).toFixed(1)}" r="2.2" fill="#10b981" fill-opacity="0.7" class="nb-svg-pt" data-tooltip-html="${esc(tip)}" />`;
      })
      .join("");

    const axesTitles = `
      <text x="${padL + chartW / 2}" y="${H - 2}" text-anchor="middle" fill="#6b7280" font-size="9.5">首字响应时间 (TTFT，秒)</text>
      <text x="11" y="${padT + chartH / 2}" text-anchor="middle" fill="#6b7280" font-size="9.5" transform="rotate(-90 11 ${padT + chartH / 2})">总耗时 (秒)</text>
    `;

    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="nb-svg-chart">${gridSvg}${diagSvg}${ptsSvg}${refSvg}${axesTitles}</svg>`;
    bindDataTooltips(el);
  }

  function renderToolsDistribution(tools) {
    const totalEl = document.getElementById("nb-tools-total");
    const listEl = document.getElementById("nb-tools-list");
    if (!listEl) return;
    const total = (tools || []).reduce((acc, t) => acc + (t.count || 0), 0);
    if (totalEl) totalEl.textContent = fmtInt(total);
    if (!tools || tools.length === 0) {
      listEl.innerHTML = `<div class="nb-empty-hint">当前范围暂无工具调用记录</div>`;
      return;
    }
    const maxCnt = Math.max(1, ...tools.map((t) => t.count || 0));
    listEl.innerHTML = tools
      .slice(0, 18)
      .map((t) => {
        const meta = getToolMeta(t.rawName || t.name);
        const wPct = Math.max(0.8, ((t.count || 0) / maxCnt) * 100);
        const isRenamed = meta.name && meta.name !== t.rawName;
        return `
          <div class="nb-tool-row">
            <div class="nb-tool-top">
              <div class="nb-tool-left">
                <span class="nb-cat-badge" style="color:${meta.color};border-color:${meta.color}44;background:${meta.color}18">${esc(meta.category)}</span>
                <span class="nb-tool-name">${esc(meta.name)}</span>
                ${isRenamed || t.rawName ? `<span class="nb-code-pill">${esc(t.rawName || t.name)}</span>` : ""}
              </div>
              <div class="nb-tool-right">
                <b>${fmtInt(t.count)}</b> <span class="nb-muted">次调用</span>
                <span class="nb-pct-pill">${Number(t.percentage || 0).toFixed(1)}%</span>
              </div>
            </div>
            <div class="nb-model-track"><div class="nb-model-fill" style="width:${wPct.toFixed(2)}%;background:${meta.color}"></div></div>
          </div>
        `;
      })
      .join("");
  }

  function renderProjectsDistribution(agg, overview, spec) {
    const el = document.getElementById("nb-projects-list");
    if (!el) return;
    const list = projectsScope === "all-time" ? overview?.projects || [] : agg?.projects || [];
    const scopeLbl = projectsScope === "all-time" ? "全量历史" : spec.labelZh;

    if (!list || list.length === 0) {
      el.innerHTML = `<div class="nb-empty-hint">当前范围暂无工作区活动记录</div>`;
      return;
    }
    const totTok = list.reduce((a, p) => a + (p.tokenCount || 0), 0);
    const totSessions = list.reduce((a, p) => a + (p.conversationCount || 0), 0);

    const rowsHtml = list
      .map((p) => {
        const pct = totTok > 0 ? ((p.tokenCount || 0) / totTok) * 100 : 0;
        const pctStr = (p.tokenCount || 0) > 0 && pct < 0.1 ? "<0.1%" : `${pct.toFixed(1)}%`;
        const dispName = !p.isWorkspace && p.name === "Conversations" ? "独立会话" : p.name;
        const pathPill =
          p.isWorkspace && p.fullPath
            ? `<span class="nb-path-pill"><span class="nb-path-txt" title="${esc(p.fullPath)}">${esc(p.displayPath || p.name)}</span><button type="button" class="nb-open-dir-btn" data-open-path="${esc(p.fullPath)}" title="在文件管理器中打开">↗</button></span>`
            : `<span class="nb-path-pill muted">无关联工作区</span>`;
        return `
          <div class="nb-proj-row">
            <div class="nb-proj-top">
              <span class="nb-proj-name">${esc(dispName)}</span>
              <div class="nb-proj-stats">
                <span class="nb-muted">${fmtInt(p.conversationCount)} 个会话 ·</span>
                <b>${fmtNum(p.tokenCount)}</b> <span class="nb-muted">Token</span>
                <span class="nb-pct-pill">${pctStr}</span>
              </div>
            </div>
            <div class="nb-model-track"><div class="nb-model-fill" style="width:${pct.toFixed(2)}%;background:#3B82F6"></div></div>
            <div class="nb-proj-foot">${pathPill}</div>
          </div>
        `;
      })
      .join("");

    el.innerHTML = `
      <div class="nb-dist-summary">
        <span><b>${fmtInt(list.length)}</b> 个工作区 · <b>${fmtInt(totSessions)}</b> 个会话 · <b>${fmtNum(totTok)}</b> Token</span>
        <span class="nb-scope-pill">${esc(scopeLbl)}</span>
      </div>
      <div class="nb-proj-list">${rowsHtml}</div>
    `;

    el.querySelectorAll("button[data-open-path]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const p = btn.getAttribute("data-open-path");
        if (!p) return;
        try {
          const r = await apiFetch("/api/open-directory", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: p })
          });
          const j = await r.json();
          if (!j.ok) showToast(`打开目录失败：${j.error || ""}`);
        } catch {
          showToast("打开目录请求失败");
        }
      });
    });
  }

  function syncAccountPrefsUi(rawAccounts) {
    const hideEl = document.getElementById("nb-acct-hide-untracked");
    if (hideEl) hideEl.checked = Boolean(accountPrefs.hideUntracked);
    const activeDays = normalizeHeatmapDays(accountPrefs.heatmapDays);
    document.querySelectorAll("#nb-heatmap-range-seg button").forEach((b) => {
      b.classList.toggle("active", Number(b.dataset.days) === activeDays);
    });
    const assignSel = document.getElementById("nb-acct-assign-untracked");
    if (assignSel) {
      const realEmails = Array.from(
        new Set(
          (rawAccounts || [])
            .filter((a) => !a.isUntracked && !String(a.account || "").toLowerCase().includes("untracked"))
            .map((a) => a.account)
            .filter(Boolean)
        )
      );
      const prevVal = accountPrefs.assignUntrackedTo || "";
      assignSel.innerHTML =
        `<option value="">单独列出（不归属）</option>` +
        realEmails.map((em) => `<option value="${esc(em)}">归属至 ${esc(em)}</option>`).join("");
      assignSel.value = realEmails.includes(prevVal) ? prevVal : "";
      assignSel.disabled = realEmails.length === 0;
    }
    const barEl = document.getElementById("nb-acct-controls-bar");
    const hasUntracked = (rawAccounts || []).some(
      (a) => a.isUntracked || String(a.account || "").toLowerCase().includes("untracked")
    );
    if (barEl) {
      barEl.style.display = hasUntracked ? "flex" : "none";
    }
  }

  async function persistAccountPrefs(patch) {
    accountPrefs = { ...accountPrefs, ...patch };
    accountPrefs.heatmapDays = normalizeHeatmapDays(accountPrefs.heatmapDays);
    lsSet("nb.analytics.hideUntracked", accountPrefs.hideUntracked ? "1" : "0");
    lsSet("nb.analytics.assignUntrackedTo", accountPrefs.assignUntrackedTo || "");
    lsSet("nb.analytics.heatmapDays", String(accountPrefs.heatmapDays));
    try {
      await apiFetch("/api/suite-account-prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(accountPrefs)
      });
    } catch {}
    renderAllAnalytics();
  }

  function resolveDailyAcctStat(dailyAccountStats, dt, accountEmail, mergeUntracked) {
    const dayObj = dailyAccountStats?.[dt];
    if (!dayObj) return null;
    const base = dayObj[accountEmail];
    if (!mergeUntracked) return base || null;
    let extra = null;
    for (const [k, v] of Object.entries(dayObj)) {
      if (k.toLowerCase().includes("untracked")) {
        if (!extra) extra = { inTok: 0, outTok: 0, cacheRead: 0, cost: 0, requests: 0 };
        extra.inTok += v.inTok || 0;
        extra.outTok += v.outTok || 0;
        extra.cacheRead += v.cacheRead || 0;
        extra.cost += v.cost || 0;
        extra.requests += v.requests || 0;
      }
    }
    if (!base && !extra) return null;
    return {
      inTok: (base?.inTok || 0) + (extra?.inTok || 0),
      outTok: (base?.outTok || 0) + (extra?.outTok || 0),
      cacheRead: (base?.cacheRead || 0) + (extra?.cacheRead || 0),
      cost: (base?.cost || 0) + (extra?.cost || 0),
      requests: (base?.requests || 0) + (extra?.requests || 0)
    };
  }

  function buildHeatmapHtml(acct, dailyAccountStats) {
    const days = normalizeHeatmapDays(accountPrefs.heatmapDays);
    const totalCells = days === 365 ? 364 : days;
    const titleSuffix = days === 365 ? "近 1 年" : `近 ${days} 天`;
    const mergeUntracked = Boolean(acct._mergedUntracked);
    const today = new Date();
    const dates = [];
    for (let i = totalCells - 1; i >= 0; i--) {
      dates.push(formatDateKeyLocal(new Date(today.getTime() - i * 86400000)));
    }
    let maxVal = 0;
    for (const dt of dates) {
      const dStat = resolveDailyAcctStat(dailyAccountStats, dt, acct.account, mergeUntracked);
      const cost = dStat?.cost || 0;
      maxVal = Math.max(maxVal, cost);
    }
    if (maxVal <= 0) maxVal = 5;

    const cellsHtml = dates
      .map((dt) => {
        const dStat = resolveDailyAcctStat(dailyAccountStats, dt, acct.account, mergeUntracked);
        const tok = dStat ? (dStat.inTok || 0) + (dStat.outTok || 0) + (dStat.cacheRead || 0) : 0;
        const cost = dStat?.cost || 0;
        const reqs = dStat?.requests || 0;
        const hasAct = tok > 0 || cost > 0;
        if (!hasAct) {
          const tip = `<div class="nb-tip-head"><span>${dt}</span></div><div class="nb-muted">暂无活动记录</div>`;
          return `<div class="nb-hm-cell level-0" data-tooltip-html="${esc(tip)}"></div>`;
        }
        const ratio = Math.min(1, Math.max(0.05, cost / maxVal));
        const level = ratio > 0.65 ? "level-4" : ratio > 0.4 ? "level-3" : ratio > 0.15 ? "level-2" : "level-1";
        const tip = `
          <div class="nb-tip-head"><span>${dt}</span><span class="nb-tip-tag">$${cost.toFixed(2)}</span></div>
          <div class="nb-tip-row"><span>Token 总量</span><b>${fmtNum(tok)} (${fmtInt(reqs)} 次)</b></div>
        `;
        return `<div class="nb-hm-cell ${level}" data-tooltip-html="${esc(tip)}"></div>`;
      })
      .join("");

    const midDate = dates[Math.floor(dates.length / 2)] || dates[0];
    return `
      <div class="nb-heatmap-box">
        <div class="nb-heatmap-meta">
          <span>配额消耗活跃度（${titleSuffix}）</span>
          <span class="nb-heatmap-legend">
            <span>少</span>
            <i class="nb-hm-cell level-0"></i>
            <i class="nb-hm-cell level-1"></i>
            <i class="nb-hm-cell level-2"></i>
            <i class="nb-hm-cell level-3"></i>
            <i class="nb-hm-cell level-4"></i>
            <span>多</span>
          </span>
        </div>
        <div class="nb-heatmap-grid days-${days}">${cellsHtml}</div>
        <div class="nb-heatmap-dates">
          <span>${shortDateLabel(dates[0])}</span>
          <span>${shortDateLabel(midDate)}</span>
          <span>${shortDateLabel(dates[dates.length - 1])}</span>
        </div>
      </div>
    `;
  }

  function renderAccountsDistribution(agg, overview, spec) {
    const el = document.getElementById("nb-accounts-list");
    if (!el) return;
    const rawList = accountsScope === "all-time" ? overview?.accountDistribution || [] : agg?.accounts || [];
    const scopeLbl = accountsScope === "all-time" ? "全量历史" : spec.labelZh;
    syncAccountPrefsUi(rawList);

    if (!rawList || rawList.length === 0) {
      el.innerHTML = `<div class="nb-empty-hint">当前范围暂无账号消耗记录</div>`;
      return;
    }

    // 1) 复制并按需合并「早期未跟踪历史」至指定真实账号，或按偏好隐藏
    let workList = rawList.map((item) => ({
      ...item,
      isUntracked: Boolean(item.isUntracked || String(item.account || "").toLowerCase().includes("untracked")),
      convIds: Array.isArray(item.convIds) ? [...item.convIds] : [],
      _mergedUntracked: false
    }));

    const untrackedItems = workList.filter((a) => a.isUntracked);
    const assignTargetEmail = accountPrefs.assignUntrackedTo || "";
    const assignTarget = assignTargetEmail
      ? workList.find((a) => !a.isUntracked && a.account === assignTargetEmail)
      : null;

    let hiddenNote = "";
    if (assignTarget && untrackedItems.length > 0) {
      const mergedSet = new Set(assignTarget.convIds || []);
      for (const u of untrackedItems) {
        assignTarget.totalTokens = (assignTarget.totalTokens || 0) + (u.totalTokens || 0);
        assignTarget.cost = (assignTarget.cost || 0) + (u.cost || 0);
        assignTarget.inputTok = (assignTarget.inputTok || 0) + (u.inputTok || 0);
        assignTarget.outTok = (assignTarget.outTok || 0) + (u.outTok || 0);
        assignTarget.cacheRead = (assignTarget.cacheRead || 0) + (u.cacheRead || 0);
        assignTarget.thinkTok = (assignTarget.thinkTok || 0) + (u.thinkTok || 0);
        assignTarget.requests = (assignTarget.requests || 0) + (u.requests || 0);
        if (u.convIds && u.convIds.length) {
          for (const cid of u.convIds) mergedSet.add(cid);
        } else {
          assignTarget.conversationCount = (assignTarget.conversationCount || 0) + (u.conversationCount || 0);
        }
      }
      if (mergedSet.size > 0) {
        assignTarget.convIds = Array.from(mergedSet);
        assignTarget.conversationCount = mergedSet.size;
      }
      assignTarget._mergedUntracked = true;
      workList = workList.filter((a) => !a.isUntracked);
    } else if (accountPrefs.hideUntracked && untrackedItems.length > 0) {
      const uCost = untrackedItems.reduce((a, x) => a + (x.cost || 0), 0);
      const uTok = untrackedItems.reduce((a, x) => a + (x.totalTokens || 0), 0);
      hiddenNote = `已隐藏早期历史 $${uCost.toFixed(2)} (${fmtNum(uTok)} Token)`;
      workList = workList.filter((a) => !a.isUntracked);
    }

    if (workList.length === 0) {
      el.innerHTML = `<div class="nb-empty-hint">已隐藏早期历史记录，当前范围暂无其他账号数据</div>`;
      return;
    }

    const totCost = workList.reduce((a, x) => a + (x.cost || 0), 0);
    const totTok = workList.reduce((a, x) => a + (x.totalTokens || 0), 0);
    const realCount = workList.filter((a) => !a.isUntracked).length;
    const hasSeparateUntracked = workList.some((a) => a.isUntracked);

    // 去重会话总数：优先按 convIds 并集去重，全量历史未隐藏/已归属时以 overview.totalConversations 为上限基准
    const dedupConvSet = new Set();
    let hasConvIds = false;
    for (const item of workList) {
      for (const cid of item.convIds || []) {
        dedupConvSet.add(cid);
        hasConvIds = true;
      }
    }
    let totSess = 0;
    if (hasConvIds) {
      totSess = dedupConvSet.size;
    } else if (accountsScope === "all-time" && overview?.dailyAccountStats) {
      const ovConvSet = new Set();
      const visibleAccounts = new Set(workList.map((w) => w.account));
      for (const dayObj of Object.values(overview.dailyAccountStats)) {
        for (const [em, st] of Object.entries(dayObj || {})) {
          const targetEm = assignTarget && em.toLowerCase().includes("untracked") ? assignTarget.account : em;
          if (!visibleAccounts.has(targetEm)) continue;
          for (const cid of st.conversationIds || []) ovConvSet.add(cid);
        }
      }
      totSess = ovConvSet.size > 0 ? ovConvSet.size : Math.max(...workList.map((a) => a.conversationCount || 0), 0);
    } else {
      totSess = Math.max(...workList.map((a) => a.conversationCount || 0), 0);
    }
    if (accountsScope === "all-time" && !accountPrefs.hideUntracked && Number(overview?.totalConversations) > 0) {
      totSess = overview.totalConversations;
    }

    const primaryRealEmail =
      workList.find((x) => !x.isUntracked && x.isCurrent)?.account ||
      workList.find((x) => !x.isUntracked)?.account ||
      "";

    const rowsHtml = workList
      .map((a) => {
        const sharePct = totCost > 0 ? ((a.cost || 0) / totCost) * 100 : totTok > 0 ? ((a.totalTokens || 0) / totTok) * 100 : 0;
        const cap = a.quotaCapacity;
        const tierName = a.planName || a.userTier || cap?.planName || cap?.userTier || "";
        const isCalibrated = cap?.status === "calibrated";
        const s5 = Number(cap?.sampleCount5h ?? (cap?.history?.length || 0));
        const s7 = Number(cap?.sampleCountWeekly ?? (cap?.history?.length || 0));
        const est5h = isCalibrated && s5 >= 2 ? (cap?.fiveHourCost ?? (cap?.fiveHourTokens ? Math.round((cap.fiveHourTokens * 0.35) / 1e6 * 100) / 100 : null)) : null;
        const est7d = isCalibrated && s7 >= 2 ? (cap?.sevenDayCost ?? (cap?.sevenDayTokens ? Math.round((cap.sevenDayTokens * 0.35) / 1e6 * 100) / 100 : null)) : null;
        const quotaPills =
          !a.isUntracked && (est5h || est7d)
            ? `<div class="nb-acct-pills">
                ${est5h ? `<span class="nb-code-pill" title="基于近期配额消耗变化反推估算，仅供参考">5h 估算 ~$${Number(est5h).toFixed(2)}</span>` : ""}
                ${est7d ? `<span class="nb-code-pill" title="基于近期配额消耗变化反推估算，仅供参考">7d 估算 ~$${Number(est7d).toFixed(2)}</span>` : ""}
              </div>`
            : "";

        const untrackedAssignBtn =
          a.isUntracked && primaryRealEmail
            ? `<button type="button" class="nb-btn ghost nb-btn-sm" data-nb-assign-untracked="${esc(primaryRealEmail)}" title="将开启账号追踪前的早期历史合并计入主账号">一键归属至 ${esc(primaryRealEmail.split("@")[0])}</button>`
            : "";

        const dispAcctName = a.isUntracked ? "早期未跟踪历史数据" : a.account;
        return `
          <div class="nb-acct-row">
            <div class="nb-acct-top">
              <div class="nb-acct-id">
                <span class="nb-acct-name">${esc(dispAcctName)}</span>
                ${!a.isUntracked && tierName ? `<span class="nb-badge ok">${esc(tierName)}</span>` : ""}
                ${a.isCurrent ? `<span class="nb-badge">当前在线</span>` : ""}
                ${a._mergedUntracked ? `<span class="nb-badge">含早期历史</span>` : ""}
                ${a.isUntracked ? `<span class="nb-pct-pill">追踪开启前</span>` : ""}
              </div>
              <div class="nb-acct-spend">
                <span class="nb-muted">折算消耗:</span> <b>$${(a.cost || 0).toFixed(2)}</b>
                <span class="nb-pct-pill">${sharePct.toFixed(1)}%</span>
              </div>
            </div>
            <div class="nb-model-track"><div class="nb-model-fill" style="width:${sharePct.toFixed(2)}%;background:${a.isUntracked ? "#6b7280" : "#3B82F6"}"></div></div>
            <div class="nb-acct-foot">
              <span class="nb-muted">
                ${a.isUntracked ? `${fmtNum(a.totalTokens)} Token · ${fmtInt(a.requests)} 次调用 · Antigravity 本地库未记录历史邮箱，此为安装引力中枢前的历史用量` : `${fmtNum(a.totalTokens)} Token · ${fmtInt(a.requests)} 次调用`}
              </span>
              ${quotaPills}${untrackedAssignBtn}
            </div>
            ${!a.isUntracked ? buildHeatmapHtml(a, overview?.dailyAccountStats) : ""}
          </div>
        `;
      })
      .join("");

    const acctSummaryPrefix = realCount > 0
      ? `<b>${fmtInt(realCount)}</b> 个真实账号${hasSeparateUntracked ? " <span class=\"nb-muted\">(+ 早期历史)</span>" : ""}`
      : `<b>早期未跟踪历史</b>`;

    el.innerHTML = `
      <div class="nb-dist-summary">
        <span>${acctSummaryPrefix} · <b>${fmtInt(totSess)}</b> 个会话 · 折算 <b>$${totCost.toFixed(2)}</b> <span class="nb-muted">(${fmtNum(totTok)} Token)</span></span>
        <div class="nb-inline-controls" style="gap:6px;">
          ${hiddenNote ? `<span class="nb-muted" style="font-size:11px;">${esc(hiddenNote)}</span>` : ""}
          <span class="nb-scope-pill">${esc(scopeLbl)}</span>
        </div>
      </div>
      <div class="nb-acct-list">${rowsHtml}</div>
    `;
    el.querySelectorAll("[data-nb-assign-untracked]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-nb-assign-untracked") || "";
        if (!target) return;
        persistAccountPrefs({ assignUntrackedTo: target, hideUntracked: false });
        showToast(`已将早期未跟踪历史合并至 ${target}`);
      });
    });
    bindDataTooltips(el);
  }

  function renderAllAnalytics() {
    const spec = resolveRangeSpec(activeRange, customStart, customEnd);
    let agg = buildRangeAggregate(cachedOverview, cachedSession, spec);
    if (!agg && activeRange === "session" && cachedOverview) {
      // 当前无活跃会话时回退展示全局近 30 天
      activeRange = "last-30-days";
      document.querySelectorAll("#nb-range-seg button").forEach((b) => {
        b.classList.toggle("active", b.dataset.range === activeRange);
      });
      const fallbackSpec = resolveRangeSpec(activeRange, customStart, customEnd);
      agg = buildRangeAggregate(cachedOverview, cachedSession, fallbackSpec);
      if (agg) {
        renderHeroAndKpis(agg, fallbackSpec);
        renderActivityChart(agg.activityBars);
        renderModelsDistribution(agg.models, fallbackSpec);
        renderSpeedTrendsChart(agg.speedSeries, agg.models);
        renderLatencyScatterChart(agg.scatterPts, fallbackSpec);
        renderToolsDistribution(agg.tools);
        renderProjectsDistribution(agg, cachedOverview, fallbackSpec);
        renderAccountsDistribution(agg, cachedOverview, fallbackSpec);
      }
      return;
    }
    if (!agg) return;
    renderHeroAndKpis(agg, spec);
    renderActivityChart(agg.activityBars);
    renderModelsDistribution(agg.models, spec);
    renderSpeedTrendsChart(agg.speedSeries, agg.models);
    renderLatencyScatterChart(agg.scatterPts, spec);
    renderToolsDistribution(agg.tools);
    renderProjectsDistribution(agg, cachedOverview, spec);
    renderAccountsDistribution(agg, cachedOverview, spec);
  }

  async function refreshTelemetry(force = false) {
    try {
      const q = force ? "?force=1" : "";
      const [ovRes, sessRes] = await Promise.allSettled([
        apiFetch(`/api/analytics/overview${q}`, { method: "GET" }).then((r) => r.json()),
        apiFetch(`/api/analytics/session${q}`, { method: "GET" }).then((r) => r.json())
      ]);
      if (ovRes.status === "fulfilled" && ovRes.value?.ok && ovRes.value.data) {
        cachedOverview = ovRes.value.data;
      }
      if (sessRes.status === "fulfilled" && sessRes.value?.ok && sessRes.value.data) {
        cachedSession = sessRes.value.data;
      }
      renderAllAnalytics();
    } catch {}
  }

  // 时间范围按钮 & 自定义日期 & 作用域切换
  const rangeSeg = document.getElementById("nb-range-seg");
  const customRow = document.getElementById("nb-custom-range-row");
  rangeSeg?.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeRange = btn.dataset.range || "last-30-days";
      lsSet("nb.analytics.range", activeRange);
      rangeSeg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
      if (customRow) customRow.style.display = activeRange === "custom" ? "flex" : "none";
      if (activeRange === "session" && !cachedSession) {
        refreshTelemetry(false);
      } else {
        renderAllAnalytics();
      }
    });
  });

  document.getElementById("nb-btn-apply-custom")?.addEventListener("click", () => {
    customStart = customStartEl?.value || customStart;
    customEnd = customEndEl?.value || customEnd;
    lsSet("nb.analytics.customStart", customStart);
    lsSet("nb.analytics.customEnd", customEnd);
    renderAllAnalytics();
  });

  document.getElementById("nb-btn-refresh-analytics")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await refreshTelemetry(true);
      showToast("已刷新本地 SQLite 会话遥测数据");
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("nb-projects-scope-seg")?.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      projectsScope = btn.dataset.scope || "follow";
      lsSet("nb.analytics.projectScope", projectsScope);
      document.querySelectorAll("#nb-projects-scope-seg button").forEach((b) => b.classList.toggle("active", b === btn));
      renderAllAnalytics();
    });
  });

  document.getElementById("nb-accounts-scope-seg")?.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      accountsScope = btn.dataset.scope || "follow";
      lsSet("nb.analytics.accountScope", accountsScope);
      document.querySelectorAll("#nb-accounts-scope-seg button").forEach((b) => b.classList.toggle("active", b === btn));
      renderAllAnalytics();
    });
  });

  document.getElementById("nb-heatmap-range-seg")?.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const days = normalizeHeatmapDays(btn.dataset.days);
      persistAccountPrefs({ heatmapDays: days });
    });
  });

  document.getElementById("nb-acct-hide-untracked")?.addEventListener("change", (e) => {
    persistAccountPrefs({ hideUntracked: Boolean(e.currentTarget.checked) });
  });

  document.getElementById("nb-acct-assign-untracked")?.addEventListener("change", (e) => {
    persistAccountPrefs({ assignUntrackedTo: String(e.currentTarget.value || "") });
  });

  // 6. 视觉与流光舱配置读写
  let currentConfig = null;
  async function loadStudioConfig() {
    try {
      const [cfgRes, fontRes] = await Promise.all([
        apiFetch("/api/config", { method: "GET" }).then((r) => r.json()),
        apiFetch("/api/system-fonts", { method: "GET" }).then((r) => r.json()).catch(() => ({ fonts: [] }))
      ]);
      const fonts = Array.isArray(fontRes?.fonts) ? fontRes.fonts : [];
      const populateSelect = (id, defaultLabel, currentVal) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = `<option value="default">${defaultLabel}</option>` + fonts.map((f) => `<option value="${esc(f)}">${esc(f)}</option>`).join("");
        sel.value = fonts.includes(currentVal) ? currentVal : "default";
      };

      if (cfgRes && cfgRes.config) {
        currentConfig = cfgRes.config;
        const c = currentConfig;
        const enEl = document.getElementById("nb-cfg-enabled");
        if (enEl) enEl.checked = c.enabled !== false;

        const langSeg = document.getElementById("nb-cfg-lang-seg");
        langSeg?.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.val === (c.language || "zh-CN")));

        const darkPreset = c.presets?.dark || "default";
        const lightPreset = c.presets?.light || "default";
        document.querySelectorAll("#nb-preset-dark-grid .nb-preset-card").forEach((card) => {
          card.classList.toggle("active", card.dataset.preset === darkPreset);
        });
        document.querySelectorAll("#nb-preset-light-grid .nb-preset-card").forEach((card) => {
          card.classList.toggle("active", card.dataset.preset === lightPreset);
        });

        // 流光边框与全局外观 themeVars 回显
        const tv = c.themeVars || {};
        const savedAppearance = tv["--ag-suite-appearance"];
        if (savedAppearance === "auto" || savedAppearance === "dark" || savedAppearance === "light") {
          lsSet("nb.panel.theme", savedAppearance);
          applyPanelTheme(savedAppearance);
        }
        const glowOff = tv["--nb-glow-play-state"] === "paused";
        const glowEnEl = document.getElementById("nb-glow-enabled");
        if (glowEnEl) glowEnEl.checked = !glowOff;

        const speedNum = parseFloat(String(tv["--nb-glow-speed"] || "4.8s").replace(/s$/i, "")) || 4.8;
        const speedInput = document.getElementById("nb-glow-speed");
        const speedVal = document.getElementById("nb-glow-speed-val");
        if (speedInput) speedInput.value = String(speedNum);
        if (speedVal) speedVal.textContent = `${speedNum.toFixed(1)}s`;

        const glowWidth = String(tv["--nb-glow-width"] || "1.5px");
        document.querySelectorAll("#nb-glow-width-seg button").forEach((b) => {
          b.classList.toggle("active", b.dataset.width === glowWidth);
        });

        // 字体与自定义字体名
        populateSelect("nb-font-primary", "系统默认 (System Default)", c.typography?.primarySans || "default");
        populateSelect("nb-font-fallback", "系统默认中文 (PingFang SC)", c.typography?.fallbackSans || "default");
        populateSelect("nb-font-mono", "系统默认等宽 (SF Mono / Menlo)", c.typography?.mono || "default");
        const customPrimEl = document.getElementById("nb-font-primary-custom");
        const customFallEl = document.getElementById("nb-font-fallback-custom");
        const customMonoEl = document.getElementById("nb-font-mono-custom");
        if (customPrimEl) customPrimEl.value = c.typography?.customPrimarySans || "";
        if (customFallEl) customFallEl.value = c.typography?.customFallbackSans || "";
        if (customMonoEl) customMonoEl.value = c.typography?.customMono || "";

        const sz = String(c.typography?.fontSize || 15);
        document.querySelectorAll("#nb-font-size-seg button").forEach((b) => {
          b.classList.toggle("active", b.dataset.size === sz);
        });

        // 遥测与间隔
        const telEl = document.getElementById("nb-cfg-telemetry");
        if (telEl) telEl.checked = c.telemetry?.enabled !== false;
        const telIv = String(c.telemetry?.interval || 2000);
        document.querySelectorAll("#nb-telemetry-interval-seg button").forEach((b) => {
          b.classList.toggle("active", b.dataset.interval === telIv);
        });

        // 输入框排版与引擎模块开关
        const colEl = document.getElementById("nb-composer-collinear");
        const waxEl = document.getElementById("nb-composer-waxseal");
        const arrEl = document.getElementById("nb-composer-hidearrows");
        if (colEl) colEl.checked = Boolean(c.composer?.collinear);
        if (waxEl) waxEl.checked = Boolean(c.composer?.waxSeal);
        if (arrEl) arrEl.checked = Boolean(c.composer?.hideArrows);

        const dlEl = document.getElementById("nb-mod-deadlock");
        const cssEl = document.getElementById("nb-mod-customcss");
        const jsEl = document.getElementById("nb-mod-customjs");
        const actEl = document.getElementById("nb-mod-activity");
        if (dlEl) dlEl.checked = c.modules?.deadlockHealer !== false;
        if (cssEl) cssEl.checked = c.modules?.customCss !== false;
        if (jsEl) jsEl.checked = c.modules?.customJs !== false;
        if (actEl) actEl.checked = c.modules?.activitySummary !== false;
      }
    } catch {}
  }

  async function patchConfig(patch, toastMsg) {
    try {
      const r = await apiFetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      if (r.ok) {
        const j = await r.json();
        currentConfig = j.config || currentConfig;
        showToast(toastMsg || "✦ 引力视觉配置已实时热生效");
      }
    } catch {
      showToast("保存配置失败");
    }
  }

  document.getElementById("nb-cfg-enabled")?.addEventListener("change", (e) => {
    patchConfig({ enabled: e.currentTarget.checked }, e.currentTarget.checked ? "已启用引力视觉引擎" : "已恢复宿主原始界面");
  });

  document.querySelectorAll("#nb-cfg-lang-seg button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.val;
      document.querySelectorAll("#nb-cfg-lang-seg button").forEach((b) => b.classList.toggle("active", b === btn));
      patchConfig({ language: val }, val === "zh-CN" ? "已切换为简体中文与斜杠技能双语模式" : "已切换为英文原版");
    });
  });

  document.querySelectorAll("#nb-panel-theme-seg button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pref = btn.dataset.panelTheme || "auto";
      lsSet("nb.panel.theme", pref);
      applyPanelTheme(pref);
      const toastMsg =
        pref === "auto"
          ? "已同步切换 Antigravity 与引力中枢为跟随系统外观"
          : pref === "light"
          ? "已同步切换 Antigravity 与引力中枢为极光浅色"
          : "已同步切换 Antigravity 与引力中枢为深空暗夜";
      patchConfig(
        {
          themeVars: {
            ...(currentConfig?.themeVars || {}),
            "--ag-suite-appearance": pref,
            "--ag-suite-appearance-seq": String(Date.now())
          }
        },
        toastMsg
      );
    });
  });

  document.querySelectorAll("#nb-preset-dark-grid .nb-preset-card").forEach((card) => {
    card.addEventListener("click", () => {
      const preset = card.dataset.preset || "default";
      document.querySelectorAll("#nb-preset-dark-grid .nb-preset-card").forEach((c) => c.classList.toggle("active", c === card));
      patchConfig(
        { presets: { ...(currentConfig?.presets || {}), dark: preset } },
        `暗夜模式预设已切换：${card.querySelector(".nb-preset-name")?.textContent || preset}`
      );
    });
  });

  document.querySelectorAll("#nb-preset-light-grid .nb-preset-card").forEach((card) => {
    card.addEventListener("click", () => {
      const preset = card.dataset.preset || "default";
      document.querySelectorAll("#nb-preset-light-grid .nb-preset-card").forEach((c) => c.classList.toggle("active", c === card));
      patchConfig(
        { presets: { ...(currentConfig?.presets || {}), light: preset } },
        `日间模式预设已切换：${card.querySelector(".nb-preset-name")?.textContent || preset}`
      );
    });
  });

  // Google Gemini 流光边框实时控制
  document.getElementById("nb-glow-enabled")?.addEventListener("change", (e) => {
    const on = e.currentTarget.checked;
    patchConfig(
      {
        themeVars: on
          ? { "--nb-glow-play-state": "", "--nb-glow-ring-dark": "", "--nb-glow-ring-light": "" }
          : {
              "--nb-glow-play-state": "paused",
              "--nb-glow-ring-dark": "linear-gradient(rgba(255,255,255,0.14), rgba(255,255,255,0.14))",
              "--nb-glow-ring-light": "linear-gradient(rgba(0,0,0,0.14), rgba(0,0,0,0.14))"
            }
      },
      on ? "已启用 Google Gemini 四色动态流光边框" : "已切换为静态素净边框"
    );
  });

  let glowSpeedTimer = null;
  document.getElementById("nb-glow-speed")?.addEventListener("input", (e) => {
    const v = parseFloat(e.currentTarget.value) || 4.8;
    const speedVal = document.getElementById("nb-glow-speed-val");
    if (speedVal) speedVal.textContent = `${v.toFixed(1)}s`;
    clearTimeout(glowSpeedTimer);
    glowSpeedTimer = setTimeout(() => {
      patchConfig({ themeVars: { "--nb-glow-speed": `${v.toFixed(1)}s` } }, `流光周期已调整为 ${v.toFixed(1)}s`);
    }, 180);
  });

  document.querySelectorAll("#nb-glow-width-seg button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const w = btn.dataset.width || "1.5px";
      document.querySelectorAll("#nb-glow-width-seg button").forEach((b) => b.classList.toggle("active", b === btn));
      patchConfig({ themeVars: { "--nb-glow-width": w } }, `流光边框粗细已设为 ${w}`);
    });
  });

  function collectTypographyPatch(overrides = {}) {
    return {
      typography: {
        primarySans: document.getElementById("nb-font-primary")?.value || "default",
        customPrimarySans: (document.getElementById("nb-font-primary-custom")?.value || "").trim(),
        fallbackSans: document.getElementById("nb-font-fallback")?.value || "default",
        customFallbackSans: (document.getElementById("nb-font-fallback-custom")?.value || "").trim(),
        mono: document.getElementById("nb-font-mono")?.value || "default",
        customMono: (document.getElementById("nb-font-mono-custom")?.value || "").trim(),
        fontSize: currentConfig?.typography?.fontSize || 15,
        ...overrides
      }
    };
  }

  ["nb-font-primary", "nb-font-fallback", "nb-font-mono", "nb-font-primary-custom", "nb-font-fallback-custom", "nb-font-mono-custom"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", () => {
      patchConfig(collectTypographyPatch(), "已实时更新字体排版");
    });
  });

  document.querySelectorAll("#nb-font-size-seg button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sz = parseInt(btn.dataset.size || "15", 10);
      document.querySelectorAll("#nb-font-size-seg button").forEach((b) => b.classList.toggle("active", b === btn));
      patchConfig(collectTypographyPatch({ fontSize: sz }), `对话字号已调整为 ${sz}px`);
    });
  });

  document.getElementById("nb-cfg-telemetry")?.addEventListener("change", (e) => {
    patchConfig(
      { telemetry: { ...(currentConfig?.telemetry || {}), enabled: e.currentTarget.checked } },
      e.currentTarget.checked ? "已开启底部一体式流光遥测舱" : "已隐藏底部遥测舱"
    );
  });

  document.querySelectorAll("#nb-telemetry-interval-seg button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const iv = parseInt(btn.dataset.interval || "2000", 10) || 2000;
      document.querySelectorAll("#nb-telemetry-interval-seg button").forEach((b) => b.classList.toggle("active", b === btn));
      patchConfig({ telemetry: { ...(currentConfig?.telemetry || {}), interval: iv } }, `遥测同步间隔已设为 ${(iv / 1000).toFixed(0)}s`);
    });
  });

  const composerMap = [
    ["nb-composer-collinear", "collinear", "底栏单行紧凑同排"],
    ["nb-composer-waxseal", "waxSeal", "输入框微浮雕质感"],
    ["nb-composer-hidearrows", "hideArrows", "隐藏跳转箭头"]
  ];
  composerMap.forEach(([id, key, label]) => {
    document.getElementById(id)?.addEventListener("change", (e) => {
      patchConfig(
        { composer: { ...(currentConfig?.composer || {}), [key]: e.currentTarget.checked } },
        `${e.currentTarget.checked ? "已开启" : "已关闭"}${label}`
      );
    });
  });

  const moduleMap = [
    ["nb-mod-deadlock", "deadlockHealer", "界面死锁自愈"],
    ["nb-mod-customcss", "customCss", "流光主题样式注入"],
    ["nb-mod-customjs", "customJs", "顶栏与斜杠增强脚本"],
    ["nb-mod-activity", "activitySummary", "会话活动摘要"]
  ];
  moduleMap.forEach(([id, key, label]) => {
    document.getElementById(id)?.addEventListener("change", (e) => {
      patchConfig(
        { modules: { ...(currentConfig?.modules || {}), [key]: e.currentTarget.checked } },
        `${e.currentTarget.checked ? "已启用" : "已停用"}${label}`
      );
    });
  });

  // 7. 工程护栏、路由记忆、CLI 状态与在线更新
  async function syncSystemCenter() {
    try {
      const [grRes, lrRes, acRes, cliRes, updRes] = await Promise.all([
        apiFetch("/api/suite-guardrails", { method: "GET" }).then((r) => r.json()).catch(() => null),
        apiFetch("/api/suite-last-route", { method: "GET" }).then((r) => r.json()).catch(() => null),
        apiFetch("/api/suite-auto-compact", { method: "GET" }).then((r) => r.json()).catch(() => null),
        apiFetch("/api/launch-cli", { method: "GET" }).then((r) => r.json()).catch(() => null),
        apiFetch("/api/suite-update", { method: "GET" }).then((r) => r.json()).catch(() => null)
      ]);

      if (grRes && grRes.ok) {
        const badge = document.getElementById("nb-guardrail-badge");
        const desc = document.getElementById("nb-guardrail-desc");
        document.querySelectorAll("#nb-guardrail-seg button").forEach((b) => {
          b.classList.toggle("active", b.dataset.tier === grRes.tier);
        });
        if (badge) {
          badge.textContent = grRes.tier === "strict" ? "严格 5 项护栏" : grRes.tier === "standard" ? "标准 3 项护栏" : "已关闭";
        }
        if (desc) {
          desc.textContent = grRes.enabled
            ? `已写入生效（${grRes.tier === "strict" ? "严格 5 项完整工程护栏" : "标准 3 项核心护栏"} · ${grRes.bytes} 字节）`
            : "当前已关闭工程纪律护栏";
        }
      }

      if (lrRes && lrRes.ok) {
        const lrCheck = document.getElementById("nb-lr-enabled");
        const lrDesc = document.getElementById("nb-last-route-desc");
        if (lrCheck) lrCheck.checked = lrRes.enabled !== false;
        if (lrDesc && lrRes.route) {
          lrDesc.textContent = `当前已记忆：${lrRes.title ? lrRes.title + " · " : ""}${lrRes.route.slice(0, 68)}`;
        }
      }

      if (acRes && acRes.ok) {
        const acCheck = document.getElementById("nb-ac-enabled");
        const acThreshold = document.getElementById("nb-ac-threshold");
        const acDesc = document.getElementById("nb-ac-desc");
        if (acCheck) acCheck.checked = acRes.enabled !== false;
        if (acThreshold) acThreshold.value = String(acRes.thresholdK || 500);
        if (acDesc) {
          if (acRes.lastCompactAt > 0) {
            const dt = new Date(acRes.lastCompactAt);
            const tStr = `${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
            const kStr = acRes.lastCtxTok > 0 ? `（当时上下文 ${Math.round(acRes.lastCtxTok / 1000)}k Token）` : "";
            acDesc.textContent = `监听当前对话上下文，空闲且 ≥ ${acRes.thresholdK || 500}k 时自动发送 /compact · 上次触发：${tStr}${kStr}`;
          } else {
            acDesc.textContent = `监听当前对话实时上下文水位，空闲且 ≥ ${acRes.thresholdK || 500}k Token 时自动发送 /compact 释放上下文空间`;
          }
        }
      }

      if (cliRes && cliRes.ok) {
        const cliDesc = document.getElementById("nb-cli-desc");
        const proxyStr = cliRes.proxy && (cliRes.proxy.HTTPS_PROXY || cliRes.proxy.HTTP_PROXY || cliRes.proxy.ALL_PROXY);
        if (cliDesc) {
          cliDesc.textContent = cliRes.installed
            ? `已就绪：${cliRes.cliPath}${proxyStr ? " · 自动注入代理：" + proxyStr : " · 直连模式"}`
            : "未检测到 agy CLI";
        }
      }

      if (updRes && updRes.ok) {
        applyUpdateState(updRes);
      }
    } catch {}
  }

  document.querySelectorAll("#nb-guardrail-seg button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tier = btn.dataset.tier;
      const r = await apiFetch("/api/suite-guardrails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier })
      });
      const j = await r.json();
      if (j.ok) {
        showToast(tier === "off" ? "已关闭防幻觉工程护栏" : `已切换为「${tier === "strict" ? "严格 5 项护栏" : "标准 3 项护栏"}」`);
        syncSystemCenter();
      }
    });
  });

  document.getElementById("nb-lr-enabled")?.addEventListener("change", async (e) => {
    const enabled = e.currentTarget.checked;
    await apiFetch("/api/suite-last-route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled })
    });
    showToast(enabled ? "已开启退出重开自动恢复会话页面" : "已关闭退出自动恢复页面");
    syncSystemCenter();
  });

  document.getElementById("nb-ac-enabled")?.addEventListener("change", async (e) => {
    const enabled = e.currentTarget.checked;
    try {
      const r = await apiFetch("/api/suite-auto-compact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled })
      });
      if (r.ok) {
        showToast(enabled ? "已开启对话上下文超阈值自动 /compact" : "已暂停自动 /compact 压缩");
        syncSystemCenter();
      } else {
        showToast("当前运行中服务端需重启 Antigravity 后启用此新接口");
      }
    } catch {
      showToast("保存自动压缩开关失败");
    }
  });

  document.getElementById("nb-ac-threshold")?.addEventListener("change", async (e) => {
    const rawVal = parseInt(String(e.currentTarget.value || "500"), 10);
    const thresholdK = Math.max(100, Math.min(1000, Number.isFinite(rawVal) ? rawVal : 500));
    e.currentTarget.value = String(thresholdK);
    try {
      const r = await apiFetch("/api/suite-auto-compact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thresholdK })
      });
      if (r.ok) {
        showToast(`自动 /compact 上下文阈值已设为 ${thresholdK}k Token`);
        syncSystemCenter();
      } else {
        showToast("当前运行中服务端需重启 Antigravity 后启用此新接口");
      }
    } catch {
      showToast("保存自动压缩阈值失败");
    }
  });

  function applyUpdateState(info) {
    if (!info || !info.ok) return;
    const verPill = document.getElementById("nb-ver-pill");
    const sysDesc = document.getElementById("nb-sys-update-desc");
    const sysUpdBtn = document.getElementById("nb-btn-sys-update");
    const banner = document.getElementById("nb-banner-update");

    if (verPill) verPill.textContent = `v${info.currentVersion}`;
    if (sysDesc) {
      sysDesc.textContent = info.hasUpdate
        ? `发现新版本 v${info.latestVersion}（当前 v${info.currentVersion}），可一键同步更新`
        : `当前已是最新版本 v${info.currentVersion} · Songh0918/antigravity-ui-suggestion`;
    }
    if (sysUpdBtn) {
      sysUpdBtn.style.display = info.hasUpdate ? "inline-flex" : "none";
    }
    if (banner) {
      if (info.shouldNotify) {
        banner.style.display = "block";
        banner.dataset.ver = info.latestVersion;
        const tag = document.getElementById("nb-upd-ver-tag");
        if (tag) tag.textContent = `v${info.currentVersion} → v${info.latestVersion}`;
        const ul = document.getElementById("nb-upd-highlights");
        if (ul) ul.innerHTML = (info.highlights || []).slice(0, 4).map((h) => `<li>${esc(h)}</li>`).join("");
      } else {
        banner.style.display = "none";
      }
    }
  }

  async function checkUpdateNow(btn) {
    if (btn) btn.disabled = true;
    try {
      const r = await apiFetch("/api/suite-update/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check" })
      });
      const j = await r.json();
      applyUpdateState(j);
      showToast(j.hasUpdate ? `发现新版本 v${j.latestVersion}！` : `当前已是最新版本 v${j.currentVersion}`);
    } catch {
      showToast("检查更新失败");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function performOneClickUpdate(btn) {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "正在同步更新...";
    }
    try {
      const r = await apiFetch("/api/suite-update/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update" })
      });
      const j = await r.json();
      if (j.ok) {
        showToast(`已同步至 v${j.updatedTo}，样式已实时热生效`);
        const fresh = await (await apiFetch("/api/suite-update", { method: "GET" })).json();
        applyUpdateState(fresh);
      } else {
        showToast(`更新失败：${j.error || ""}`);
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "立即一键更新";
      }
    }
  }

  document.getElementById("nb-btn-top-check")?.addEventListener("click", (e) => checkUpdateNow(e.currentTarget));
  document.getElementById("nb-btn-sys-check")?.addEventListener("click", (e) => checkUpdateNow(e.currentTarget));
  document.getElementById("nb-btn-sys-update")?.addEventListener("click", (e) => performOneClickUpdate(e.currentTarget));
  document.getElementById("nb-btn-banner-update")?.addEventListener("click", (e) => performOneClickUpdate(e.currentTarget));
  document.getElementById("nb-btn-banner-dismiss")?.addEventListener("click", async () => {
    const banner = document.getElementById("nb-banner-update");
    const ver = banner?.dataset.ver || "";
    if (banner) banner.style.display = "none";
    await apiFetch("/api/suite-update/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss", version: ver })
    });
    showToast(`已忽略 v${ver} 更新提醒`);
  });

  // 初始化加载与定时刷新
  (async () => {
    try {
      const r = await apiFetch("/api/suite-account-prefs", { method: "GET" });
      if (r.ok) {
        const j = await r.json();
        if (j && j.ok) {
          accountPrefs = {
            hideUntracked: Boolean(j.hideUntracked),
            assignUntrackedTo: typeof j.assignUntrackedTo === "string" ? j.assignUntrackedTo : "",
            heatmapDays: normalizeHeatmapDays(j.heatmapDays)
          };
        }
      }
    } catch {}
    refreshTelemetry(false);
  })();
  refreshStatus();
  refreshQuota();
  syncAutoSwitch();
  loadStudioConfig();
  syncSystemCenter();

  setInterval(refreshStatus, 8000);
  setInterval(() => {
    refreshQuota();
    syncAutoSwitch();
  }, 15000);
  setInterval(refreshTelemetry, 12000);
})();
