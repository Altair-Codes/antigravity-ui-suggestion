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

  // 1. 顶栏注入极简 >_ CLI、⚙ 控制台 与 ↻ 更新 快捷按钮
  async function openAuraDashboardTab() {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const winW = window.innerWidth || 1440;
    const isVisible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.left < winW - 5;
    };
    const isSidePanelVisible = () =>
      isVisible(document.querySelector('[data-testid="new-tab-card-extensions"]')) ||
      isVisible(document.querySelector('[data-testid="side-panel-new-tab-button"]')) ||
      Array.from(document.querySelectorAll(".agy-aux-tab")).some(isVisible);

    // 1) 若右侧边栏确实收起，先展开它
    if (!isSidePanelVisible()) {
      const toggleBtn = document.querySelector('[data-testid="toggle-aux-sidebar"]');
      if (toggleBtn) {
        toggleBtn.click();
        await sleep(240);
      }
    }

    // 2) 若标签栏里已有「星云中枢」，直接切换过去
    const tabBtns = Array.from(document.querySelectorAll(".agy-aux-tab button"));
    const existing = tabBtns.find((b) => /^星云中枢$|^Nebula Hub$|^Aura 控制台$|^Aura Dashboard$/i.test((b.innerText || "").trim()));
    if (existing) {
      existing.click();
      return;
    }

    // 3) 若当前尚未停留在新标签导航页，先点「+ 新标签」；若已在空侧边栏导航页（无 + 号），直接找「扩展」卡片
    let extCard = document.querySelector('[data-testid="new-tab-card-extensions"]');
    if (!isVisible(extCard)) {
      const newTabBtn = document.querySelector('[data-testid="side-panel-new-tab-button"]');
      if (isVisible(newTabBtn)) {
        newTabBtn.click();
        for (let i = 0; i < 6; i++) {
          await sleep(70);
          extCard = document.querySelector('[data-testid="new-tab-card-extensions"]');
          if (isVisible(extCard)) break;
        }
      }
    }

    // 4) 点击「扩展」并在弹出的扩展菜单里精准点击「星云中枢」
    if (isVisible(extCard)) {
      extCard.click();
      for (let i = 0; i < 8; i++) {
        await sleep(80);
        const menuItems = Array.from(document.querySelectorAll('[role="menuitem"], [role="option"]'));
        const auraMenu = menuItems.find((el) => /星云中枢|Nebula Hub|Aura 控制台|Aura Dashboard/i.test((el.innerText || "").trim()));
        if (auraMenu) {
          auraMenu.click();
          return;
        }
      }
    }
  }

  function ensureCliButton() {
    const anchor =
      document.querySelector('[data-testid="titlebar-more-actions"]') ||
      document.querySelector('[data-testid="toggle-overview-panel"]');
    if (!anchor || !anchor.parentElement) return;

    window.__ag_open_aura_fn = openAuraDashboardTab;
    const oldAuraBtn = document.getElementById("ag-suite-aura-btn");
    if (oldAuraBtn && oldAuraBtn.dataset.v !== "3") oldAuraBtn.remove();
    if (!document.getElementById("ag-suite-aura-btn")) {
      const auraBtn = document.createElement("button");
      auraBtn.id = "ag-suite-aura-btn";
      auraBtn.dataset.v = "3";
      auraBtn.type = "button";
      auraBtn.title = "打开星云中枢（模型额度池 / 周额度自动切号 / 防幻觉护栏 / Gemini 流光设置）";
      auraBtn.innerHTML = `<span class="ag-aura-ico">✦</span><span>星云</span>`;
      auraBtn.addEventListener("click", () => window.__ag_open_aura_fn && window.__ag_open_aura_fn());
      anchor.parentElement.insertBefore(auraBtn, anchor);
    }

    if (!document.getElementById("ag-suite-update-btn")) {
      const updBtn = document.createElement("button");
      updBtn.id = "ag-suite-update-btn";
      updBtn.type = "button";
      updBtn.title = "点击一键热重载主题样式并检查 GitHub 套件新版本";
      updBtn.innerHTML = `<span class="ag-upd-ico">↻</span><span class="ag-upd-label">更新</span>`;
      updBtn.addEventListener("click", async () => {
        const b = window.__AG_SUITE_BRIDGE__;
        if (!b) return;
        updBtn.disabled = true;
        const lbl = updBtn.querySelector(".ag-upd-label");
        const prevText = lbl ? lbl.textContent : "更新";
        if (lbl) lbl.textContent = "检查中...";
        try {
          const hdr = { "Content-Type": "application/json", "X-Suite-Token": b.token };
          await fetch(`${b.origin}/api/suite-reload`, { method: "POST", headers: hdr }).catch(() => {});
          const r = await fetch(`${b.origin}/api/suite-update/action`, {
            method: "POST",
            headers: hdr,
            body: JSON.stringify({ action: "check" })
          });
          const info = r.ok ? await r.json() : null;
          if (info && info.hasUpdate) {
            updBtn.classList.add("has-update");
            if (lbl) lbl.textContent = `新版 v${info.latestVersion}`;
            renderUpdateToast({ ...info, shouldNotify: true });
            showMiniNotice(`发现套件新版本 v${info.latestVersion}（当前 v${info.currentVersion}）`, false);
          } else {
            updBtn.classList.remove("has-update");
            if (lbl) lbl.textContent = "更新";
            showMiniNotice(`样式已热重载 · 当前已是最新 v${info?.currentVersion || ""}`, false);
          }
        } catch {
          if (lbl) lbl.textContent = prevText;
          showMiniNotice("检查更新失败，请确认网络或代理状态", true);
        } finally {
          updBtn.disabled = false;
        }
      });
      const auraBtnEl2 = document.getElementById("ag-suite-aura-btn");
      anchor.parentElement.insertBefore(updBtn, auraBtnEl2 ? auraBtnEl2.nextSibling : anchor);
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
        const updBtn = document.getElementById("ag-suite-update-btn");
        if (updBtn && info && info.hasUpdate) {
          updBtn.classList.add("has-update");
          const lbl = updBtn.querySelector(".ag-upd-label");
          if (lbl) lbl.textContent = `新版 v${info.latestVersion}`;
        }
        renderUpdateToast(info);
      }
    } catch {}
  }

  // 4. 退出记忆当前页面，重新打开 Antigravity 时自动恢复上次关闭时的对话与右侧标签页
  function initLastRoutePersistence() {
    if (window.__ag_suite_last_route_v1) return;
    const isStandaloneWin = /^\/(settings-standalone|artifact|terminal-standalone)\b/i.test(location.pathname);
    if (isStandaloneWin) return;
    window.__ag_suite_last_route_v1 = true;

    let trackingReady = false;
    let lastSavedRoute = "";
    let saveTimer = null;

    const getCurrentRoute = () => `${location.pathname || "/"}${location.search || ""}`;
    const getCleanTitle = () => (document.title || "").replace(/\s*-\s*Antigravity\s*$/i, "").trim();

    const postRouteNow = (keepalive) => {
      const b = window.__AG_SUITE_BRIDGE__;
      if (!b || !trackingReady) return;
      const route = getCurrentRoute();
      if (!route || route === lastSavedRoute) return;
      // 如果只是空根路径且没有参数，不覆盖已记忆的具体对话页面
      if (route === "/" && lastSavedRoute && lastSavedRoute.startsWith("/c/")) return;
      try {
        fetch(`${b.origin}/api/suite-last-route`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Suite-Token": b.token },
          body: JSON.stringify({ route, title: getCleanTitle() }),
          keepalive: Boolean(keepalive)
        })
          .then((r) => {
            if (r && r.ok) lastSavedRoute = route;
          })
          .catch(() => {});
      } catch {}
    };

    const scheduleSave = () => {
      if (!trackingReady) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => postRouteNow(false), 350);
    };

    // 拦截 SPA 路由变化 + 退出事件保存
    try {
      const origPush = history.pushState;
      const origReplace = history.replaceState;
      history.pushState = function (...args) {
        const ret = origPush.apply(this, args);
        scheduleSave();
        return ret;
      };
      history.replaceState = function (...args) {
        const ret = origReplace.apply(this, args);
        scheduleSave();
        return ret;
      };
    } catch {}
    window.addEventListener("popstate", scheduleSave, { passive: true });
    window.addEventListener("pagehide", () => postRouteNow(true), { passive: true });
    window.addEventListener("beforeunload", () => postRouteNow(true), { passive: true });
    setInterval(() => {
      if (trackingReady && getCurrentRoute() !== lastSavedRoute) scheduleSave();
    }, 2000);

    // 仅在全新打开 Antigravity 窗口且停留在默认首页（尚未进入具体会话）时恢复一次
    const alreadyRestored = (() => {
      try { return sessionStorage.getItem("ag_suite_route_restored_v1") === "1"; } catch { return false; }
    })();
    const markRestored = () => {
      try { sessionStorage.setItem("ag_suite_route_restored_v1", "1"); } catch {}
    };

    const isDefaultLanding = location.pathname === "/" || /^\/new\b/i.test(location.pathname);
    if (!alreadyRestored && isDefaultLanding) {
      markRestored();
      bridgeFetch("/api/suite-last-route", { method: "GET" })
        .then((r) => (r.ok ? r.json() : null))
        .then((info) => {
          const targetRoute = info && info.enabled && typeof info.route === "string" ? info.route.trim() : "";
          if (targetRoute && targetRoute !== "/" && targetRoute !== getCurrentRoute()) {
            try {
              history.replaceState(history.state, "", targetRoute);
              window.dispatchEvent(new PopStateEvent("popstate"));
              setTimeout(() => {
                // 若 React 路由未响应初始 popstate，则执行一次平滑整页跳转兜底
                if (`${location.pathname}${location.search}` !== targetRoute) {
                  location.replace(`${location.origin}${targetRoute}`);
                }
              }, 380);
              showMiniNotice(`已自动恢复上次关闭时的页面${info.title ? " · " + info.title : ""}`, false);
            } catch {}
          }
          setTimeout(() => {
            trackingReady = true;
            postRouteNow(false);
          }, 1200);
        })
        .catch(() => {
          trackingReady = true;
        });
    } else {
      markRestored();
      trackingReady = true;
      setTimeout(() => postRouteNow(false), 600);
    }
  }

  if (!window.__ag_suite_host_timers_v1) {
    window.__ag_suite_host_timers_v1 = true;
    ensureCliButton();
    setInterval(ensureCliButton, 2500);
    initLastRoutePersistence();
    setTimeout(syncNativeModelQuotas, 1200);
    setInterval(syncNativeModelQuotas, 60000);
    setTimeout(checkUpdatesOnce, 4500);
  } else {
    ensureCliButton();
    initLastRoutePersistence();
    syncNativeModelQuotas();
  }
})(typeof ctx !== "undefined" ? ctx : (typeof boot !== "undefined" ? boot : null));

