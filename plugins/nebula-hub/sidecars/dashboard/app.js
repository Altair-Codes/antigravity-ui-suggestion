/**
 * 星云中枢 (Nebula Hub v2.0) — 原生中文三舱 Bento 网格控制台前端引擎
 * 100% 自研编写，彻底告别旧版英文模板 + 外挂补丁架构
 */
(function initNebulaHubPanel() {
  const apiFetch = (path, opts) =>
    window.sidecar && typeof window.sidecar.fetch === "function"
      ? window.sidecar.fetch(path, opts)
      : fetch(path, opts);

  function showToast(msg) {
    const el = document.getElementById("nb-toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(window.__nb_toast_timer);
    window.__nb_toast_timer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function fmtNum(n) {
    const v = Number(n) || 0;
    if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(1) + "k";
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

  // 1. 三舱 Tab 切换
  const tabs = document.querySelectorAll(".nb-tab");
  const views = {
    cockpit: document.getElementById("nb-view-cockpit"),
    studio: document.getElementById("nb-view-studio"),
    system: document.getElementById("nb-view-system")
  };
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      tabs.forEach((b) => b.classList.toggle("active", b === btn));
      Object.entries(views).forEach(([k, el]) => {
        if (el) el.classList.toggle("active", k === target);
      });
    });
  });

  // 2. 顶部快捷动作：热重载、检查更新、启动 CLI、主题模式重启
  document.getElementById("nb-btn-top-reload")?.addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try {
      const r = await apiFetch("/api/reload", { method: "POST" });
      showToast(r.ok ? "✦ 星云视觉样式与脚本已实时热重载" : "热重载失败");
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
    b.textContent = "正在切入星云模式...";
    try {
      const r = await apiFetch("/api/suite-relaunch-cdp", { method: "POST" });
      const j = await r.json();
      showToast(j.ok ? "正在通过 Antigravity Nebula 启动器无感重启..." : `重启失败：${j.error || ""}`);
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

  async function refreshQuota() {
    try {
      const r = await apiFetch("/api/suite-quota", { method: "GET" });
      if (!r.ok) return;
      const j = await r.json();
      const data = j.data;
      const grid = document.getElementById("nb-quota-grid");
      const badge = document.getElementById("nb-quota-plan-badge");
      if (!grid) return;
      if (!data || !Array.isArray(data.groups) || data.groups.length === 0) {
        grid.innerHTML = `<div class="nb-empty-hint">正在等待宿主窗口同步当前账号每周 / 5 小时模型额度池...</div>`;
        return;
      }
      if (badge) {
        badge.textContent = `${data.planName || "Google AI"}${data.email ? " · " + data.email : ""}`;
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
                <span class="nb-quota-name">${g.label}</span>
                <span class="nb-muted">每周余量 <b class="nb-quota-pct" style="color:${wCol}">${wPct !== null ? wPct + "%" : "--"}</b></span>
              </div>
              <div class="nb-track">
                <div class="nb-fill" style="width:${wPct !== null ? wPct : 0}%;background:${wCol}"></div>
              </div>
              <div class="nb-muted">${wReset || "每周共享额度池"}</div>
              ${
                hPct !== null
                  ? `<div class="nb-quota-5h">
                      <div class="nb-quota-top" style="margin-bottom:3px;">
                        <span class="nb-muted">5 小时动态限额</span>
                        <span class="nb-muted"><b class="nb-quota-pct" style="color:${hCol};font-size:11.5px;">${hPct}%</b>${hReset ? " · " + hReset : ""}</span>
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
      const thEl = document.getElementById("nb-as-threshold");
      const countBadge = document.getElementById("nb-vault-count-badge");
      const activeBadge = document.getElementById("nb-autoswitch-active-badge");
      const summaryEl = document.getElementById("nb-as-summary");
      const listEl = document.getElementById("nb-as-order-list");

      if (enEl) enEl.checked = Boolean(cfg.enabled);
      if (poolEl) poolEl.value = cfg.poolKey || "gemini-weekly";
      if (thEl) thEl.value = String(cfg.thresholdPct ?? 10);
      if (countBadge) countBadge.textContent = `${j.vaultCount || 0} 个备选账号`;
      if (activeBadge) {
        activeBadge.style.display = cfg.enabled ? "inline-flex" : "none";
        activeBadge.textContent = j.nextTargetEmail
          ? `周余 ≤ ${cfg.thresholdPct}% → ${j.nextTargetEmail.split("@")[0]}`
          : `周余 ≤ ${cfg.thresholdPct}% 自动切号`;
      }
      if (summaryEl) {
        const lastLog = cfg.lastSwitchAt
          ? ` · 上次自动切号：${cfg.lastSwitchFrom || ""} → ${cfg.lastSwitchTo || ""}（${cfg.lastTriggerReason || ""}）`
          : "";
        summaryEl.textContent =
          j.vaultCount >= 2
            ? `轮换队列已就绪（共 ${j.vaultCount} 个账号${j.nextTargetEmail ? "，下一顺位：" + j.nextTargetEmail : ""}），可用 ↑/↓ 调整顺位${lastLog}`
            : `当前金库已存 ${j.vaultCount} 个账号。先点「+ 保存当前账号入库」，切换登录其他账号后再保存一次即可启用自动轮换${lastLog}`;
      }
      if (listEl) {
        const accounts = j.accounts || [];
        latestOrderedEmails = accounts.map((a) => a.email);
        listEl.innerHTML = accounts
          .map((a, idx) => {
            const snap = a.lastWeekly || {};
            const poolKey = cfg.poolKey || "gemini-weekly";
            const wPct =
              poolKey !== "any-weekly" && typeof snap[poolKey] === "number"
                ? snap[poolKey]
                : typeof snap["gemini-weekly"] === "number"
                  ? snap["gemini-weekly"]
                  : null;
            return `
              <div class="nb-order-item${a.isNext ? " is-next" : ""}">
                <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;">
                  <span class="nb-order-idx">#${a.orderIndex || idx + 1}</span>
                  <span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.email}</span>
                  ${a.isCurrent ? `<span class="nb-badge ok">当前在线</span>` : ""}
                  ${a.isNext ? `<span class="nb-badge">下一顺位</span>` : ""}
                  ${wPct !== null ? `<span class="nb-muted" style="font-family:var(--nb-font-mono);">周余 ${wPct}%</span>` : ""}
                </div>
                <div style="display:flex;gap:4px;flex-shrink:0;">
                  <button type="button" class="nb-mini-btn" data-move="up" data-idx="${idx}" ${idx === 0 ? "disabled" : ""}>↑</button>
                  <button type="button" class="nb-mini-btn" data-move="down" data-idx="${idx}" ${idx === accounts.length - 1 ? "disabled" : ""}>↓</button>
                  ${!a.isCurrent ? `<button type="button" class="nb-mini-btn" data-switch="${a.email}">切换</button>` : ""}
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
                body: JSON.stringify({ email, reloadWindow: true })
              });
              const resJson = await r.json();
              showToast(resJson.ok ? `已切换至 ${email}，正在刷新宿主窗口...` : `切换失败：${resJson.error || ""}`);
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
    const thresholdPct = Math.max(1, Math.min(95, parseInt(document.getElementById("nb-as-threshold")?.value || "10", 10) || 10));
    const r = await apiFetch("/api/suite-auto-switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, poolKey, thresholdPct })
    });
    const j = await r.json();
    if (j.ok) {
      showToast(enabled ? `已启用周额度自动切号（剩余 ≤ ${thresholdPct}% 时触发）` : "已关闭低额度自动切号");
      syncAutoSwitch();
    }
  }
  document.getElementById("nb-as-enabled")?.addEventListener("change", saveAutoSwitchPolicy);
  document.getElementById("nb-btn-as-save")?.addEventListener("click", saveAutoSwitchPolicy);
  document.getElementById("nb-btn-save-current-acct")?.addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try {
      const r = await apiFetch("/api/accounts/save-current", { method: "POST" });
      const j = await r.json();
      showToast(j.ok ? "已将当前登录账号凭据保存至星云金库" : `保存失败：${j.error || ""}`);
      syncAutoSwitch();
    } finally {
      b.disabled = false;
    }
  });

  // 5. SQLite 算力遥测看板（当前会话 vs 全局近 30 天）
  let currentTelemetryMode = "session";
  const rangeSeg = document.getElementById("nb-range-seg");
  rangeSeg?.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentTelemetryMode = btn.dataset.range || "session";
      rangeSeg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
      refreshTelemetry();
    });
  });

  async function refreshTelemetry() {
    try {
      const endpoint = currentTelemetryMode === "session" ? "/api/analytics/session" : "/api/analytics/overview";
      const r = await apiFetch(endpoint, { method: "GET" });
      const j = await r.json();
      if (!j.ok || !j.data) {
        if (currentTelemetryMode === "session") {
          currentTelemetryMode = "global";
          const ovRes = await (await apiFetch("/api/analytics/overview", { method: "GET" })).json();
          if (ovRes.ok && ovRes.data) renderTelemetryData(ovRes.data, "global");
        }
        return;
      }
      renderTelemetryData(j.data, currentTelemetryMode);
    } catch {}
  }

  function renderTelemetryData(d, mode) {
    const tpsEl = document.getElementById("nb-kpi-tps");
    const tpsSub = document.getElementById("nb-kpi-tps-sub");
    const ttftEl = document.getElementById("nb-kpi-ttft");
    const ttftSub = document.getElementById("nb-kpi-ttft-sub");
    const cacheEl = document.getElementById("nb-kpi-cache");
    const cacheSub = document.getElementById("nb-kpi-cache-sub");
    const tokEl = document.getElementById("nb-kpi-tokens");
    const tokSub = document.getElementById("nb-kpi-tokens-sub");

    const avgTps = Number(d.avgTokPerSec) || 0;
    const p50Tps = Number(d.p50TokPerSec || d.e2eTokPerSec) || 0;
    const avgTtft = Number(d.avgTtft) || 0;
    const cacheEff = Number(d.cacheEfficiency) || 0;
    const totTok = d.totalTokens?.total || 0;

    if (tpsEl) tpsEl.textContent = avgTps > 0 ? `${avgTps.toFixed(1)} tok/s` : "--";
    if (tpsSub) tpsSub.textContent = `P50 / 端到端: ${p50Tps.toFixed(1)} tok/s`;
    if (ttftEl) ttftEl.textContent = avgTtft > 0 ? `${avgTtft.toFixed(2)}s` : "--";
    if (ttftSub) ttftSub.textContent = `平均每轮耗时: ${(Number(d.avgTurnLatency) || 0).toFixed(1)}s`;
    if (cacheEl) cacheEl.textContent = `${cacheEff.toFixed(1)}%`;
    if (cacheSub) cacheSub.textContent = `缓存 ${fmtNum(d.totalTokens?.cacheRead)} / 新增 ${fmtNum(d.totalTokens?.input)}`;
    if (tokEl) tokEl.textContent = fmtNum(totTok);
    if (tokSub) {
      tokSub.textContent =
        mode === "session"
          ? `当前会话 ${d.sessionTurns || 0} 轮提问 · ${d.totalRequests || 0} 次调用`
          : `全局累计 ${d.totalSessions || 0} 个会话 · ${d.totalRequests || 0} 次调用`;
    }

    // 渲染柱状图（会话级展示最近 18 步速率，全局展示近 14 天每日 Token）
    const chartEl = document.getElementById("nb-daily-chart");
    const chartTitle = document.getElementById("nb-chart-title");
    if (chartEl) {
      if (mode === "session" && Array.isArray(d.steps) && d.steps.length > 0) {
        if (chartTitle) chartTitle.textContent = "当前会话近期调用流式速率 (tok/s)";
        const recent = d.steps.slice(-18);
        const maxSpd = Math.max(10, ...recent.map((s) => Number(s.tokPerSec) || 0));
        chartEl.innerHTML = recent
          .map((s, idx) => {
            const spd = Number(s.tokPerSec) || 0;
            const hPct = Math.max(4, Math.round((spd / maxSpd) * 100));
            return `
              <div class="nb-bar-col" title="Step #${s.idx || idx + 1} · ${s.model || ""} · ${spd.toFixed(1)} tok/s · TTFT ${(Number(s.ttft) || 0).toFixed(2)}s">
                <div class="nb-bar-fill" style="height:${hPct}%"></div>
                <span class="nb-bar-lbl">#${idx + 1}</span>
              </div>
            `;
          })
          .join("");
      } else if (Array.isArray(d.dailyActivity) && d.dailyActivity.length > 0) {
        if (chartTitle) chartTitle.textContent = "近期每日 Token 吞吐量趋势";
        const recent = d.dailyActivity.slice(-14);
        const maxT = Math.max(100, ...recent.map((x) => (x.input || 0) + (x.output || 0) + (x.cacheRead || 0)));
        chartEl.innerHTML = recent
          .map((x) => {
            const sum = (x.input || 0) + (x.output || 0) + (x.cacheRead || 0);
            const hPct = Math.max(4, Math.round((sum / maxT) * 100));
            const dayShort = String(x.date || "").slice(5);
            return `
              <div class="nb-bar-col" title="${x.date}: 总计 ${fmtNum(sum)} Tokens (${x.requests || 0} 次调用)">
                <div class="nb-bar-fill" style="height:${hPct}%"></div>
                <span class="nb-bar-lbl">${dayShort}</span>
              </div>
            `;
          })
          .join("");
      } else {
        chartEl.innerHTML = `<div class="nb-empty-hint">暂无趋势数据</div>`;
      }
    }

    // 模型分布
    const modelsEl = document.getElementById("nb-models-list");
    if (modelsEl) {
      const models = Array.isArray(d.models) ? d.models.slice(0, 6) : [];
      modelsEl.innerHTML =
        models.length > 0
          ? models
              .map(
                (m) => `
              <div class="nb-stat-row">
                <span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.model}</span>
                <span class="nb-muted" style="font-family:var(--nb-font-mono);flex-shrink:0;">${m.requests} 次 · ${(Number(m.avgTokPerSec) || 0).toFixed(0)} tok/s · ${fmtNum(m.totalTokens)}</span>
              </div>
            `
              )
              .join("")
          : `<div class="nb-empty-hint">暂无模型调用记录</div>`;
    }

    // 工具分布
    const toolsEl = document.getElementById("nb-tools-list");
    if (toolsEl) {
      const tools = Array.isArray(d.tools) ? d.tools.slice(0, 12) : [];
      toolsEl.innerHTML =
        tools.length > 0
          ? tools.map((t) => `<span class="nb-tool-chip">${t.name} <b>${t.count}</b></span>`).join("")
          : `<div class="nb-empty-hint">暂无工具调用记录</div>`;
    }
  }

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
        sel.innerHTML = `<option value="default">${defaultLabel}</option>` + fonts.map((f) => `<option value="${f}">${f}</option>`).join("");
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
        document.querySelectorAll("#nb-preset-grid .nb-preset-card").forEach((card) => {
          card.classList.toggle("active", card.dataset.dark === darkPreset);
        });

        populateSelect("nb-font-primary", "系统默认 (System Default)", c.typography?.primarySans || "default");
        populateSelect("nb-font-fallback", "系统默认中文 (PingFang SC)", c.typography?.fallbackSans || "default");
        populateSelect("nb-font-mono", "系统默认等宽 (SF Mono / Menlo)", c.typography?.mono || "default");

        const sz = String(c.typography?.fontSize || 15);
        document.querySelectorAll("#nb-font-size-seg button").forEach((b) => {
          b.classList.toggle("active", b.dataset.size === sz);
        });

        const telEl = document.getElementById("nb-cfg-telemetry");
        if (telEl) telEl.checked = c.telemetry?.enabled !== false;
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
        showToast(toastMsg || "✦ 星云视觉配置已实时热生效");
      }
    } catch {
      showToast("保存配置失败");
    }
  }

  document.getElementById("nb-cfg-enabled")?.addEventListener("change", (e) => {
    patchConfig({ enabled: e.currentTarget.checked }, e.currentTarget.checked ? "已启用星云视觉引擎" : "已恢复宿主原始界面");
  });

  document.querySelectorAll("#nb-cfg-lang-seg button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.val;
      document.querySelectorAll("#nb-cfg-lang-seg button").forEach((b) => b.classList.toggle("active", b === btn));
      patchConfig({ language: val }, val === "zh-CN" ? "已切换为简体中文与斜杠技能双语模式" : "已切换为英文原版");
    });
  });

  document.querySelectorAll("#nb-preset-grid .nb-preset-card").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll("#nb-preset-grid .nb-preset-card").forEach((c) => c.classList.toggle("active", c === card));
      patchConfig(
        { presets: { dark: card.dataset.dark, light: card.dataset.light } },
        `已切换星云色彩预设：${card.querySelector(".nb-preset-name")?.textContent || ""}`
      );
    });
  });

  ["nb-font-primary", "nb-font-fallback", "nb-font-mono"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", () => {
      patchConfig(
        {
          typography: {
            primarySans: document.getElementById("nb-font-primary")?.value || "default",
            fallbackSans: document.getElementById("nb-font-fallback")?.value || "default",
            mono: document.getElementById("nb-font-mono")?.value || "default",
            fontSize: currentConfig?.typography?.fontSize || 15
          }
        },
        "已实时更新字体排版"
      );
    });
  });

  document.querySelectorAll("#nb-font-size-seg button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sz = parseInt(btn.dataset.size || "15", 10);
      document.querySelectorAll("#nb-font-size-seg button").forEach((b) => b.classList.toggle("active", b === btn));
      patchConfig(
        {
          typography: {
            ...(currentConfig?.typography || {}),
            fontSize: sz
          }
        },
        `对话字号已调整为 ${sz}px`
      );
    });
  });

  document.getElementById("nb-cfg-telemetry")?.addEventListener("change", (e) => {
    patchConfig(
      { telemetry: { ...(currentConfig?.telemetry || {}), enabled: e.currentTarget.checked } },
      e.currentTarget.checked ? "已开启底部一体式流光遥测舱" : "已隐藏底部遥测舱"
    );
  });

  // 7. 工程护栏、路由记忆、CLI 状态与在线更新
  async function syncSystemCenter() {
    try {
      const [grRes, lrRes, cliRes, updRes] = await Promise.all([
        apiFetch("/api/suite-guardrails", { method: "GET" }).then((r) => r.json()),
        apiFetch("/api/suite-last-route", { method: "GET" }).then((r) => r.json()),
        apiFetch("/api/launch-cli", { method: "GET" }).then((r) => r.json()),
        apiFetch("/api/suite-update", { method: "GET" }).then((r) => r.json())
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
        if (ul) ul.innerHTML = (info.highlights || []).slice(0, 4).map((h) => `<li>${h}</li>`).join("");
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
  refreshStatus();
  refreshQuota();
  syncAutoSwitch();
  refreshTelemetry();
  loadStudioConfig();
  syncSystemCenter();

  setInterval(refreshStatus, 8000);
  setInterval(refreshQuota, 15000);
  setInterval(refreshTelemetry, 12000);
})();
