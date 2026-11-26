/**
 * 引力目录 (Gravity Explorer) 自研零依赖轻量预览引擎
 * 支持代码轻量词法着色、Markdown 排版、CSV/TSV 表格、图片像素尺寸与媒体预览
 */
(function initGravityPreviewer() {
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const CODE_KEYWORDS = new Set([
    "import", "from", "export", "default", "const", "let", "var", "function", "async", "await",
    "return", "if", "else", "for", "while", "switch", "case", "break", "continue", "try", "catch",
    "finally", "throw", "new", "class", "extends", "true", "false", "null", "undefined",
    "def", "class", "elif", "with", "as", "pass", "yield", "lambda", "None", "True", "False",
    "func", "package", "struct", "interface", "go", "defer", "chan", "map", "range", "type",
    "pub", "fn", "mut", "impl", "enum", "match", "use", "mod", "crate",
    "SELECT", "FROM", "WHERE", "INSERT", "UPDATE", "DELETE", "CREATE", "TABLE", "ORDER", "BY"
  ]);

  function highlightLine(line, isJson) {
    if (!line) return "\u200B";
    const out = [];
    const tokenRe = isJson
      ? /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?/g
      : /(\/\/.*$|#.*$)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b([A-Za-z_]\w*)\b|(\b\d+(?:\.\d+)?\b)/g;

    let last = 0;
    let m;
    while ((m = tokenRe.exec(line)) !== null) {
      if (m.index > last) out.push(esc(line.slice(last, m.index)));
      if (isJson) {
        if (m[1]) {
          out.push(m[2]
            ? `<span class="tok-key">${esc(m[1])}</span>${esc(m[2])}`
            : `<span class="tok-str">${esc(m[1])}</span>`);
        } else if (m[3]) {
          out.push(`<span class="tok-kw">${esc(m[3])}</span>`);
        } else {
          out.push(`<span class="tok-num">${esc(m[0])}</span>`);
        }
      } else if (m[1]) {
        out.push(`<span class="tok-com">${esc(m[1])}</span>`);
      } else if (m[2]) {
        out.push(`<span class="tok-str">${esc(m[2])}</span>`);
      } else if (m[3]) {
        out.push(CODE_KEYWORDS.has(m[3]) ? `<span class="tok-kw">${esc(m[3])}</span>` : esc(m[3]));
      } else if (m[4]) {
        out.push(`<span class="tok-num">${esc(m[4])}</span>`);
      }
      last = m.index + m[0].length;
    }
    if (last < line.length) out.push(esc(line.slice(last)));
    return out.join("");
  }

  function renderCode(container, text, ext) {
    const isJson = ext === ".json";
    const lines = String(text || "").split(/\r?\n/);
    const maxLines = Math.min(lines.length, 1200);
    const html = [];
    html.push('<div class="gv-code-wrap"><table class="gv-code-table"><tbody>');
    for (let i = 0; i < maxLines; i++) {
      html.push(`<tr><td class="gv-ln">${i + 1}</td><td class="gv-lc">${highlightLine(lines[i], isJson)}</td></tr>`);
    }
    html.push("</tbody></table>");
    if (lines.length > maxLines) {
      html.push(`<div class="gv-trunc-note">已截断展示前 ${maxLines} 行（共 ${lines.length} 行），可点击「↗」在主标签打开完整文件</div>`);
    }
    html.push("</div>");
    container.innerHTML = html.join("");
  }

  function formatInlineMd(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code class="gv-md-code">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+|file:\/\/\/[^)]+)\)/g, '<span class="gv-md-link">$1</span>');
  }

  function renderMarkdown(container, text) {
    const lines = String(text || "").split(/\r?\n/);
    const out = ['<div class="gv-md-body">'];
    let inFence = false;
    let fenceBuf = [];
    for (const line of lines) {
      if (line.trim().startsWith("```")) {
        if (!inFence) {
          inFence = true;
          fenceBuf = [];
        } else {
          out.push(`<pre class="gv-md-pre"><code>${esc(fenceBuf.join("\n"))}</code></pre>`);
          inFence = false;
        }
        continue;
      }
      if (inFence) {
        fenceBuf.push(line);
        continue;
      }
      const h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) {
        const lvl = h[1].length;
        out.push(`<h${lvl} class="gv-md-h${lvl}">${formatInlineMd(h[2])}</h${lvl}>`);
      } else if (/^>\s?/.test(line)) {
        out.push(`<blockquote class="gv-md-quote">${formatInlineMd(line.replace(/^>\s?/, ""))}</blockquote>`);
      } else if (/^\s*[-*]\s+/.test(line)) {
        out.push(`<div class="gv-md-li">• ${formatInlineMd(line.replace(/^\s*[-*]\s+/, ""))}</div>`);
      } else if (line.trim() === "") {
        out.push('<div class="gv-md-gap"></div>');
      } else {
        out.push(`<p class="gv-md-p">${formatInlineMd(line)}</p>`);
      }
    }
    if (inFence && fenceBuf.length) {
      out.push(`<pre class="gv-md-pre"><code>${esc(fenceBuf.join("\n"))}</code></pre>`);
    }
    out.push("</div>");
    container.innerHTML = out.join("");
  }

  function parseCsvLine(line, sep) {
    const cells = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === sep && !inQ) {
        cells.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells;
  }

  function renderCsv(container, text, ext) {
    const sep = ext === ".tsv" ? "\t" : ",";
    const lines = String(text || "").split(/\r?\n/).filter((l) => l.length > 0);
    const maxRows = Math.min(lines.length, 200);
    const html = ['<div class="gv-csv-wrap"><table class="gv-csv-table">'];
    for (let i = 0; i < maxRows; i++) {
      const cells = parseCsvLine(lines[i], sep);
      const tag = i === 0 ? "th" : "td";
      html.push("<tr>" + cells.map((c) => `<${tag}>${esc(c)}</${tag}>`).join("") + "</tr>");
    }
    html.push("</table>");
    if (lines.length > maxRows) {
      html.push(`<div class="gv-trunc-note">仅展示前 ${maxRows} 行（共 ${lines.length} 行）</div>`);
    }
    html.push("</div>");
    container.innerHTML = html.join("");
  }

  function renderPreview(container, payload, onAction) {
    if (!container) return;
    if (!payload || payload.error) {
      container.innerHTML = `<div class="gv-preview-empty">${esc(payload?.error || "无法预览该文件")}</div>`;
      return;
    }
    if (payload.kind === "image") {
      container.innerHTML = `
        <div class="gv-img-stage">
          <img id="gv-preview-img" src="${payload.dataUrl}" alt="${esc(payload.name)}" />
          <div id="gv-img-dim" class="gv-img-dim">加载尺寸中...</div>
        </div>
      `;
      const img = container.querySelector("#gv-preview-img");
      const dim = container.querySelector("#gv-img-dim");
      if (img && dim) {
        img.addEventListener("load", () => {
          dim.textContent = `${img.naturalWidth} × ${img.naturalHeight} px · ${(payload.size / 1024).toFixed(1)} KB`;
        });
      }
      return;
    }
    if (payload.kind === "video" || payload.kind === "audio") {
      const src = `/api/raw-media?path=${encodeURIComponent(payload.relPath || payload.fullPath)}`;
      container.innerHTML =
        payload.kind === "video"
          ? `<div class="gv-media-wrap"><video controls src="${src}" style="max-width:100%;max-height:100%;"></video></div>`
          : `<div class="gv-media-wrap"><audio controls src="${src}" style="width:92%;"></audio></div>`;
      return;
    }
    if (payload.kind === "binary" || payload.kind === "directory") {
      container.innerHTML = `
        <div class="gv-bin-card">
          <div class="gv-bin-name">${esc(payload.name)}</div>
          <div class="gv-bin-reason">${esc(payload.reason || "不支持直接文本预览")}</div>
          <div class="gv-bin-actions">
            <button type="button" class="gv-btn primary" data-act="open-tab">主标签页打开</button>
            <button type="button" class="gv-btn" data-act="open-os">系统默认软件打开</button>
            <button type="button" class="gv-btn" data-act="reveal">在访达/文件夹中显示</button>
          </div>
        </div>
      `;
      container.querySelectorAll("button[data-act]").forEach((btn) => {
        btn.addEventListener("click", () => onAction && onAction(btn.dataset.act));
      });
      return;
    }
    if (payload.kind === "markdown") {
      renderMarkdown(container, payload.content);
      return;
    }
    if (payload.kind === "csv") {
      renderCsv(container, payload.content, payload.ext);
      return;
    }
    renderCode(container, payload.content, payload.ext);
  }

  window.GravityPreview = { render: renderPreview };
})();
