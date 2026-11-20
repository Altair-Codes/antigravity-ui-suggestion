/**
 * user/custom.js — 用户专属前端扩展钩子（Google Gemini 套件增强）
 * 包含：
 *  1. 动态模型档位文本汉化修复与禁用 File Launcher 自动弹窗
 *  2. 顶栏极简 >_ CLI 快捷启动按钮（自动识别当前项目目录并拉起本机 agy CLI）
 *  3. 原生 GetUserStatus 模型额度池实时同步至 Aura 控制台
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
    window.__ag_suite_notice_timer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  // 1. 顶栏注入极简 >_ CLI 快捷启动按钮
  function ensureCliButton() {
    if (document.getElementById("ag-suite-cli-btn")) return;
    const anchor =
      document.querySelector('[data-testid="titlebar-more-actions"]') ||
      document.querySelector('[data-testid="toggle-overview-panel"]');
    if (!anchor || !anchor.parentElement) return;

    const btn = document.createElement("button");
    btn.id = "ag-suite-cli-btn";
    btn.type = "button";
    btn.title = "在当前项目目录一键启动 agy CLI 终端";
    btn.innerHTML = `<span class="ag-cli-chevron">&gt;_</span><span>CLI</span>`;
    btn.addEventListener("click", async () => {
      const b = window.__AG_SUITE_BRIDGE__;
      if (!b) return;
      btn.disabled = true;
      try {
        // 尽量从地址栏或打开的文件 tab 中推断当前工作区目录
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
          showMiniNotice(`已打开 ${j.terminal || "CLI"} · ${j.cwd}`, false);
        } else {
          showMiniNotice(j.error || "启动 agy CLI 失败", true);
        }
      } catch {
        showMiniNotice("无法连接本地套件桥接服务", true);
      } finally {
        btn.disabled = false;
      }
    });
    anchor.parentElement.insertBefore(btn, anchor);
  }

  // 2. 通过 Antigravity 原生 GetUserStatus 同步模型额度池到 Aura 控制台
  async function syncNativeModelQuotas() {
    const b = window.__AG_SUITE_BRIDGE__;
    const csrf = window.__APP_CONFIG__ && window.__APP_CONFIG__.csrfToken;
    if (!b || !csrf) return;
    try {
      const resp = await fetch("/exa.language_server_pb.LanguageServerService/GetUserStatus", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Codeium-Csrf-Token": csrf
        },
        body: JSON.stringify({})
      });
      if (!resp.ok) return;
      const json = await resp.json();
      const us = json && json.userStatus;
      if (!us) return;
      const configs = (us.cascadeModelConfigData && us.cascadeModelConfigData.clientModelConfigs) || [];
      const bucketMap = new Map();

      for (const c of configs) {
        const label = String(c.label || "");
        const rem = c.quotaInfo && typeof c.quotaInfo.remainingFraction === "number" ? c.quotaInfo.remainingFraction : null;
        const resetTime = (c.quotaInfo && c.quotaInfo.resetTime) || "";
        if (rem === null) continue;

        let groupKey = "Other";
        let groupLabel = "其他模型";
        if (/Argon/i.test(label)) {
          groupKey = "argon";
          groupLabel = "Gemini 4 Argon";
        } else if (/Carbon/i.test(label)) {
          groupKey = "carbon";
          groupLabel = "Gemini 4 Carbon";
        } else if (/Claude|GPT/i.test(label)) {
          groupKey = "claude_gpt";
          groupLabel = "Claude / GPT";
        } else if (/Gemini|Orchestrator/i.test(label)) {
          groupKey = "gemini_core";
          groupLabel = "Gemini 核心池";
        }

        const prev = bucketMap.get(groupKey);
        const pct = Math.round(rem * 100);
        if (!prev) {
          bucketMap.set(groupKey, { key: groupKey, label: groupLabel, pct, resetTime, modelsCount: 1 });
        } else {
          prev.modelsCount += 1;
          if (pct < prev.pct) prev.pct = pct;
          if (!prev.resetTime && resetTime) prev.resetTime = resetTime;
        }
      }

      const order = ["gemini_core", "claude_gpt", "argon", "carbon", "Other"];
      const groups = order.map((k) => bucketMap.get(k)).filter(Boolean);
      const payload = {
        email: us.email || "",
        planName: (us.planStatus && us.planStatus.planInfo && us.planStatus.planInfo.planName) || (us.userTier && us.userTier.name) || "",
        groups
      };
      await fetch(`${b.origin}/api/suite-quota`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Suite-Token": b.token },
        body: JSON.stringify(payload)
      });
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

  // 防重复启动定时器
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
