/**
 * user/custom.js — 用户专属前端扩展钩子（Google Gemini 套件增强）
 * 包含：
 *  1. 动态模型档位文本汉化修复与禁用 File Launcher 自动弹窗
 *  2. 顶栏极简 >_ CLI 快捷启动按钮（自动识别当前项目目录与系统代理并拉起本机 agy CLI）
 *  3. 原生 RetrieveUserQuotaSummary + GetUserStatus 周额度/5h额度同步 & 触发自动切号提示
 *  4. GitHub 扩展套件新版本非侵入式提醒气泡（支持一键更新 / 忽略此版本）
 */
if (!window.__ag_i18n_dynamic_fix_v1) {
  window.__ag_i18n_dynamic_fix_v1 = true;
  window.__ag_orig_text_map = new WeakMap();
}

try {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && /experiment|flag/i.test(k)) {
      const v = localStorage.getItem(k);
      if (v && v.includes("enable-sidecar-pill-auto-open")) {
        const parsed = JSON.parse(v);
        if (parsed && typeof parsed === "object") {
          delete parsed["enable-sidecar-pill-auto-open"];
          localStorage.setItem(k, JSON.stringify(parsed));
        }
      }
    }
  }
} catch (_) {}

(function initGeminiSuiteHostBridge(ctxObj) {
  const bridge = ctxObj && ctxObj.suiteBridge;
  if (!bridge || !bridge.origin || !bridge.token) return;
  window.__AG_SUITE_BRIDGE__ = bridge;

  const bridgeFetch = (path, opts = {}) => {
    const headers = Object.assign({}, opts.headers || {}, { "X-Suite-Token": bridge.token });
    return fetch(`${bridge.origin}${path}`, Object.assign({}, opts, { headers }));
  };

  function showMiniNotice(text, isError) {
    let el = document.getElementById("ag-suite-mini-notice");
    if (!el) {
      el = document.createElement("div");
      el.id = "ag-suite-mini-notice";
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.dataset.err = isError ? "1" : "0";
    el.classList.add("show");
    clearTimeout(window.__ag_suite_notice_timer);
    window.__ag_suite_notice_timer = setTimeout(() => el.classList.remove("show"), 4200);
  }

  // 1. 顶栏注入极简 >_ CLI 与 ⚙ 控制台 快捷按钮
  function openAuraDashboardTab() {
    // 若右侧边栏当前收起，先展开它
    const hasSideBarTabs = Boolean(document.querySelector('[data-testid="side-panel-new-tab-button"]'));
    if (!hasSideBarTabs) {
      const toggleBtn = document.querySelector('[data-testid="toggle-aux-sidebar"]');
      if (toggleBtn) toggleBtn.click();
    }
    // 优先切换已打开的 Aura 控制台标签页
    const tabBtns = Array.from(document.querySelectorAll(".agy-aux-tab button"));
    const existing = tabBtns.find((b) => /Aura 控制台|Aura Dashboard/i.test((b.innerText || "").trim()));
    if (existing) {
      existing.click();
      return;
    }
    // 否则通过原生 URL query + popstate 打开 Aura 控制台
    try {
      const u = new URL(location.href);
      u.searchParams.set("tab", "sidecar__aura-dashboard/dashboard__/");
      history.pushState(history.state, "", u.toString());
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch {}
  }

  function ensureCliButton() {
    const anchor =
      document.querySelector('[data-testid="titlebar-more-actions"]') ||
      document.querySelector('[data-testid="toggle-overview-panel"]');
    if (!anchor || !anchor.parentElement) return;

    if (!document.getElementById("ag-suite-aura-btn")) {
      const auraBtn = document.createElement("button");
      auraBtn.id = "ag-suite-aura-btn";
      auraBtn.type = "button";
      auraBtn.title = "打开 Aura 控制台（模型额度 / 防幻觉护栏 / 周额度自动切号 / 主题设置）";
      auraBtn.innerHTML = `<span class="ag-aura-ico">⚙</span><span>控制台</span>`;
      auraBtn.addEventListener("click", () => openAuraDashboardTab());
      anchor.parentElement.insertBefore(auraBtn, anchor);
    }

    if (document.getElementById("ag-suite-cli-btn")) return;

    const btn = document.createElement("button");
    btn.id = "ag-suite-cli-btn";
    btn.type = "button";
    btn.title = "在当前项目目录一键启动 agy CLI 终端（自动继承当前账号与系统代理）";
    btn.innerHTML = `<span class="ag-cli-chevron">&gt;_</span><span>CLI</span>`;
    btn.addEventListener("click", async () => {
      const b = window.__AG_SUITE_BRIDGE__;
      if (!b) return;
      btn.disabled = true;
      try {
        let cwd = "";
        try {
          const tabParam = new URLSearchParams(location.search).get("tab") || "";
          const m = tabParam.match(/file__file:\/\/(\/[^?&#]+)/);
          if (m) {
            const p = decodeURIComponent(m[1]);
            cwd = p.replace(/\/[^/]+$/, "");
          }
        } catch {}
        const res = await fetch(`${b.origin}/api/launch-cli`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Suite-Token": b.token },
          body: JSON.stringify({ cwd })
        });
        const j = await res.json();
        if (j.ok) {
          const proxyTag = j.proxyApplied ? ` · 已自动注入代理` : "";
          showMiniNotice(`已打开 ${j.terminal || "CLI"}${proxyTag} · ${j.cwd}`, false);
        } else {
          showMiniNotice(j.error || "启动 agy CLI 失败", true);
        }
      } catch {
        showMiniNotice("无法连接本地套件桥接服务", true);
      } finally {
        btn.disabled = false;
      }
    });
    const auraBtnEl = document.getElementById("ag-suite-aura-btn");
    anchor.parentElement.insertBefore(btn, auraBtnEl || anchor);
  }

  // 2. 通过 Antigravity 原生 RetrieveUserQuotaSummary + GetUserStatus 同步每周/5h额度并评估自动切号
  async function syncNativeModelQuotas() {
    const b = window.__AG_SUITE_BRIDGE__;
    const csrf = window.__APP_CONFIG__ && window.__APP_CONFIG__.csrfToken;
    if (!b || !csrf) return;
    try {
      const reqOpts = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Codeium-Csrf-Token": csrf
        },
        body: JSON.stringify({})
      };
      const [statusRes, summaryRes] = await Promise.allSettled([
        fetch("/exa.language_server_pb.LanguageServerService/GetUserStatus", reqOpts).then((r) => (r.ok ? r.json() : null)),
        fetch("/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary", reqOpts).then((r) => (r.ok ? r.json() : null))
      ]);

      const us = (statusRes.status === "fulfilled" && statusRes.value && statusRes.value.userStatus) || {};
      const summaryGroups =
        (summaryRes.status === "fulfilled" && summaryRes.value && summaryRes.value.response && summaryRes.value.response.groups) || [];

      let groups = [];
      if (Array.isArray(summaryGroups) && summaryGroups.length > 0) {
        groups = summaryGroups.map((g) => {
          const buckets = Array.isArray(g.buckets) ? g.buckets : [];
          const weekly = buckets.find((bk) => bk.window === "weekly" || /weekly/i.test(bk.bucketId || ""));
          const fiveH = buckets.find((bk) => bk.window === "5h" || /5h/i.test(bk.bucketId || ""));
          const weeklyPct = weekly && typeof weekly.remainingFraction === "number" ? Math.round(weekly.remainingFraction * 100) : null;
          const fiveHourPct = fiveH && typeof fiveH.remainingFraction === "number" ? Math.round(fiveH.remainingFraction * 100) : null;
          let cnLabel = g.displayName || "模型池";
          if (/Gemini Models/i.test(cnLabel)) cnLabel = "Gemini 核心池";
          else if (/Claude and GPT/i.test(cnLabel)) cnLabel = "Claude / GPT";
          return {
            key: (weekly && weekly.bucketId) || (fiveH && fiveH.bucketId) || cnLabel,
            label: cnLabel,
            description: g.description || "",
            weeklyBucketId: (weekly && weekly.bucketId) || "",
            weeklyPct,
            weeklyResetTime: (weekly && weekly.resetTime) || "",
            fiveHourPct,
            fiveHourResetTime: (fiveH && fiveH.resetTime) || "",
            pct: weeklyPct !== null ? weeklyPct : fiveHourPct,
            resetTime: (weekly && weekly.resetTime) || (fiveH && fiveH.resetTime) || ""
          };
        });
      } else {
        // 回退至 GetUserStatus 的单模型额度聚合
        const configs = (us.cascadeModelConfigData && us.cascadeModelConfigData.clientModelConfigs) || [];
        const bucketMap = new Map();
        for (const c of configs) {
          const label = String(c.label || "");
          const rem = c.quotaInfo && typeof c.quotaInfo.remainingFraction === "number" ? c.quotaInfo.remainingFraction : null;
          const resetTime = (c.quotaInfo && c.quotaInfo.resetTime) || "";
          if (rem === null) continue;
          let groupKey = "gemini-weekly";
          let groupLabel = "Gemini 核心池";
          if (/Argon/i.test(label)) {
            groupKey = "gemini-argon-wtu-weekly";
            groupLabel = "Gemini 4 Argon";
          } else if (/Claude|GPT/i.test(label)) {
            groupKey = "3p-weekly";
            groupLabel = "Claude / GPT";
          }
          const pct = Math.round(rem * 100);
          const prev = bucketMap.get(groupKey);
          if (!prev) {
            bucketMap.set(groupKey, { key: groupKey, weeklyBucketId: groupKey, label: groupLabel, weeklyPct: pct, pct, resetTime, weeklyResetTime: resetTime });
          } else if (pct < prev.pct) {
            prev.pct = pct;
            prev.weeklyPct = pct;
          }
        }
        groups = Array.from(bucketMap.values());
      }

      const payload = {
        email: us.email || "",
        planName: (us.planStatus && us.planStatus.planInfo && us.planStatus.planInfo.planName) || (us.userTier && us.userTier.name) || "",
        groups
      };
      const postRes = await fetch(`${b.origin}/api/suite-quota`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Suite-Token": b.token },
        body: JSON.stringify(payload)
      });
      if (postRes.ok) {
        const postJson = await postRes.json();
        if (postJson && postJson.autoSwitch && postJson.autoSwitch.triggered) {
          showMiniNotice(
            `⚡ ${postJson.autoSwitch.reason}，已自动切换账号至 ${postJson.autoSwitch.toEmail}`,
            false
          );
        }
      }
    } catch {}
  }

  // 3. GitHub 扩展套件新版本非侵入式提醒气泡
  function renderUpdateToast(info) {
    if (!info || !info.shouldNotify) return;
    if (document.getElementById("ag-suite-update-toast")) return;
    const card = document.createElement("div");
    card.id = "ag-suite-update-toast";
    const items = (info.highlights || []).slice(0, 3).map((x) => `<li>${x}</li>`).join("");
    card.innerHTML = `
      <div class="ag-ut-head">
        <div class="ag-ut-title">✨ 主题与扩展套件有新版本 <span>v${info.latestVersion}</span></div>
        <button class="ag-ut-close" type="button" aria-label="关闭">×</button>
      </div>
      <div class="ag-ut-sub">当前版本 v${info.currentVersion} → 最新版本 v${info.latestVersion}</div>
      ${items ? `<ul class="ag-ut-list">${items}</ul>` : ""}
      <div class="ag-ut-actions">
        <button class="ag-ut-btn primary" type="button" data-act="update">立即一键更新</button>
        <button class="ag-ut-btn ghost" type="button" data-act="dismiss">忽略此版本</button>
      </div>
    `;
    document.body.appendChild(card);

    card.querySelector(".ag-ut-close")?.addEventListener("click", () => card.remove());
    card.querySelector('[data-act="dismiss"]')?.addEventListener("click", async () => {
      card.remove();
      try {
        await bridgeFetch("/api/suite-update/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "dismiss", version: info.latestVersion })
        });
      } catch {}
    });
    card.querySelector('[data-act="update"]')?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "正在同步更新...";
      try {
        const r = await bridgeFetch("/api/suite-update/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update" })
        });
        const j = await r.json();
        if (j.ok) {
          card.remove();
          showMiniNotice(`已同步更新至 v${j.updatedTo}，样式已热生效（插件代码更新重启生效）`, false);
        } else {
          btn.disabled = false;
          btn.textContent = "重试一键更新";
          showMiniNotice("更新失败：" + (j.error || "请检查网络"), true);
        }
      } catch {
        btn.disabled = false;
        btn.textContent = "重试一键更新";
      }
    });
  }

  async function checkUpdatesOnce() {
    try {
      const r = await bridgeFetch("/api/suite-update", { method: "GET" });
      if (r.ok) {
        const info = await r.json();
        renderUpdateToast(info);
      }
    } catch {}
  }

  if (!window.__ag_suite_host_timers_v1) {
    window.__ag_suite_host_timers_v1 = true;
    ensureCliButton();
    setInterval(ensureCliButton, 2500);
    setTimeout(syncNativeModelQuotas, 1200);
    setInterval(syncNativeModelQuotas, 60000);
    setTimeout(checkUpdatesOnce, 4500);
  } else {
    ensureCliButton();
    syncNativeModelQuotas();
  }
})(typeof ctx !== "undefined" ? ctx : (typeof boot !== "undefined" ? boot : null));
