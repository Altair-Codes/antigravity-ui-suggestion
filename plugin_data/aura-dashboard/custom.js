/**
 * user/custom.js — 用户专属前端扩展钩子
 * 在 core/runtime.js 执行完毕后于独立 try/catch 沙箱中调用。
 * 可直接使用入参 `ctx`（或别名 `boot`）：
 *   ctx.version                 - 当前补丁版本与哈希
 *   ctx.preset                  - 当前激活的亮色预设 ('high-contrast' | 'claude-desktop-purewhite' | 'default')
 *   ctx.config                  - 当前归一化后的 AuraConfig 配置对象
 *   ctx.modules                 - 运行时解析后的模块开关状态
 *   ctx.themeVars               - 当前注入的自定义 CSS 变量表
 *   ctx.dict                    - 原型安全的当前汉化词典对象
 *   ctx.metrics                 - 最近一次会话实时指标数据 (TPS / TTFT / Ctx / Out)
 *   ctx.syncPreset()            - 手动触发预设状态同步 ('high-contrast' | 'claude-desktop-purewhite' | 'claude-dark' | 'vintage-dark' | 'default')
 *   ctx.ensureMetricsPill(true) - 手动刷新实时指标胶囊布局
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

// 左侧对话轮次阶梯波浪导航栏：保持预览卡片悬停时的波浪焦点 + 卡片“20 of 28”汉化
if (!window.__ag_wave_nav_hook_v1) {
  window.__ag_wave_nav_hook_v1 = true;
  let lastHoveredLi = null;

  const syncWaveOpenState = () => {
    const card = document.querySelector(
      '[data-testid="conversation-navigator-card"], [data-testid="conversation-navigator-group-card"]'
    );
    if (card) {
      // 顺带汉化预览卡片底部 "20 of 28" -> "第 20 / 28 轮"
      const spans = card.querySelectorAll("span");
      for (const sp of spans) {
        if (sp.children.length === 0) {
          const txt = (sp.textContent || "").trim();
          const m = txt.match(/^(\d+)\s+of\s+(\d+)$/i);
          if (m) {
            sp.textContent = `第 ${m[1]} / ${m[2]} 轮`;
          } else if (/^\d+\s+turns?$/i.test(txt)) {
            sp.textContent = txt.replace(/(\d+)\s+turns?/i, "$1 轮对话");
          }
        }
      }
    } else if (lastHoveredLi) {
      lastHoveredLi.removeAttribute("data-ag-wave-open");
      lastHoveredLi = null;
    }
  };

  document.addEventListener(
    "pointerover",
    (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const li = t.closest('[data-testid="conversation-navigator"] ol > li');
      if (li) {
        if (lastHoveredLi && lastHoveredLi !== li) {
          lastHoveredLi.removeAttribute("data-ag-wave-open");
        }
        li.setAttribute("data-ag-wave-open", "true");
        lastHoveredLi = li;
      }
      syncWaveOpenState();
    },
    { passive: true }
  );

  const obs = new MutationObserver(() => syncWaveOpenState());
  if (document.body) {
    obs.observe(document.body, { childList: true, subtree: true });
  }
}