// 5. 斜杠命令 (/) 与技能弹窗菜单全量汉化：格式化为「中文名 (英文名)」+ 中文描述
(function initSlashAndSkillLocalization() {
  const SLASH_SKILL_I18N = {
    // 核心系统斜杠命令
    "plan": { zhName: "计划", zhDesc: "在执行任务前仔细规划方案与步骤。" },
    "goal": { zhName: "目标", zhDesc: "持续深入运行，直至指定目标完全达成。" },
    "compact": { zhName: "压缩上下文", zhDesc: "立即压缩当前会话（总结历史记录以释放上下文窗口空间）。" },
    "schedule": { zhName: "定时任务", zhDesc: "按周期计划或作为一次性定时器运行指令。" },
    "browser": { zhName: "浏览器", zhDesc: "调用内置浏览器子代理执行网页交互与自动化任务。" },
    "grill-me": { zhName: "访谈对齐", zhDesc: "通过交互式提问访谈与您对齐方案设计细节。" },
    "teamwork": { zhName: "团队协作", zhDesc: "调用多智能体团队自主协作攻克大型复杂项目。" },
    "teamwork-preview": { zhName: "团队协作预览", zhDesc: "调用多智能体团队自主协作攻克大型复杂项目。" },
    "learn": { zhName: "经验反思", zhDesc: "总结近期成功经验或纠正内容，沉淀为可复用的技能或规则。" },
    "boost": { zhName: "深度增强", zhDesc: "调用 Boost 多智能体编排器处理高复杂度任务。" },
    "btw": { zhName: "顺便提问", zhDesc: "在不打断当前主对话流程的情况下快速穿插提问。" },

    // MCP 提示词命令
    "mcp:notion_notion:make-this-a-notion-database": { zhName: "转为 Notion 数据库", zhDesc: "将当前工作内容转换为可追踪的 Notion 数据库。" },
    "mcp:notion_notion:make-this-a-notion-page": { zhName: "转为 Notion 页面", zhDesc: "将当前工作内容保存为持久化的 Notion 文档页面。" },
    "mcp:figma_figma:create_design_system_rules": { zhName: "生成 Figma 设计系统规则", zhDesc: "为当前代码仓库生成 Figma 设计系统对接规则提示词。" },

    // Antigravity 内置核心技能与扩展技能
    "nebula-theme": { zhName: "星云中枢控制", zhDesc: "控制、检查与配置 Antigravity 星云中枢（Google Gemini 流光主题、中英双语与斜杠汉化、一体式流光遥测舱、多账号自动切号与防幻觉护栏）。", custom: true },
    "agy-customizations": { zhName: "自定义系统指南", zhDesc: "Antigravity 自定义系统完整指南：涵盖技能、规则、插件、钩子与 MCP 服务的创建与加载优先级。" },
    "antigravity-guide": { zhName: "官方使用指南", zhDesc: "Google Antigravity (AGY) 综合指南与快速参考，涵盖 agy CLI、IDE、SDK、斜杠命令、快捷键与扩展配置。" },
    "aura-theme": { zhName: "星云中枢控制", zhDesc: "控制、检查与配置 Antigravity 星云中枢（Google Gemini 流光主题、字体排版、中英双语、一体式遥测舱、CDP 热重载与 API）。", custom: true },
    "automation": { zhName: "自动化任务向导", zhDesc: "交互式设计并创建后台定时自动化任务（也可通过 /automation 命令触发）。" },
    "conversations": { zhName: "会话管理", zhDesc: "通过本地接口编程管理 Antigravity 会话：新建、列表、读取状态、重命名、归档、置顶、星标、分组或删除会话。" },
    "file-launcher": { zhName: "文件启动器", zhDesc: "打开文件启动器侧边栏或注册目标文件，支持右侧分栏直开预览、一键复制 @引用、批量操作、收藏防压缩及默认软件打开。" },
    "generative_ui": { zhName: "生成式交互界面", zhDesc: "在聊天内联或独立制品中渲染富交互 HTML 组件（图表、数据可视化、交互控件与教学演示）。" },
    "google-antigravity-sdk": { zhName: "Antigravity SDK 开发", zhDesc: "使用 Google Antigravity (AGY) SDK 设计、实现和调试自主 AI 智能体与多智能体系统。" },
    "mcp-app-development": { zhName: "MCP 交互应用开发", zhDesc: "为 Antigravity 构建、打包和调试可在对话或侧边栏渲染交互界面的 MCP Server 应用。" },
    "migrate-agent-settings": { zhName: "迁移智能体配置", zhDesc: "将其他编程助手（Claude Code、Codex、Cursor、Gemini CLI）的 MCP、技能、命令与规则一键迁移为 Antigravity 插件。" },
    "migrate-workflows": { zhName: "迁移旧版工作流", zhDesc: "将全局或工作区中的旧版 Workflows 自动迁移为现代 Skills（生成 SKILL.md 并安全归档旧文件）。" },
    "plugin": { zhName: "插件管理与开发", zhDesc: "管理与创建插件（将技能、子代理、规则、MCP 与钩子打包为独立单元进行安装、启用或停用）。" },
    "run-workflow": { zhName: "运行多智能体工作流", zhDesc: "编写并运行 Python 动态工作流脚本（使用 agent、parallel、pipeline、phase 编排多智能体并发与流水线任务）。" },
    "swarm": { zhName: "多智能体集群", zhDesc: "（预览 / 高额度消耗）启动多智能体集群：多个智能体在各自会话中并行工作，并通过共享看板协同完成任务。" },
    "swarm_monitor": { zhName: "集群状态监控", zhDesc: "专用于 Swarm 集群监控节点：定时检查集群是否停滞并唤醒对应成员解除阻塞。" },
    "swarm_pane": { zhName: "集群总览面板", zhDesc: "专用于 Swarm 集群协调器：维护集群目标、工作分组与截图时间线概览面板。" },
    "ui-plugin-navigation": { zhName: "UI 扩展面板导航", zhDesc: "发现与当前任务相关的 UI 扩展面板，并在对话中生成一键打开右侧面板的快捷胶囊链接。" },

    // 用户自定义工程研发技能（带 ★ 专属标识）
    "plan-task": { zhName: "任务拆解规划", zhDesc: "将业务需求拆成范围、状态、接口、数据和可验收步骤；用于需求设计和实施计划。", custom: true },
    "develop-feature": { zhName: "业务功能开发", zhDesc: "实现 Java、Vue 或小程序业务功能并完成相关验证；不用于只读故障诊断。", custom: true },
    "diagnose-issue": { zhName: "故障诊断定位", zhDesc: "依据报错、日志、截图或链路证据定位已发生故障，再验证修复。", custom: true },
    "change-database": { zhName: "数据库变更设计", zhDesc: "设计或修改表、SQL、存储过程及报表，验证历史数据兼容和恢复路径。", custom: true },
    "change-local-config": { zhName: "本机配置安全修改", zhDesc: "修改安装器、本机配置或可恢复的桌面定制流程，保护配置、进程和恢复能力。", custom: true },
    "refine-ui": { zhName: "界面与交互优化", zhDesc: "基于现有页面或截图完成 UI 优化、App 换皮及移动端浮层选择。", custom: true },
    "security-audit": { zhName: "白盒安全审计", zhDesc: "基于证据链与独立交叉证伪机制，对代码库、API、云架构与 AI/LLM 系统执行白盒安全审计、漏洞挖掘与可信验证。", custom: true },
    "verify-delivery": { zhName: "交付验收核验", zhDesc: "对完成的变更执行相关检查、恢复演练及交付证据核验；区分本地完成与远端发布。", custom: true },
    "go-backend-pro": { zhName: "Go 后端开发专家", zhDesc: "适用于 Go 语言后端开发（Gin API、GORM 数据操作、Goroutine 并发、Channel 与错误处理）。", custom: true },
    "spring-boot-developer": { zhName: "Spring Boot 开发专家", zhDesc: "适用于 Java / Spring Boot / MyBatis-Plus 业务开发（后端接口、CRUD、实体建模、Service 逻辑与数据库操作）。", custom: true },
    "vue3-element-expert": { zhName: "Vue3 前端开发专家", zhDesc: "适用于 Vue3 前端开发（SFC 单文件组件、页面重构、Pinia 状态管理、Element Plus / Ant Design Vue 表单表格）。", custom: true },

    // Chrome DevTools & Web 调试技能
    "a11y-debugging": { zhName: "无障碍调试审计", zhDesc: "使用 Chrome DevTools MCP 进行无障碍（a11y）调试与审计（语义化 HTML、ARIA 标签、焦点状态、键盘导航与对比度）。" },
    "chrome-devtools": { zhName: "Chrome 开发者工具", zhDesc: "通过 Chrome DevTools MCP 进行网页调试、故障排查、浏览器交互自动化、性能分析与网络请求检查。" },
    "chrome-extensions": { zhName: "Chrome 扩展开发", zhDesc: "遵循 Manifest V3 最佳实践构建、调试与发布 Chrome 浏览器扩展程序。" },
    "cookie-debugging": { zhName: "Cookie 与会话调试", zhDesc: "使用 Chrome DevTools MCP 检查和调试 Cookie、会话状态、401/403 认证问题及 SameSite 合规性。" },
    "debug-optimize-lcp": { zhName: "LCP 加载性能优化", zhDesc: "使用 Chrome DevTools MCP 诊断并优化最大内容绘制（LCP）、首屏加载速度与核心 Web 指标（CWV）。" },
    "memory-leak-debugging": { zhName: "内存泄漏诊断", zhDesc: "使用 Chrome DevTools MCP 内存快照工具诊断并解决 JavaScript / Node.js 应用的高内存占用与内存泄漏。" },
    "modern-web-guidance": { zhName: "现代 Web 开发指南", zhDesc: "检索现代 Web 开发（HTML/CSS 与客户端 JS）最新标准与最佳实践，避免使用过时 API。" },
    "troubleshooting": { zhName: "DevTools 连接排障", zhDesc: "排查并解决 Chrome DevTools MCP 的页面连接、目标实例及服务初始化失败问题。" },

    // Canva 设计技能
    "canva-brand-check": { zhName: "Canva 品牌规范检查", zhDesc: "对照品牌工具包检查 Canva 设计稿，报告偏离品牌色板、字体、Logo 使用规范及文案语调之处（只读不改稿）。" },
    "canva-bulk-create": { zhName: "Canva 批量生成设计", zhDesc: "基于带自动填充字段的品牌模板与表格数据（CSV、JSON 或表格），按行批量生成 Canva 设计稿。" },
    "canva-cli": { zhName: "Canva 命令行工具", zhDesc: "使用 Canva CLI (canva api) 在本地脚本中直接操作 Canva 设计稿、文件夹、素材与导出任务。" },
    "canva-design-feedback": { zhName: "Canva 设计评审反馈", zhDesc: "审阅 Canva 设计稿并提供视觉层级、文案传达、排版间距、一致性、可读性与无障碍方面的结构化改进建议。" },
    "canva-edit-design": { zhName: "Canva 编辑设计稿", zhDesc: "编辑现有 Canva 设计稿：修改文本、替换/增删图片视频、调整字号字重颜色对齐、移动缩放元素及更新标题。" },
    "canva-implement-feedback": { zhName: "Canva 落实评审意见", zhDesc: "读取 Canva 设计稿中的所有评论线程，汇总审阅诉求并直接执行明确修改，同时标记需人工决策的事项。" },
    "canva-resize-for-social-media": { zhName: "Canva 社媒多尺寸适配", zhDesc: "将现有 Canva 设计稿批量适配并生成多平台社交媒体尺寸变体（TikTok、Instagram、小红书/微信/YouTube 等）。" },

    // Figma 设计与代码协同技能
    "figma-3d-transforms": { zhName: "Figma 3D 变换效果", zhDesc: "在 Figma 中添加或编辑 3D 变换（景深、透视、Z 轴旋转、倾斜、等轴测及视差卡片效果）。" },
    "figma-code-connect": { zhName: "Figma 代码连接映射", zhDesc: "创建并维护 Figma Code Connect 映射模板文件（.figma.ts / .figma.js），将设计组件与代码片段关联。" },
    "figma-code-workflows": { zhName: "Figma 代码导入工作流", zhDesc: "将本地 HTML 或项目代码导入 Figma，选择可编辑设计画框、可运行代码图层或独立 Make 文件并修复预览。" },
    "figma-create-new-file": { zhName: "Figma 新建设计文件", zhDesc: "在创建新的 Figma Design、FigJam 或 Slides 文件前必须加载的前置技能。" },
    "figma-design-to-code": { zhName: "Figma 设计稿转代码", zhDesc: "将 Figma 设计稿还原为高质量前端代码的必选前置技能（调用 get_design_context 前必须加载）。" },
    "figma-generate-design": { zhName: "Figma 生成页面设计", zhDesc: "将现有应用页面、视图或多区块布局转换为使用设计系统 Token 组装的 Figma 页面与组件。" },
    "figma-generate-diagram": { zhName: "Figma 生成架构图表", zhDesc: "在 FigJam 中生成流程图、架构图、时序图、ER 图、状态机或甘特图的必选前置技能。" },
    "figma-generate-library": { zhName: "Figma 构建设计系统库", zhDesc: "从代码库构建或更新 Figma 专业级设计系统（变量 Token、组件变体集、深浅主题与基础规范）。" },
    "figma-generative-plugins": { zhName: "Figma 生成式插件开发", zhDesc: "创建、编写、修复或扩展可复用的生成式 Figma 插件（调用 create/update_generative_plugin 前必读）。" },
    "figma-implement-motion": { zhName: "Figma 动效转代码", zhDesc: "将 Figma 中的微交互与动画过渡还原为生产级前端动效代码。" },
    "figma-shaders": { zhName: "Figma 着色器特效", zhDesc: "在 Figma 中创建、修改或迭代自定义 Shader 着色器特效与程序化纹理填充。" },
    "figma-spec": { zhName: "Figma 产品规格文档", zhDesc: "在 Figma 独立规格文档或内嵌规格中创建、阅读、编辑和评审 PRD、设计简报与 RFC 技术文档。" },
    "figma-swiftui": { zhName: "Figma 与 SwiftUI 互转", zhDesc: "支持 Figma 设计稿转 iOS/iPad SwiftUI 代码，或将 SwiftUI 视图与 Token 反向同步回 Figma 文件。" },
    "figma-use": { zhName: "Figma 插件脚本执行", zhDesc: "调用 use_figma 在 Figma 文件上下文中执行 JS 读写操作（创建修改节点、绑定变量、构建组件变体）的必选前置技能。" },
    "figma-use-figjam": { zhName: "FigJam 白板操作", zhDesc: "在 FigJam 白板环境中使用 use_figma 工具创建与编排白板节点。" },
    "figma-use-motion": { zhName: "Figma 动效关键帧编排", zhDesc: "通过 use_figma 为 Figma 节点添加、编辑和检查关键帧动画、缓动曲线与时间轴时长。" },
    "figma-use-slides": { zhName: "Figma 幻灯片编排", zhDesc: "在 Figma Slides 演示文稿环境中使用 use_figma 工具创建与编辑幻灯片。" },

    // Mobbin 移动端/网页 UI 参考技能
    "best-practices": { zhName: "Mobbin 最佳实践", zhDesc: "说明 Mobbin 的能力边界及各技能协作方式，在进行 UI 设计参考检索前优先读取。" },
    "plain-writing": { zhName: "平实界面文案写作", zhDesc: "让 Mobbin 生成的设计分析报告像真人撰写一样平实自然，去除 AI 腔调、夸张修饰与套路化排比。" },
    "redesign-screen": { zhName: "界面重设计方案", zhDesc: "参考 Mobbin 上真实上线产品的交互模式重新设计现有页面，保留原有设计系统并输出前后对比图与分析报告。" },
    "search": { zhName: "Mobbin 界面检索优化", zhDesc: "在调用 search_screens / search_flows / search_sections 前优化检索词与筛选模式以获取更精准的 UI 参考。" },

    // Notion 知识库与项目管理技能
    "notion-build-my-engineering-wiki": { zhName: "构建 Notion 工程百科", zhDesc: "整合技术文档、项目上下文与聊天记录，在 Notion 中搭建结构化的工程团队知识库首页。" },
    "notion-create-my-team-handbook": { zhName: "创建 Notion 团队手册", zhDesc: "将分散的流程制度与团队文档整理为易于检索、权责清晰的 Notion 团队手册。" },
    "notion-database-designer": { zhName: "Notion 数据库设计", zhDesc: "将零散笔记与周期性工作转化为字段与视图合理的 Notion 任务/内容追踪数据库。" },
    "notion-knowledge-capture": { zhName: "Notion 知识沉淀", zhDesc: "将对话记录与笔记沉淀为 Notion 百科页面、操作指南、FAQ、决策记录（ADR）或复盘文档。" },
    "notion-meeting-prep": { zhName: "Notion 会议筹备", zhDesc: "结合 Notion 上下文与相关调研准备会议议程、内部预读材料与决策简报。" },
    "notion-organize-my-semester": { zhName: "Notion 学期课程整理", zhDesc: "根据课程大纲、讲义笔记与作业安排，在 Notion 中规划整学期的学习与待办事项。" },
    "notion-plan-marketing-campaigns": { zhName: "Notion 营销活动策划", zhDesc: "在 Notion 中统一组织营销活动简报、内容创意、排期日历与制作进度。" },
    "notion-research-documentation": { zhName: "Notion 跨源调研报告", zhDesc: "跨 Notion 工作区检索并核对资料，结合外部调研汇总为带引用出处的简报、对比分析或研究报告。" },
    "notion-set-up-my-project": { zhName: "Notion 项目空间搭建", zhDesc: "创建包含任务、文档与会议记录的 Notion 项目主页，并协助关联团队与项目数据库。" },
    "notion-setup": { zhName: "Notion 智能体初始化", zhDesc: "配置 Notion 工作区连接，使智能体能够记住您的偏好、定位常用文档并接续上次工作。" },
    "notion-spec-to-implementation": { zhName: "Notion 规格转实施计划", zhDesc: "将 Notion 产品或技术规格文档拆解为实施计划、关联任务列表，并基于证据持续更新开发进度。" },
    "notion-weekly-project-digest": { zhName: "Notion 项目周报生成", zhDesc: "对比报告周期内的任务变更、关键决策与阻塞项，生成有据可查的 Notion 项目或团队周报。" },

    // InVideo 视频生成与剪辑技能
    "invideo": { zhName: "InVideo 视频剪辑制作", zhDesc: "在可视化时间轴上制作、剪辑、拼接、配字幕与调色（适用于宣传片、产品发布、解说视频与短视频）。" },
    "invideo-generate": { zhName: "InVideo 多模态素材生成", zhDesc: "为 InVideo 视频生成 AI 图像、视频片段、旁白配音、背景音乐、音效与 3D 素材。" },
    "invideo-media": { zhName: "InVideo 媒体素材管理", zhDesc: "检索与管理上传素材、正版图库视频音乐，并处理配音、音效、降噪与多语种配音。" },
    "invideo-pipeline": { zhName: "InVideo 批量自动化管线", zhDesc: "支持从 CSV 批量生成多支视频、JSON 幂等调用、CI 集成及多智能体协同剪辑同一项目。" },
    "invideo-timeline": { zhName: "InVideo 时间轴深度控制", zhDesc: "精细控制时间轴帧计算、多轨道图层、关键帧动画、变速曲线、LUT 调色、着色器特效与音频闪避。" },
    "higgsfield-to-invideo": { zhName: "Higgsfield 片段转成片", zhDesc: "将 Higgsfield 生成的视频片段按序拼接，添加字幕与配乐并导出成品视频。" },
    "hyperframes-to-invideo": { zhName: "HyperFrames 转成片", zhDesc: "将 HyperFrames 合成渲染为 MP4 并上传至 InVideo 完成剪辑、字幕、配乐与导出。" },
    "magnific-to-invideo": { zhName: "Magnific 片段转成片", zhDesc: "将 Magnific 生成的片段在 InVideo 中按序剪辑、配字幕与音乐并导出成片。" },
    "openedit-to-invideo": { zhName: "OpenEdit 方案转成片", zhDesc: "将 OpenEdit 剪辑方案渲染上传至 InVideo，完成精剪、字幕、配乐与导出。" },
    "remotion-to-invideo": { zhName: "Remotion 动画转成片", zhDesc: "将 Remotion 代码动画渲染为 MP4 上传至 InVideo，添加字幕与配乐后导出成片。" },
    "runway-to-invideo": { zhName: "Runway 片段转成片", zhDesc: "将 Runway 生成的视频片段在 InVideo 中拼接、添加字幕和音乐并导出成片。" },

    // Dart & Flutter 研发技能
    "dart-add-unit-test": { zhName: "Dart 编写单元测试", zhDesc: "使用 package:test 为函数、方法和类编写与组织单元测试，确保逻辑正确且无回归缺陷。" },
    "dart-build-cli-app": { zhName: "Dart 构建命令行工具", zhDesc: "使用 package:args 构建 Dart CLI 命令行应用的架构规范、入口结构、退出码、流路由与子进程管理。" },
    "dart-collect-coverage": { zhName: "Dart 测试覆盖率采集", zhDesc: "使用 coverage 包采集 Dart 代码测试覆盖率并生成 LCOV 报告。" },
    "dart-fix-runtime-errors": { zhName: "Dart 修复运行时错误", zhDesc: "结合 get_runtime_errors 与 LSP 获取活动堆栈、定位故障行、应用修复并通过热重载验证。" },
    "dart-generate-test-mocks": { zhName: "Dart 生成测试 Mock", zhDesc: "使用 package:mockito 与 build_runner 为外部依赖（API 或数据库）定义并生成 Mock 对象。" },
    "dart-migrate-to-checks-package": { zhName: "Dart 迁移至 checks 断言", zhDesc: "将测试代码中 package:matcher 的 expect 断言迁移至现代化的 package:checks。" },
    "dart-resolve-package-conflicts": { zhName: "Dart 解决依赖版本冲突", zhDesc: "当 pub get 因包版本不兼容失败时，诊断并解决依赖冲突的标准工作流。" },
    "dart-run-static-analysis": { zhName: "Dart 静态代码分析", zhDesc: "运行 dart analyze 识别警告与错误，并使用 dart fix --apply 自动修复规范问题。" },
    "dart-setup-ffi-assets": { zhName: "Dart 配置 FFI 原生库", zhDesc: "通过 Dart Native Assets 钩子系统（build.dart / link.dart）编译并打包 C/C++ 动态或静态库。" },
    "dart-use-doc-examples": { zhName: "Dart 文档注入代码示例", zhDesc: "使用 {@example} 指令将外部代码示例注入 Dartdoc，并通过 #region 标签过滤展示片段。" },
    "dart-use-ffigen": { zhName: "Dart 自动生成 FFI 绑定", zhDesc: "使用 package:ffigen 自动生成 C / Objective-C / Swift 的 FFI 绑定，替代手写 dart:ffi。" },
    "dart-use-path-package": { zhName: "Dart 跨平台路径处理", zhDesc: "使用 package:path 与 package:file 安全地进行跨平台文件路径拼接、拆分与扩展名提取。" },
    "dart-use-pattern-matching": { zhName: "Dart 3 模式匹配与解构", zhDesc: "地道运用 Dart 3 模式匹配、switch 表达式与解构来校验数据结构、处理密封类并简化控制流。" },
    "dart-use-primary-constructors": { zhName: "Dart 主构造函数语法", zhDesc: "编写与迁移符合 Dart 新规范的主构造函数（Primary Constructors）与简写初始化语法。" },
    "dart-write-documentation": { zhName: "Dart 编写 API 文档注释", zhDesc: "遵循 Effective Dart 规范为库、类、方法与变量编写高质量的 /// API 文档注释。" },
    "flutter-add-integration-test": { zhName: "Flutter 添加集成测试", zhDesc: "配置 Flutter Driver 并利用 integration_test 包将 UI 交互操作转化为持久化集成测试。" },
    "flutter-add-widget-preview": { zhName: "Flutter 添加组件预览", zhDesc: "使用 previews.dart 系统为新建或修改的 UI 组件添加交互式 Widget 预览。" },
    "flutter-add-widget-test": { zhName: "Flutter 添加组件测试", zhDesc: "使用 WidgetTester 实现组件级测试，验证 UI 渲染与点击、滚动、输入等用户交互。" },
    "flutter-apply-architecture-best-practices": { zhName: "Flutter 分层架构实践", zhDesc: "采用推荐的 UI / Logic / Data 分层架构组织或重构 Flutter 应用以提升可扩展性。" },
    "flutter-build-responsive-layout": { zhName: "Flutter 响应式布局", zhDesc: "使用 LayoutBuilder、MediaQuery 或 Expanded/Flexible 构建同时适配手机、平板与桌面的响应式界面。" },
    "flutter-fix-layout-issues": { zhName: "Flutter 修复布局溢出", zhDesc: "使用 Dart 与 Flutter MCP 工具诊断并修复 RenderFlex overflowed 及无界约束等布局错误。" },
    "flutter-implement-json-serialization": { zhName: "Flutter JSON 序列化", zhDesc: "使用 dart:convert 为模型类规范实现 fromJson 与 toJson 序列化方法。" },
    "flutter-setup-declarative-routing": { zhName: "Flutter 声明式路由配置", zhDesc: "使用 go_router 配置 MaterialApp.router，支持深度链接与 Web 浏览器历史导航。" },
    "flutter-setup-localization": { zhName: "Flutter 国际化多语言配置", zhDesc: "配置 flutter_localizations 与 intl 依赖、启用代码生成并创建 l10n.yaml 多语言配置。" },
    "flutter-use-http-package": { zhName: "Flutter HTTP 网络请求", zhDesc: "使用 http 包规范执行 GET、POST、PUT、DELETE 等 REST API 网络请求。" },
    "xcode-project-setup": { zhName: "Xcode 项目依赖配置", zhDesc: "安全修改 iOS Xcode 项目 (.pbxproj) 以添加 Swift Packages 依赖并链接源文件。" },

    // Firebase 研发与安全规则技能
    "extension-to-functions-codebase": { zhName: "Firebase 扩展转云函数", zhDesc: "将已安装的 Firebase Extension 转换为独立的 Cloud Functions 代码库或可发布的 npm 包。" },
    "firebase-ai-logic-basics": { zhName: "Firebase AI 逻辑集成", zhDesc: "在 Web 应用中集成 Firebase AI Logic（Gemini API），涵盖配置、多模态推理、结构化输出与安全防护。" },
    "firebase-app-hosting-basics": { zhName: "Firebase 全栈应用托管", zhDesc: "使用 Firebase App Hosting 部署和管理带服务端渲染（SSR）的 Next.js / Angular 全栈 Web 应用。" },
    "firebase-auth-basics": { zhName: "Firebase 身份认证配置", zhDesc: "配置与使用 Firebase Authentication 实现用户登录、账号管理及基于认证规则的数据访问控制。" },
    "firebase-basics": { zhName: "Firebase CLI 基础配置", zhDesc: "Firebase CLI 安装、版本检查、账号登录、项目创建与切换（firebase use）以及应用配置文件下载。" },
    "firebase-crashlytics": { zhName: "Firebase 崩溃监控集成", zhDesc: "在应用中配置和集成 Firebase Crashlytics SDK 以实现崩溃报告采集与诊断。" },
    "firebase-data-connect": { zhName: "Firebase PostgreSQL 数据连接", zhDesc: "构建与部署基于 PostgreSQL 的 Firebase Data Connect 后端（表结构设计、授权查询变更与类型安全 SDK 生成）。" },
    "firebase-firestore": { zhName: "Firestore 数据库开发", zhDesc: "配置、管理与查询 Cloud Firestore 数据库（数据建模、安全规则、索引配置及多端 SDK 集成）。" },
    "firebase-hosting-basics": { zhName: "Firebase 静态网站托管", zhDesc: "部署与配置经典 Firebase Hosting（静态站点、SPA 单页应用、自定义域名、重定向重写与预览通道）。" },
    "firebase-remote-config-basics": { zhName: "Firebase 远程配置与开关", zhDesc: "管理 Firebase Remote Config 模板、特性开关、端侧默认值、fetchAndActivate 及实时监听。" },
    "firebase-security-rules-auditor": { zhName: "Firebase 安全规则审计", zhDesc: "审计 Firestore 与 Cloud Storage 安全规则中的越权漏洞、角色绕过、资源耗尽、类型校验与所有权检查缺陷。" },
    "firestore-rules-creation": { zhName: "Firestore 安全规则编写", zhDesc: "设计、编写、重构并加固生产级 Cloud Firestore 安全规则（firestore.rules）。" },

    // Gemini API & Google Maps 技能
    "gemini-api-cli": { zhName: "Gemini API 命令行工具", zhDesc: "在终端通过 gemini-api 调用 Gemini 接口进行图片/语音/音乐/视频生成、YouTube 与文件分析、音视频转写及深度研究。" },
    "gemini-api-dev": { zhName: "Gemini API 应用开发", zhDesc: "使用官方 google-genai (Python) 与 @google/genai (TS/JS) SDK 开发文本、多模态、图像视频语音生成、函数调用与结构化输出。" },
    "gemini-live-api-dev": { zhName: "Gemini Live 实时双向流开发", zhDesc: "使用 Gemini 3.8 Live API 构建基于 WebSocket 的低延迟实时音视频与文本双向流应用（含 VAD、后台推理与实时转录翻译）。" },
    "gemini-omni-flash-api": { zhName: "Gemini Omni 视频生成与编辑", zhDesc: "使用 Gemini Omni 1.2 Flash 进行生成式视频编辑、文生视频、图生视频、首尾帧过渡与视频延展。" },
    "genie-4-live-world": { zhName: "Genie 4 实时交互世界模拟", zhDesc: "使用 Genie 4 通过 Live Interactions API 构建实时交互式 3D 世界生成与物理模拟应用。" },
    "google-maps-platform": { zhName: "Google 地图平台开发", zhDesc: "使用 Google Maps Platform API 与 SDK 构建地图渲染、地点检索、地理编码、路线规划、3D 街景与环境数据功能。" },

    // Google Cloud / BigQuery / Data Agent Kit 技能
    "accidental-data-loss-prevention": { zhName: "防数据误删安全护栏", zhDesc: "在执行任何可能导致不可逆数据丢失的 SQL（DROP/TRUNCATE）、云存储删除或基础设施销毁前，强制暂停并获取用户明确授权。" },
    "bigquery-ai-ml": { zhName: "BigQuery AI 与机器学习", zhDesc: "利用 BigQuery 内置机器学习与生成式 AI 进行时序预测、异常检测、向量语义检索、文本分类摘要与因果分析。" },
    "bigquery-bigframes": { zhName: "BigQuery DataFrames (Python)", zhDesc: "使用 BigQuery DataFrames (BigFrames) 编写 Python 数据处理、分析与机器学习代码。" },
    "bigquery-data-transfer-service": { zhName: "BigQuery 数据传输服务 (DTS)", zhDesc: "发现并检查 BigQuery 数据传输服务（DTS）配置，识别现有数据接入管道并提取传输元数据。" },
    "bigquery-graph-author": { zhName: "BigQuery 属性图建模", zhDesc: "从数据表或模型文档构建 BigQuery 属性图（CREATE PROPERTY GRAPH DDL、关系校验与语义度量定义）。" },
    "bigquery-graph-query": { zhName: "BigQuery 图数据库查询 (GQL)", zhDesc: "使用原生 GQL（图查询语言）、多跳路径、GRAPH_TABLE 与向量混合检索查询 BigQuery 属性图。" },
    "bigquery-observability": { zhName: "BigQuery 可观测性与监控", zhDesc: "通过 INFORMATION_SCHEMA、Cloud Monitoring 与 REST API 检索 BigQuery 槽位争用、作业并发、队列延迟与计费遥测。" },
    "bigquery-optimization": { zhName: "BigQuery 性能与成本优化", zhDesc: "优化 BigQuery 容量规划、表分区与聚簇设计、SQL/MERGE 查询性能、物化视图与 BI Engine 加速。" },
    "bigquery-troubleshooting": { zhName: "BigQuery 故障与慢查询排障", zhDesc: "对失败、卡慢或高成本的 BigQuery 作业进行执行图瓶颈定位与根因分析（RCA）。" },
    "bigtable-basics": { zhName: "Bigtable 实例与表设计", zhDesc: "创建 Bigtable 实例与表、设计高性能行键与列族、编写查询代码并诊断热点（Hotspotting）性能问题。" },
    "building-data-apps": { zhName: "构建现代数据看板应用", zhDesc: "构建现代化数据应用、可视化监控看板与交互式分析报表。" },
    "cloud-databases-onboarding": { zhName: "Google Cloud 数据库选型向导", zhDesc: "评估业务数据库需求，基于选型矩阵推荐最匹配的 Google Cloud 数据库产品或迁移目标并协助创建实例。" },
    "curate-context": { zhName: "知识目录上下文编排", zhDesc: "使用 kcmd 创建、导入、编辑、修复或发布适用于 BigQuery/Spanner/Cloud SQL 的 Open Knowledge Format (OKF) 知识目录上下文集。" },
    "dak-setup": { zhName: "Data Agent Kit 初始化配置", zhDesc: "检查 gcloud 与 ADC 凭据，收集 GCP 项目 ID、区域与服务并运行 dak-setup 完成数据智能体套件配置。" },
    "data-autocleaning": { zhName: "数据自动清洗与标准化", zhDesc: "面向 Dataform / dbt / BigQuery 管道的自动化数据质量校验、Schema 映射与数据清洗转换。" },
    "dataform-bigquery": { zhName: "Dataform SQLX 数据管道", zhDesc: "为 BigQuery ELT 编写规范高效的 Dataform SQLX 数据转换管道、源声明与工作流配置。" },
    "dbt-bigquery": { zhName: "dbt BigQuery 数据建模", zhDesc: "创建、修改与优化面向 BigQuery 的 dbt 数据模型、SQL 转换与项目配置。" },
    "discover-assets": { zhName: "GCP 数据资产发现与检索", zhDesc: "在 Google Cloud 中搜索与检查数据资产、表结构 Schema、元数据及数据治理策略。" },
    "enforcing-resource-attribution": { zhName: "CLI 资源标签归属强制", zhDesc: "在通过 run_command 执行 bq 或 gcloud 命令时自动确保携带合规的资源归属标签。" },
    "federate-lakehouse-catalog": { zhName: "数据湖仓联邦目录配置", zhDesc: "将 Google Cloud Lakehouse 联邦目录连接至外部 Iceberg REST 目录（如 Databricks Unity、AWS Glue）以供 BigQuery/Spark 查询。" },
    "gcp-composer-troubleshooting": { zhName: "Cloud Composer (Airflow) 排障", zhDesc: "对 Cloud Composer (Apache Airflow) 中失败的编排管道与 DAG 执行根因分析（RCA）并生成修复方案。" },
    "gcp-data-pipelines": { zhName: "GCP 数据管道总入口", zhDesc: "在 Google Cloud 上构建、管理与编排数据管道（dbt、Dataflow、Dataform、Spark、DTS 与 Cloud Composer）的导航入口。" },
    "gcp-dataflow": { zhName: "Cloud Dataflow (Beam) 管道", zhDesc: "编写、打包、运行与排查 Dataflow 上的 Apache Beam 流批一体数据管道及 Flex Templates。" },
    "gcp-managed-airflow-dag-authoring": { zhName: "Airflow DAG 编写与校验", zhDesc: "面向 Cloud Composer (MSAA) 的 Apache Airflow 2/3 DAG 编写规范、环境发现与本地/远程校验流程。" },
    "gcp-managed-airflow-migrations": { zhName: "Airflow 版本升级迁移", zhDesc: "指导将 Cloud Composer 中的 Airflow DAG 平滑迁移至 Airflow 2.11.1 或 Airflow 3，自动扫描破坏性变更。" },
    "gcp-managed-airflow-recommendations": { zhName: "Cloud Composer 调优建议", zhDesc: "提供 Cloud Composer (Airflow) 环境配置、弹性扩缩容、防组件重启与系统健康度分析的最佳实践。" },
    "gcp-managed-spark-upgrades": { zhName: "GCP Spark 运行时版本升级", zhDesc: "将 Google Cloud Managed Spark (Dataproc) 集群与 Serverless 作业升级至新版本，包含静态兼容性分析与代码改造。" },
    "gcp-pipeline-orchestration": { zhName: "Composer 多源数据管道编排", zhDesc: "为 Google Cloud Composer 生成或更新跨 dbt、Notebook、Spark、Dataform、Vertex AI 与 BigQuery 的编排定义并部署触发。" },
    "gcp-pipeline-resource-provisioning": { zhName: "数据管道资源声明式交付", zhDesc: "通过 deployment.yaml 自动管理开发/预发/生产环境的 BigQuery、Dataform、Dataproc 与 DTS 资源声明式创建。" },
    "gcp-spark": { zhName: "GCP PySpark 作业开发", zhDesc: "在 Google Cloud Managed Spark 上编写、调优并运行 PySpark 与 Apache Spark 数据处理作业。" },
    "gcp-spark-observability": { zhName: "GCP Spark 集群与作业监控", zhDesc: "监控与评估 Dataproc Serverless 及 GCE 集群的 Spark 批次、会话、DCU 算力消耗、Shuffle 存储、僵尸集群与配额告警。" },
    "gcp-spark-troubleshooting": { zhName: "GCP Spark 作业故障诊断", zhDesc: "排查 Google Cloud Spark / Dataproc 失败或卡慢作业，分析 GCS 驱动日志与事件日志中的 OOM、403 权限及类缺失错误。" },
    "gcs-security-assessment": { zhName: "Cloud Storage 存储安全评估", zhDesc: "基于遥测数据评估 GCS 存储桶与项目的安全态势（公开访问、IAM 过度授权、CMEK 加密、VPC 服务控制与审计日志）。" },
    "google-cloud-storage-basics": { zhName: "Cloud Storage 对象存储管理", zhDesc: "创建与管理 GCS 存储桶、对象上传下载、签名 URL、IAM/ACL 权限、存储级别生命周期、软删除保护及性能调优。" },
    "google-cloud-storage-bucket-architect": { zhName: "GCS 存储桶架构设计", zhDesc: "根据业务负载分析并设计默认安全、高性价比的 GCS 存储桶配置（区域、存储类型、统一访问控制、防公开访问与生命周期）。" },
    "google-cloud-storage-fuse": { zhName: "Cloud Storage FUSE 挂载调优", zhDesc: "使用 gcsfuse 将 GCS 存储桶挂载为 POSIX 文件系统，在 GKE / GCE / Cloud Run 上调优缓存与 ML 检查点读写性能。" },
    "managing-python-dependencies": { zhName: "Python 虚拟环境与依赖管理", zhDesc: "确保遵循项目级 Python 虚拟环境与包管理规范（如 uv / poetry / venv），避免污染全局 pip 环境。" },
    "ml-best-practices": { zhName: "机器学习与数据分析规范", zhDesc: "执行聚类、分类、回归、时序预测、假设检验、模型对比等机器学习或数据分析任务时的必选方法论规范。" },
    "notebook-guidance": { zhName: "Jupyter Notebook 分析指南", zhDesc: "指导使用 Jupyter Notebook 结合 BigQuery 进行数据探索、清洗、可视化绘图、分步验证与机器学习建模。" },
    "resolving-mcp-region-configs": { zhName: "GCP 区域级 MCP 配置校验", zhDesc: "在使用 Composer / Dataform / Dataflow 区域级 MCP 工具前检查并修复未替换的 $GCP_REGION 区域占位符。" },
    "schema-mapping": { zhName: "源表到目标表 Schema 映射", zhDesc: "面向多表（>3 张表）ETL/ELT 数据集成任务，深入分析并生成高保真的源端到目标端 Schema 转换映射清单。" }
  };

  // 构建英文描述 -> 中文描述快速查找表（即使某些场景下命令名被过滤也能精确翻译描述）
  const DESC_LOOKUP = new Map();
  for (const info of Object.values(SLASH_SKILL_I18N)) {
    if (info && info.zhDesc) {
      DESC_LOOKUP.set(info.zhDesc, info.zhDesc);
    }
  }

  // 智能词根回退：当未来新装了不在静态表中的新技能（kebab-case 或 mcp:xxx:yyy）时自动生成中文名
  const SLUG_WORD_DICT = {
    "mcp": "MCP", "notion": "Notion", "figma": "Figma", "canva": "Canva", "flutter": "Flutter",
    "dart": "Dart", "firebase": "Firebase", "firestore": "Firestore", "bigquery": "BigQuery",
    "bigtable": "Bigtable", "gcp": "GCP", "gcs": "GCS", "gemini": "Gemini", "invideo": "InVideo",
    "chrome": "Chrome", "devtools": "DevTools", "spark": "Spark", "airflow": "Airflow",
    "dataform": "Dataform", "dataflow": "Dataflow", "dbt": "dbt", "xcode": "Xcode",
    "create": "创建", "edit": "编辑", "update": "更新", "delete": "删除", "search": "搜索",
    "debug": "调试", "debugging": "调试", "test": "测试", "testing": "测试", "setup": "配置",
    "config": "配置", "guide": "指南", "guidance": "指南", "basics": "基础", "optimization": "优化",
    "optimize": "优化", "troubleshooting": "排障", "observability": "监控", "security": "安全",
    "audit": "审计", "auditor": "审计", "migration": "迁移", "migrations": "迁移", "migrate": "迁移",
    "generate": "生成", "design": "设计", "code": "代码", "workflow": "工作流", "workflows": "工作流",
    "pipeline": "管道", "pipelines": "管道", "data": "数据", "api": "API", "cli": "CLI",
    "app": "应用", "apps": "应用", "ui": "界面", "theme": "主题", "plugin": "插件", "plugins": "插件",
    "rules": "规则", "skill": "技能", "skills": "技能", "agent": "智能体", "agents": "智能体"
  };

  function resolveSlashOrSkillEntry(rawLabel, descText) {
    if (!rawLabel) return null;
    if (SLASH_SKILL_I18N[rawLabel]) return SLASH_SKILL_I18N[rawLabel];
    // 兼容可能已包含中文或括号的情况
    const parenMatch = rawLabel.match(/\(([a-zA-Z0-9_:-]+)\)\s*$/);
    if (parenMatch && SLASH_SKILL_I18N[parenMatch[1]]) {
      return SLASH_SKILL_I18N[parenMatch[1]];
    }
    // 针对未知的 mcp:server:prompt 或多段 kebab-case 技能名的智能回退（排除含点号/斜杠的文件名）
    if (!/[./\\]/.test(rawLabel) && (/^mcp:[a-z0-9_:-]+$/i.test(rawLabel) || (/^[a-z0-9]+(?:[-_][a-z0-9]+)+$/.test(rawLabel) && descText && descText.length > 12))) {
      const cleanSlug = rawLabel.replace(/^mcp:[^:]+:/i, "");
      const parts = cleanSlug.split(/[-_:]+/).filter(Boolean);
      const translatedParts = parts.map((w) => SLUG_WORD_DICT[w.toLowerCase()] || w);
      const hasChinese = translatedParts.some((p) => /[\u4e00-\u9fa5]/.test(p));
      if (hasChinese) {
        return {
          zhName: translatedParts.join(" "),
          zhDesc: /[\u4e00-\u9fa5]/.test(descText || "") ? "" : ""
        };
      }
    }
    return null;
  }

  function isChineseModeActive() {
    const html = document.documentElement;
    if (html && html.getAttribute("data-aura-active") === "false") return false;
    return true;
  }

  function decorateSlashMenuDom() {
    if (!isChineseModeActive()) return;

    // 1) 处理下拉菜单项 [data-testid="menu-option-label"] 与同行 [data-testid="menu-option-description"]
    const labels = document.querySelectorAll('[data-testid="menu-option-label"]');
    for (let i = 0; i < labels.length; i++) {
      const labelEl = labels[i];
      const rawName = (labelEl.textContent || "").trim();
      const row = labelEl.parentElement;
      const descEl = row ? row.querySelector('[data-testid="menu-option-description"]') : null;
      const rawDesc = descEl ? (descEl.textContent || "").trim() : "";

      const entry = resolveSlashOrSkillEntry(rawName, rawDesc);
      if (entry && entry.zhName) {
        if (labelEl.getAttribute("data-ag-zh-label") !== entry.zhName) {
          labelEl.setAttribute("data-ag-zh-label", entry.zhName);
        }
        if (entry.custom) {
          labelEl.setAttribute("data-ag-custom-skill", "1");
        } else if (labelEl.hasAttribute("data-ag-custom-skill")) {
          labelEl.removeAttribute("data-ag-custom-skill");
        }
        if (descEl) {
          if (entry.zhDesc) {
            if (descEl.getAttribute("data-ag-zh-desc") !== entry.zhDesc) {
              descEl.setAttribute("data-ag-zh-desc", entry.zhDesc);
            }
          } else if (descEl.hasAttribute("data-ag-zh-desc")) {
            descEl.removeAttribute("data-ag-zh-desc");
          }
        }
      } else {
        if (labelEl.hasAttribute("data-ag-zh-label")) {
          labelEl.removeAttribute("data-ag-zh-label");
        }
        if (labelEl.hasAttribute("data-ag-custom-skill")) {
          labelEl.removeAttribute("data-ag-custom-skill");
        }
        if (descEl && descEl.hasAttribute("data-ag-zh-desc")) {
          descEl.removeAttribute("data-ag-zh-desc");
        }
      }
    }

    // 2) 处理右侧悬停详情卡片 [data-testid="hover-card-title"] 与 [data-testid="hover-card-description"]
    const hoverTitles = document.querySelectorAll('[data-testid="hover-card-title"]');
    for (let i = 0; i < hoverTitles.length; i++) {
      const titleWrap = hoverTitles[i];
      const titleSpan = titleWrap.querySelector("span.truncate") || titleWrap.querySelector("span:last-child");
      if (!titleSpan) continue;
      const rawTitle = (titleSpan.textContent || "").trim();
      const card = titleWrap.parentElement;
      const hoverDescEl = card ? card.querySelector('[data-testid="hover-card-description"]') : null;
      const rawHoverDesc = hoverDescEl ? (hoverDescEl.textContent || "").trim() : "";

      const entry = resolveSlashOrSkillEntry(rawTitle, rawHoverDesc);
      if (entry && entry.zhName) {
        if (titleSpan.getAttribute("data-ag-zh-label") !== entry.zhName) {
          titleSpan.setAttribute("data-ag-zh-label", entry.zhName);
        }
        if (entry.custom) {
          titleSpan.setAttribute("data-ag-custom-skill", "1");
        } else if (titleSpan.hasAttribute("data-ag-custom-skill")) {
          titleSpan.removeAttribute("data-ag-custom-skill");
        }
        if (hoverDescEl && entry.zhDesc) {
          if (hoverDescEl.getAttribute("data-ag-zh-desc") !== entry.zhDesc) {
            hoverDescEl.setAttribute("data-ag-zh-desc", entry.zhDesc);
          }
        }
      } else {
        if (titleSpan.hasAttribute("data-ag-zh-label")) {
          titleSpan.removeAttribute("data-ag-zh-label");
        }
        if (titleSpan.hasAttribute("data-ag-custom-skill")) {
          titleSpan.removeAttribute("data-ag-custom-skill");
        }
        if (hoverDescEl && hoverDescEl.hasAttribute("data-ag-zh-desc")) {
          hoverDescEl.removeAttribute("data-ag-zh-desc");
        }
      }
    }
  }

  let rafPending = false;
  function scheduleDecorate() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      decorateSlashMenuDom();
    });
  }

  decorateSlashMenuDom();

  if (window.__ag_slash_skill_i18n_observer) {
    try { window.__ag_slash_skill_i18n_observer.disconnect(); } catch {}
  }
  const obs = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
      if (m.type === "childList" || m.type === "characterData") {
        scheduleDecorate();
        break;
      }
    }
  });
  if (document.body) {
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  } else {
    window.addEventListener("DOMContentLoaded", () => {
      decorateSlashMenuDom();
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
  }
  window.__ag_slash_skill_i18n_observer = obs;
})();

