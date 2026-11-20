const getSidecar = () => window.sidecar;
const $ = (id) => document.getElementById(id);

let currentWorkspaceUri = null;
let currentRootPath = '';
let showHiddenFiles = false;
let activePreviewFile = null;

// Multi-selection state
const selectedItems = new Map(); // relPath -> { item, row }
let lastClickedRow = null;

// macOS Finder (访达) Authentic Vector Icons & Metadata Helpers
const SVG_CHEVRON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

function svgFolder(open = false) {
  return `<svg width="18" height="18" viewBox="0 0 24 24"><defs><linearGradient id="fdrBack" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#48b2f8"/><stop offset="100%" stop-color="#1e82d8"/></linearGradient><linearGradient id="fdrFront" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#72d0ff"/><stop offset="100%" stop-color="#2997f2"/></linearGradient></defs><path d="M2.2 6.2C2.2 4.98 3.18 4 4.4 4h4.3c.62 0 1.2.29 1.57.79l.95 1.3c.18.25.47.41.78.41H19.6c1.22 0 2.2.98 2.2 2.2v9.1c0 1.22-.98 2.2-2.2 2.2H4.4c-1.22 0-2.2-.98-2.2-2.2V6.2z" fill="url(#fdrBack)"/><path d="${open ? 'M2.2 9.5h19.6v8.3c0 1.22-.98 2.2-2.2 2.2H4.4c-1.22 0-2.2-.98-2.2-2.2V9.5z' : 'M2.2 8.2c0-.66.54-1.2 1.2-1.2h17.2c.66 0 1.2.54 1.2 1.2v9.6c0 1.22-.98 2.2-2.2 2.2H4.4c-1.22 0-2.2-.98-2.2-2.2V8.2z'}" fill="url(#fdrFront)"/></svg>`;
}

function svgFinderDoc(badgeText = '', badgeColor = '#8e9299') {
  const badge = badgeText
    ? `<rect x="4.5" y="10.5" width="15" height="7.5" rx="2" fill="${badgeColor}"/><text x="12" y="16.1" text-anchor="middle" fill="#ffffff" font-size="6.4" font-weight="700" font-family="-apple-system,SF Pro Text,sans-serif">${badgeText}</text>`
    : `<line x1="8" y1="11" x2="16" y2="11" stroke="#b0b5bd" stroke-width="1.4" stroke-linecap="round"/><line x1="8" y1="14.5" x2="14" y2="14.5" stroke="#b0b5bd" stroke-width="1.4" stroke-linecap="round"/>`;
  return `<svg width="18" height="18" viewBox="0 0 24 24"><path d="M6 2.5h8.2L19 7.3V19.5c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V4.5c0-1.1.9-2 2-2z" fill="#f4f5f7" stroke="#c8ccd2" stroke-width="1"/><path d="M14.2 2.5V6.3c0 .55.45 1 1 1H19" fill="#dfe2e7"/>${badge}</svg>`;
}

const FINDER_TYPES = {
  '.md':    { badge: 'M',   color: '#19a9d5', kind: 'Markdown 文稿' },
  '.txt':   { badge: 'TXT', color: '#8e9299', kind: '纯文本文稿' },
  '.swift': { badge: 'S',   color: '#f05138', kind: 'Swift 源代码' },
  '.sh':    { badge: 'SH',  color: '#f59e0b', kind: 'shell 脚本' },
  '.zsh':   { badge: 'SH',  color: '#f59e0b', kind: 'shell 脚本' },
  '.bash':  { badge: 'SH',  color: '#f59e0b', kind: 'shell 脚本' },
  '.ps1':   { badge: 'PS',  color: '#2563eb', kind: 'PowerShell 脚本' },
  '.js':    { badge: 'JS',  color: '#eab308', kind: 'JavaScript 源码' },
  '.mjs':   { badge: 'JS',  color: '#eab308', kind: 'JavaScript 模块' },
  '.cjs':   { badge: 'JS',  color: '#eab308', kind: 'JavaScript 源码' },
  '.ts':    { badge: 'TS',  color: '#3b82f6', kind: 'TypeScript 源码' },
  '.tsx':   { badge: 'TSX', color: '#0ea5e9', kind: 'TSX 组件源码' },
  '.jsx':   { badge: 'JSX', color: '#0ea5e9', kind: 'JSX 组件源码' },
  '.py':    { badge: 'PY',  color: '#10b981', kind: 'Python 脚本' },
  '.json':  { badge: '{ }', color: '#6366f1', kind: 'JSON 文稿' },
  '.plist': { badge: 'XML', color: '#64748b', kind: 'XML PropertyList' },
  '.xml':   { badge: 'XML', color: '#64748b', kind: 'XML 文稿' },
  '.yaml':  { badge: 'YML', color: '#ec4899', kind: 'YAML 配置' },
  '.yml':   { badge: 'YML', color: '#ec4899', kind: 'YAML 配置' },
  '.toml':  { badge: 'TML', color: '#8b5cf6', kind: 'TOML 配置' },
  '.html':  { badge: 'HTM', color: '#ef4444', kind: 'HTML 网页文稿' },
  '.css':   { badge: 'CSS', color: '#8b5cf6', kind: 'CSS 样式表' },
  '.scss':  { badge: 'SCS', color: '#ec4899', kind: 'SCSS 样式表' },
  '.go':    { badge: 'GO',  color: '#06b6d4', kind: 'Go 源代码' },
  '.rs':    { badge: 'RS',  color: '#ea580c', kind: 'Rust 源代码' },
  '.java':  { badge: 'JV',  color: '#d97706', kind: 'Java 源代码' },
  '.c':     { badge: 'C',   color: '#3b82f6', kind: 'C 源代码' },
  '.cpp':   { badge: 'C++', color: '#2563eb', kind: 'C++ 源代码' },
  '.h':     { badge: 'H',   color: '#6366f1', kind: 'C/C++ 头文件' },
  '.pdf':   { badge: 'PDF', color: '#dc2626', kind: 'PDF 文稿' },
  '.png':   { badge: 'PNG', color: '#a855f7', kind: 'PNG 图像' },
  '.jpg':   { badge: 'JPG', color: '#a855f7', kind: 'JPEG 图像' },
  '.jpeg':  { badge: 'JPG', color: '#a855f7', kind: 'JPEG 图像' },
  '.svg':   { badge: 'SVG', color: '#ec4899', kind: 'SVG 矢量图形' },
  '.webp':  { badge: 'IMG', color: '#a855f7', kind: 'WebP 图像' },
  '.gif':   { badge: 'GIF', color: '#a855f7', kind: 'GIF 图像' },
  '.zip':   { badge: 'ZIP', color: '#64748b', kind: 'ZIP 归档' },
};

function getFileIcon(ext, isDirectory, isExpanded = false) {
  if (isDirectory) return svgFolder(isExpanded);
  const t = FINDER_TYPES[ext];
  if (!t) return svgFinderDoc('', '#8e9299');
  return svgFinderDoc(t.badge, t.color);
}

function getFinderKind(ext, isDirectory, name = '') {
  if (name && name.endsWith('.xcodeproj')) return 'Xcode 项目包';
  if (isDirectory) return '文件夹';
  if (name === 'LICENSE') return '纯文本文稿';
  return FINDER_TYPES[ext]?.kind || (ext ? `${ext.slice(1).toUpperCase()} 文件` : '文稿');
}

function formatFinderDate(ms) {
  if (!ms) return '--';
  const d = new Date(ms);
  const now = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (isToday) return `今天 ${hm}`;
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  const isYest = d.getFullYear() === yest.getFullYear() && d.getMonth() === yest.getMonth() && d.getDate() === yest.getDate();
  if (isYest) return `昨天 ${hm}`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}

function formatSize(bytes, isDirectory = false) {
  if (isDirectory) return '--';
  if (typeof bytes !== 'number' || isNaN(bytes)) return '--';
  if (bytes < 1024) return `${bytes} 字节`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function refreshZebraStripes() {
  const rows = Array.from(document.querySelectorAll('#tree-container .tree-node-row')).filter(r => r.offsetParent !== null);
  rows.forEach((r, idx) => {
    r.classList.toggle('zebra-even', idx % 2 === 1);
  });
}

function updateFinderFooter(selectedItem = null) {
  const pathBar = $('finder-path-bar');
  if (!pathBar) return;
  const full = selectedItem?.fullPath || currentRootPath || '';
  const parts = full.split(/[/\\]/).filter(Boolean);
  const tail = parts.slice(-5);
  const miniFolder = `<svg width="12" height="12" viewBox="0 0 24 24"><path d="M2.5 6.5C2.5 5.12 3.62 4 5 4h4.2l1.8 2.2H19c1.38 0 2.5 1.12 2.5 2.5v8.8c0 1.38-1.12 2.5-2.5 2.5H5c-1.38 0-2.5-1.12-2.5-2.5V6.5z" fill="#3da5f5"/></svg>`;
  pathBar.innerHTML = tail.map((seg, i) => {
    const sep = i > 0 ? `<span class="finder-path-sep">▸</span>` : '';
    return `${sep}<span class="finder-path-seg">${miniFolder}<span>${seg}</span></span>`;
  }).join('');
}

let toastTimer;
function showToast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
}

// ---------------------------------------------------------------------------
// API Calls
// ---------------------------------------------------------------------------
async function fetchApi(path, options = {}) {
  const bodyData = options.body || {};
  if (currentWorkspaceUri && !bodyData.workspaceUri) {
    bodyData.workspaceUri = currentWorkspaceUri;
  }
  if (currentRootPath && !bodyData.root) {
    bodyData.root = currentRootPath;
  }

  const s = getSidecar();
  if (s && typeof s.fetch === 'function') {
    const res = await s.fetch(path, {
      method: options.method || 'GET',
      body: options.method === 'POST' ? JSON.stringify(bodyData) : undefined,
    });
    return res.json();
  }

  const token = new URLSearchParams(window.location.search).get('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['X-Sidecar-Token'] = token;

  const res = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.method === 'POST' ? JSON.stringify(bodyData) : undefined,
  });
  return res.json();
}
window.fetchApi = fetchApi;

// Helper to reliably resolve the active workspace folder URI
async function resolveActiveWorkspaceUri() {
  const s = getSidecar();
  const convId = s?.conversationId || new URLSearchParams(window.location.search).get('conversationId');

  // 1. Deterministic resolution via Antigravity conversation metadata API
  if (convId) {
    try {
      const metaRes = await fetchApi('/_sidecar/get-conversation-metadata', {
        method: 'POST',
        body: { conversationId: convId }
      });
      const meta = metaRes?.response?.conversationMetadata?.metadata || metaRes?.response?.conversation_metadata?.metadata;
      const uri = meta?.workspaces?.[0]?.workspaceFolderAbsoluteUri || meta?.workspaceUris?.[0];
      if (uri) return uri;
    } catch (e) {
      console.warn('Could not resolve workspace from conversation metadata:', e);
    }
  }

  // 2. Safe race with sidecar.getWorkspaceUris() with 300ms timeout
  if (s && typeof s.getWorkspaceUris === 'function') {
    try {
      const uris = await Promise.race([
        s.getWorkspaceUris(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 300))
      ]);
      if (uris && uris.length > 0) return uris[0];
    } catch {
      // getWorkspaceUris timed out waiting for host push
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Selection Management
// ---------------------------------------------------------------------------
function clearSelection() {
  selectedItems.forEach(({ row }) => {
    if (row) row.classList.remove('selected');
  });
  selectedItems.clear();
}

function selectItem(item, row, addToExisting = false) {
  if (!addToExisting) {
    clearSelection();
  }
  selectedItems.set(item.relPath, { item, row });
  if (row) row.classList.add('selected');
  lastClickedRow = row;
}

function toggleItemSelection(item, row) {
  if (selectedItems.has(item.relPath)) {
    selectedItems.delete(item.relPath);
    if (row) row.classList.remove('selected');
  } else {
    selectedItems.set(item.relPath, { item, row });
    if (row) row.classList.add('selected');
  }
  lastClickedRow = row;
}

function selectRange(targetRow) {
  const allRows = Array.from(document.querySelectorAll('.tree-node-row'));
  const startIdx = allRows.indexOf(lastClickedRow);
  const endIdx = allRows.indexOf(targetRow);
  if (startIdx === -1 || endIdx === -1) {
    if (targetRow?.__item) selectItem(targetRow.__item, targetRow, true);
    return;
  }
  const [min, max] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
  for (let i = min; i <= max; i++) {
    const r = allRows[i];
    if (r?.__item) {
      selectedItems.set(r.__item.relPath, { item: r.__item, row: r });
      r.classList.add('selected');
    }
  }
  lastClickedRow = targetRow;
}

// ---------------------------------------------------------------------------
// Native Antigravity Host Tab Integration
// ---------------------------------------------------------------------------
async function openFileInNativeTab(itemOrPath) {
  let targetPath = '';
  let fileName = '';

  if (typeof itemOrPath === 'string') {
    targetPath = itemOrPath;
    fileName = itemOrPath.split(/[/\\]/).pop();
  } else if (itemOrPath && typeof itemOrPath === 'object') {
    targetPath = itemOrPath.fullPath || itemOrPath.relPath;
    fileName = itemOrPath.name || targetPath.split(/[/\\]/).pop();
  }

  if (!targetPath) return;

  try {
    showToast(`正在打开 ${fileName}...`);
    const res = await fetchApi('/api/open-native-tab', {
      method: 'POST',
      body: { path: targetPath, fullPath: itemOrPath?.fullPath }
    });

    if (res && res.success) {
      showToast(`已在主标签页打开: ${fileName}`);
    } else {
      showToast(`打开失败: ${res?.error || '未知错误'}`);
    }
  } catch (err) {
    showToast(`打开失败: ${err.message}`);
  }
}

async function revealInFinder(itemOrPath) {
  const payload = typeof itemOrPath === 'string'
    ? { path: itemOrPath }
    : { path: itemOrPath?.relPath || '', fullPath: itemOrPath?.fullPath };
  try {
    const res = await fetchApi('/api/reveal-in-finder', {
      method: 'POST',
      body: payload
    });
    if (res && res.success) {
      showToast('已在 Finder 中显示');
    } else {
      showToast(`打开 Finder 失败: ${res?.error || '未知错误'}`);
    }
  } catch (err) {
    showToast(`打开 Finder 失败: ${err.message}`);
  }
}

async function copyFileMention(relPath) {
  if (!relPath) return;
  const clean = relPath.replace(/\\/g, '/');
  const mention = clean.includes(' ') ? `@"${clean}"` : `@${clean}`;
  try {
    await navigator.clipboard.writeText(mention);
    showToast(`已复制引用: ${mention}`);
  } catch (_) {
    try {
      await fetchApi('/api/copy-text-to-clipboard', {
        method: 'POST',
        body: { text: mention }
      });
      showToast(`已复制引用: ${mention}`);
    } catch (err) {
      showToast(`复制失败: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Preview Close & Recycle Bin Operations (Module Top-Level Scope)
// ---------------------------------------------------------------------------
function closePreview() {
  const drawer = $('preview-drawer');
  if (drawer) drawer.hidden = true;
  if ($('preview-resizer')) $('preview-resizer').hidden = true;
  if ($('annot-send-popover')) $('annot-send-popover').hidden = true;
  if ($('selection-quote-bubble')) $('selection-quote-bubble').hidden = true;
  if ($('delete-confirm-modal')) $('delete-confirm-modal').hidden = true;
  if (window.previewManager) window.previewManager.destroy();
  const body = $('preview-body');
  if (body) body.innerHTML = '';
  const customActions = $('preview-custom-actions');
  if (customActions) customActions.innerHTML = '';
  if ($('btn-send-agent')) $('btn-send-agent').hidden = false;
  activePreviewFile = null;
}

function confirmRecycleDelete(fileName, isDir) {
  return new Promise((resolve) => {
    const modal = $('delete-confirm-modal');
    const targetEl = $('delete-confirm-target');
    const btnConfirm = $('btn-delete-confirm');
    const btnCancel = $('btn-delete-cancel');

    if (!modal) {
      resolve(true);
      return;
    }

    const typeStr = isDir ? '資料夾' : '檔案';
    if (targetEl) targetEl.textContent = `${typeStr}「${fileName}」`;

    modal.hidden = false;

    const cleanup = () => {
      modal.hidden = true;
      btnConfirm?.removeEventListener('click', onConfirm);
      btnCancel?.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onOverlayClick);
      window.removeEventListener('keydown', onKeyDown);
    };

    const onConfirm = () => {
      cleanup();
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    const onOverlayClick = (e) => {
      if (e.target === modal) {
        onCancel();
      }
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    };

    btnConfirm?.addEventListener('click', onConfirm);
    btnCancel?.addEventListener('click', onCancel);
    modal.addEventListener('click', onOverlayClick);
    window.addEventListener('keydown', onKeyDown);
    btnConfirm?.focus();
  });
}

async function deleteItemToRecycleBin(item, wrapper) {
  const isDir = Boolean(item.isDirectory);
  const confirmed = await confirmRecycleDelete(item.name, isDir);
  if (!confirmed) return;

  try {
    showToast(`正在將 ${item.name} 移至資源回收桶...`);
    const res = await fetchApi('/api/delete-to-recycle-bin', {
      method: 'POST',
      body: { path: item.relPath, fullPath: item.fullPath }
    });

    if (res && (res.success || res.ok)) {
      showToast(`🗑️ 已將 ${item.name} 移至資源回收桶`);
      if (activePreviewFile === item.relPath) {
        closePreview();
      }
      selectedItems.delete(item.relPath);
      if (wrapper) {
        wrapper.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        wrapper.style.opacity = '0';
        wrapper.style.transform = 'translateX(-10px)';
        setTimeout(() => {
          wrapper.remove();
        }, 200);
      }
    } else {
      showToast(`刪除失敗: ${res?.error || '未知錯誤'}`);
    }
  } catch (err) {
    showToast(`刪除失敗: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Tree Rendering
// ---------------------------------------------------------------------------
function createTreeNode(item, level = 0) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node-wrapper';
  wrapper.dataset.path = item.relPath;
  wrapper.dataset.name = item.name.toLowerCase();

  const row = document.createElement('div');
  row.className = `tree-node-row${item.isDirectory ? ' is-dir' : ''}`;
  row.style.paddingLeft = `${level * 14 + 8}px`;
  row.__item = item;
  row.setAttribute('draggable', 'true');

  if (selectedItems.has(item.relPath)) {
    row.classList.add('selected');
    selectedItems.set(item.relPath, { item, row });
  }

  const expander = document.createElement('span');
  expander.className = 'tree-expander';
  expander.innerHTML = item.isDirectory ? SVG_CHEVRON : '';

  const icon = document.createElement('span');
  icon.className = 'tree-icon';
  icon.innerHTML = getFileIcon(item.ext, item.isDirectory, false);

  const label = document.createElement('span');
  label.className = 'tree-label';
  label.textContent = item.name;

  row.appendChild(expander);
  row.appendChild(icon);
  row.appendChild(label);

  // macOS Finder Columns: 修改日期 | 大小 | 种类
  const colDate = document.createElement('span');
  colDate.className = 'tree-col-date';
  colDate.textContent = formatFinderDate(item.modified);
  row.appendChild(colDate);

  const colSize = document.createElement('span');
  colSize.className = 'tree-col-size';
  colSize.textContent = formatSize(item.size, item.isDirectory);
  row.appendChild(colSize);

  const colKind = document.createElement('span');
  colKind.className = 'tree-col-kind';
  colKind.textContent = getFinderKind(item.ext, item.isDirectory, item.name);
  row.appendChild(colKind);

  // Sleek hover actions for both files and folders
  const actions = document.createElement('div');
  actions.className = 'tree-actions';

  const btnMention = document.createElement('button');
  btnMention.textContent = '@';
  btnMention.title = '复制 @引用 到剪贴板';
  btnMention.addEventListener('click', (e) => {
    e.stopPropagation();
    copyFileMention(item.relPath);
  });
  actions.appendChild(btnMention);

  if (!item.isDirectory) {
    const btnOpenTab = document.createElement('button');
    btnOpenTab.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
    btnOpenTab.title = '在主标签页打开';
    btnOpenTab.addEventListener('click', (e) => {
      e.stopPropagation();
      openFileInNativeTab(item);
    });
    actions.appendChild(btnOpenTab);
  }

  const btnFinder = document.createElement('button');
  btnFinder.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
  btnFinder.title = '在 Finder 中显示';
  btnFinder.addEventListener('click', (e) => {
    e.stopPropagation();
    revealInFinder(item);
  });
  actions.appendChild(btnFinder);

  const btnDelete = document.createElement('button');
  btnDelete.className = 'btn-delete';
  btnDelete.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
  btnDelete.title = '移至废纸篓';
  btnDelete.addEventListener('click', async (e) => {
    e.stopPropagation();
    await deleteItemToRecycleBin(item, wrapper);
  });
  actions.appendChild(btnDelete);
  row.appendChild(actions);

  const childrenContainer = document.createElement('div');
  childrenContainer.className = 'tree-children hidden';

  let isLoaded = false;
  let isExpanded = false;

  async function toggleFolder() {
    if (!item.isDirectory) {
      openPreview(item.relPath);
      return;
    }

    isExpanded = !isExpanded;
    expander.classList.toggle('expanded', isExpanded);
    icon.innerHTML = getFileIcon(item.ext, true, isExpanded);

    if (isExpanded) {
      if (!isLoaded) {
        childrenContainer.innerHTML = '<div class="loading-state" style="padding:4px 16px;">加载中...</div>';
        childrenContainer.classList.remove('hidden');
        const data = await fetchApi('/api/tree', {
          method: 'POST',
          body: { dir: item.relPath, showHidden: showHiddenFiles },
        });

        childrenContainer.innerHTML = '';
        if (data.items && data.items.length > 0) {
          for (const child of data.items) {
            childrenContainer.appendChild(createTreeNode(child, level + 1));
          }
        } else {
          const empty = document.createElement('div');
          empty.className = 'empty-state';
          empty.style.padding = '4px 24px';
          empty.textContent = '(空目录)';
          childrenContainer.appendChild(empty);
        }
        isLoaded = true;
      }
      childrenContainer.classList.remove('hidden');
    } else {
      childrenContainer.classList.add('hidden');
    }
    refreshZebraStripes();
  }

  // Click & Selection logic
  row.addEventListener('click', (e) => {
    updateFinderFooter(item);
    if (e.target === expander && item.isDirectory) {
      toggleFolder();
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      toggleItemSelection(item, row);
      if (!item.isDirectory && selectedItems.has(item.relPath)) {
        openPreview(item.relPath);
      }
    } else if (e.shiftKey && lastClickedRow) {
      selectRange(row);
      if (!item.isDirectory) {
        openPreview(item.relPath);
      }
    } else {
      // Plain single click
      if (item.isDirectory) {
        clearSelection();
        selectItem(item, row, false);
        toggleFolder();
      } else {
        clearSelection();
        selectItem(item, row, false);
        openPreview(item.relPath);
      }
    }
  });

  // Right-click: Open directly in Antigravity's native preview tab
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!item.isDirectory) {
      clearSelection();
      selectItem(item, row, false);
      openFileInNativeTab(item);
    } else {
      toggleFolder();
    }
  });

  // Double-click: Open in Antigravity's native preview tab
  row.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!item.isDirectory) {
      openFileInNativeTab(item);
    } else {
      toggleFolder();
    }
  });

  // Drag and Drop to Chat / Editor (Antigravity 2.25 plugin:// OOPIF Bridge)
  row.addEventListener('dragstart', (e) => {
    if (!selectedItems.has(item.relPath)) {
      clearSelection();
      selectItem(item, row, false);
    }

    const itemsToDrag = Array.from(selectedItems.values()).map(v => v.item);

    // Build standard file:/// URIs compatible with Antigravity 2.25's XB / UB parser
    const urisArray = itemsToDrag.map(it => {
      const full = it.fullPath || (currentRootPath ? `${currentRootPath}/${it.relPath}` : it.relPath);
      const normalized = full.replace(/\\/g, '/');
      const clean = normalized.replace(/^([a-zA-Z]):/, (m, d) => `${d.toLowerCase()}:`);
      return clean.startsWith('/') ? `file://${clean}` : `file:///${clean}`;
    });

    const plainPaths = itemsToDrag.map(it => {
      const full = it.fullPath || (currentRootPath ? `${currentRootPath}/${it.relPath}` : it.relPath);
      return full.replace(/\\/g, '/');
    });

    // Cancel Chromium's broken cross-scheme (plugin:// -> https://127.0.0.1) HTML5 drag
    // which immediately locks the cursor to 🚫, and hand off to the Parent-Frame Drag Bridge.
    e.preventDefault();

    const count = itemsToDrag.length;
    const label = count > 1
      ? `📦 ${count} files`
      : `${getFileIcon(item.ext, item.isDirectory)} ${item.name}`;

    row.classList.add('dragging');
    fetchApi('/api/ensure-drag-bridge', { method: 'POST', body: {} }).catch(() => {});

    try {
      window.parent.postMessage({
        type: 'WFT_DRAG_START',
        uris: urisArray,
        plainPaths,
        label,
        clientX: e.clientX,
        clientY: e.clientY
      }, '*');
    } catch (_) {}

    const onLocalMove = (ev) => {
      if ((ev.buttons & 1) === 0) {
        cleanupLocalDrag(ev);
        return;
      }
      try {
        window.parent.postMessage({
          type: 'WFT_DRAG_MOVE',
          clientX: ev.clientX,
          clientY: ev.clientY,
          shiftKey: ev.shiftKey
        }, '*');
      } catch (_) {}
    };

    const cleanupLocalDrag = (ev) => {
      window.removeEventListener('mousemove', onLocalMove, true);
      window.removeEventListener('mouseup', cleanupLocalDrag, true);
      row.classList.remove('dragging');
      if (ev) {
        try {
          window.parent.postMessage({
            type: 'WFT_DRAG_END',
            clientX: ev.clientX,
            clientY: ev.clientY,
            shiftKey: ev.shiftKey
          }, '*');
        } catch (_) {}
      }
    };

    window.addEventListener('mousemove', onLocalMove, true);
    window.addEventListener('mouseup', cleanupLocalDrag, true);
  });

  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
  });

  wrapper.appendChild(row);
  if (item.isDirectory) {
    wrapper.appendChild(childrenContainer);
  }

  return wrapper;
}

async function loadRootTree() {
  clearSelection();
  const container = $('tree-container');
  container.innerHTML = '<div class="loading-state">正在扫描项目目录...</div>';

  try {
    const data = await fetchApi('/api/tree', {
      method: 'POST',
      body: {
        dir: '',
        showHidden: showHiddenFiles,
        workspaceUri: currentWorkspaceUri,
        root: currentRootPath || undefined
      },
    });

    if (data.root) {
      currentRootPath = data.root;
      $('workspace-name').textContent = data.name || 'Workspace';
      $('workspace-path').textContent = data.root;
      $('workspace-info-box').title = `工作区路径: ${data.root}`;
    }

    if (data.error) {
      container.innerHTML = `<div class="empty-state" style="color:var(--danger-color);">${data.error}</div>`;
      return;
    }

    container.innerHTML = '';
    if (!data.items || data.items.length === 0) {
      container.innerHTML = '<div class="empty-state">当前工作区暂无文件</div>';
      return;
    }

    for (const item of data.items) {
      container.appendChild(createTreeNode(item, 0));
    }
    refreshZebraStripes();
    updateFinderFooter(null);
    if ($('finder-status-bar')) {
      $('finder-status-bar').textContent = `${data.items.length} 个项目`;
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state" style="color:var(--danger-color);">加载目录树失败: ${err.message}</div>`;
  }
}

// ---------------------------------------------------------------------------
// File Preview (Strategy Pattern Dispatcher) & Agent Action
// ---------------------------------------------------------------------------
async function openPreview(relPath) {
  activePreviewFile = relPath;
  const drawer = $('preview-drawer');
  const resizer = $('preview-resizer');
  const body = $('preview-body');
  const customActions = $('preview-custom-actions');
  const ext = (relPath.includes('.') ? '.' + relPath.split('.').pop() : '').toLowerCase();

  $('preview-title').textContent = relPath;
  $('preview-size').textContent = '加载中...';
  $('preview-icon').innerHTML = getFileIcon(ext, false);
  if (customActions) customActions.innerHTML = '';

  body.innerHTML = '<div class="loading-state" style="padding:16px;">正在读取文件内容...</div>';
  drawer.hidden = false;
  if (resizer) resizer.hidden = false;

  try {
    const data = await fetchApi('/api/file-content', {
      method: 'POST',
      body: { path: relPath },
    });

    if (activePreviewFile !== relPath) return;

    if (data.error) {
      $('preview-size').textContent = '';
      body.innerHTML = `<div class="empty-state" style="color:var(--danger-color);">${data.error}</div>`;
      return;
    }

    $('preview-size').textContent = formatSize(data.size);

    const context = {
      formatSize,
      getFileIcon,
      setSizeText: (txt) => { $('preview-size').textContent = txt; },
      setIcon: (ico) => {
        if (typeof ico === 'string' && ico.startsWith('<svg')) {
          $('preview-icon').innerHTML = ico;
        } else {
          $('preview-icon').innerHTML = getFileIcon(ext, false);
        }
      },
      actionsHost: customActions,
      reRender: () => {
        if (window.previewManager && activePreviewFile === relPath) {
          window.previewManager.render(body, data, context);
        }
      }
    };

    if (window.previewManager) {
      await window.previewManager.render(body, data, context);
    } else {
      body.innerHTML = `<pre class="preview-code-block"><code>${data.content || ''}</code></pre>`;
    }
  } catch (err) {
    if (activePreviewFile !== relPath) return;
    body.innerHTML = `<div class="empty-state" style="color:var(--danger-color);">预览失败: ${err.message}</div>`;
  }
}

let currentSelectedText = '';

function formatQuotedSnippet(relPath, selectedText) {
  const ext = (relPath.split('.').pop() || 'text').toLowerCase();
  return `Regarding \`${relPath}\`:\n\`\`\`${ext}\n${selectedText}\n\`\`\`\n`;
}

async function copySelectionToClipboard(relPath, selectedText) {
  const prompt = formatQuotedSnippet(relPath, selectedText);
  let copied = false;

  // 1. Try modern navigator.clipboard
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(prompt);
      copied = true;
    }
  } catch (err) {
    console.warn('navigator.clipboard.writeText failed:', err);
  }

  // 2. Try classic document.execCommand('copy')
  if (!copied) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = prompt;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      copied = document.execCommand('copy');
      document.body.removeChild(textarea);
    } catch (_) {}
  }

  // 3. Fallback to Sidecar native OS clipboard
  if (!copied && window.sidecar && window.sidecar.fetch) {
    try {
      const res = await window.sidecar.fetch('/api/copy-text-to-clipboard', {
        method: 'POST',
        body: JSON.stringify({ text: prompt })
      });
      const data = await res.json();
      if (data && (data.ok || data.success)) copied = true;
    } catch (_) {}
  }

  if (copied) {
    showToast('📋 已複製引用文字！請在下方對話輸入框按 Ctrl+V 貼上');
  } else {
    showToast('複製失敗: 無法存取剪貼簿');
  }
}

async function sendSelectionToAgent(relPath, selectedText, customMessage = '') {
  let prompt = formatQuotedSnippet(relPath, selectedText);
  if (customMessage) {
    prompt += `\n**使用者說明 / 提問**：\n${customMessage}\n`;
  }

  try {
    await navigator.clipboard.writeText(prompt);
  } catch (_) {}

  const agentObj = getSidecar()?.agent;
  if (!agentObj) {
    showToast('📋 引用內容已複製到剪貼簿（可直接在輸入框 Ctrl+V 貼上）！');
    return;
  }

  try {
    await agentObj.sendMessage(prompt);
    showToast(customMessage ? '💬 已將引用文字與提問送出至 Agent！' : '💬 已將引用文字送出至 Agent！');
  } catch (err) {
    showToast(`發送失敗: ${err.message}`);
  }
}

async function sendFilePathToAgent(relPath, customMessage = '') {
  let prompt = `Please examine the file: \`${relPath}\``;
  if (customMessage) {
    prompt += `\n\n**使用者說明 / 提問**：\n${customMessage}\n`;
  }

  try {
    await navigator.clipboard.writeText(prompt);
  } catch (_) {}

  const agentObj = getSidecar()?.agent;
  if (!agentObj) {
    showToast(`File path copied: ${relPath}`);
    return;
  }

  try {
    await agentObj.sendMessage(prompt);
    showToast(customMessage ? `💬 已將檔案與提問送出至 Agent！` : `Sent "${relPath}" to Agent chat!`);
  } catch (err) {
    showToast(`Could not send message: ${err.message}`);
  }
}

function setupTextSelectionQuote() {
  const previewBody = $('preview-body');
  const bubble = $('selection-quote-bubble');
  const btnQuoteCopy = $('btn-quote-copy');
  const btnQuoteSend = $('btn-quote-send');
  if (!previewBody || !bubble) return;

  function updateSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !activePreviewFile) {
      currentSelectedText = '';
      bubble.hidden = true;
      if ($('btn-send-agent')) {
        $('btn-send-agent').textContent = '💬 Ask';
        $('btn-send-agent').title = 'Send file path to Agent';
      }
      return;
    }

    const text = sel.toString().trim();
    const anchorNode = sel.anchorNode;
    if (!previewBody.contains(anchorNode) || text.length === 0) {
      currentSelectedText = '';
      bubble.hidden = true;
      if ($('btn-send-agent')) {
        $('btn-send-agent').textContent = '💬 Ask';
        $('btn-send-agent').title = 'Send file path to Agent';
      }
      return;
    }

    currentSelectedText = text;
    if ($('btn-send-agent')) {
      $('btn-send-agent').textContent = '📋 Quote Text';
      $('btn-send-agent').title = `Quote selected ${text.length} characters (Ctrl+V ready)`;
    }

    try {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const drawer = $('preview-drawer');
      const drawerRect = drawer.getBoundingClientRect();

      const bubbleWidth = bubble.offsetWidth || 240;
      let left = rect.left - drawerRect.left + (rect.width / 2) - (bubbleWidth / 2);
      left = Math.max(10, Math.min(drawerRect.width - bubbleWidth - 10, left));
      let top = rect.top - drawerRect.top - 42;
      if (top < 40) top = rect.bottom - drawerRect.top + 8;

      bubble.style.left = `${left}px`;
      bubble.style.top = `${top}px`;
      bubble.hidden = false;
    } catch (_) {
      bubble.hidden = true;
    }
  }

  document.addEventListener('selectionchange', () => {
    updateSelection();
  });

  previewBody.addEventListener('mouseup', () => {
    setTimeout(updateSelection, 15);
  });

  // Action 1: Copy quote snippet (Ctrl+V) without auto-sending
  btnQuoteCopy?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (currentSelectedText && activePreviewFile) {
      const textToQuote = currentSelectedText;
      const fileToQuote = activePreviewFile;
      bubble.hidden = true;
      currentSelectedText = '';
      window.getSelection()?.removeAllRanges();
      if ($('btn-send-agent')) {
        $('btn-send-agent').textContent = '💬 Ask';
      }
      await copySelectionToClipboard(fileToQuote, textToQuote);
    }
  });

  // Action 2: Direct send to Agent (with prompt input popover)
  btnQuoteSend?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentSelectedText && activePreviewFile) {
      const textToQuote = currentSelectedText;
      const fileToQuote = activePreviewFile;
      bubble.hidden = true;

      if (typeof window.openAskAgentPopover === 'function') {
        window.openAskAgentPopover({
          title: '💬 提問 Agent (選取文字引用)',
          placeholder: '請輸入想對此段文字/程式碼提出的問題（按 Enter 直接發送）...',
          onSubmit: async (customMessage) => {
            currentSelectedText = '';
            window.getSelection()?.removeAllRanges();
            if ($('btn-send-agent')) {
              $('btn-send-agent').textContent = '💬 Ask';
            }
            await sendSelectionToAgent(fileToQuote, textToQuote, customMessage);
          }
        });
      } else {
        currentSelectedText = '';
        window.getSelection()?.removeAllRanges();
        if ($('btn-send-agent')) {
          $('btn-send-agent').textContent = '💬 Ask';
        }
        sendSelectionToAgent(fileToQuote, textToQuote);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Search Filter
// ---------------------------------------------------------------------------
function handleSearch(filterText) {
  const query = filterText.trim().toLowerCase();
  $('btn-clear-search').hidden = !query;

  const nodes = document.querySelectorAll('.tree-node-wrapper');
  if (!query) {
    nodes.forEach(n => n.style.display = '');
    return;
  }

  nodes.forEach(node => {
    const name = node.dataset.name || '';
    const path = (node.dataset.path || '').toLowerCase();
    const isMatch = name.includes(query) || path.includes(query);

    if (isMatch) {
      node.style.display = '';
      let parent = node.parentElement;
      while (parent && parent.id !== 'tree-container') {
        if (parent.classList.contains('tree-children')) {
          parent.classList.remove('hidden');
          const row = parent.previousElementSibling;
          if (row) {
            row.querySelector('.tree-expander')?.classList.add('expanded');
          }
        }
        parent = parent.parentElement;
      }
    } else {
      const hasMatchingChild = node.querySelector(`.tree-node-wrapper[data-name*="${query}"]`);
      node.style.display = hasMatchingChild ? '' : 'none';
    }
  });
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
async function init() {
  const refreshWorkspace = async (forceReload = false) => {
    const uri = await resolveActiveWorkspaceUri();
    if (uri && (forceReload || uri !== currentWorkspaceUri)) {
      currentWorkspaceUri = uri;
      currentRootPath = '';
      await fetchApi('/api/workspace', {
        method: 'POST',
        body: { workspaceUri: currentWorkspaceUri }
      });
      loadRootTree();
    }
  };

  // Immediate initial workspace resolution
  await refreshWorkspace(true);
  if (!currentWorkspaceUri) {
    loadRootTree();
  }

  const s = getSidecar();
  if (s && typeof s.onWorkspaceChange === 'function') {
    s.onWorkspaceChange(async (newUris) => {
      if (newUris && newUris.length > 0 && newUris[0] !== currentWorkspaceUri) {
        currentWorkspaceUri = newUris[0];
        currentRootPath = '';
        await fetchApi('/api/workspace', {
          method: 'POST',
          body: { workspaceUri: currentWorkspaceUri }
        });
        showToast('Workspace switched');
        loadRootTree();
      }
    });
  }

  window.addEventListener('focus', () => refreshWorkspace(false));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshWorkspace(false);
    }
  });
  setTimeout(() => refreshWorkspace(false), 200);
  setTimeout(() => refreshWorkspace(false), 800);

  $('btn-reveal-root')?.addEventListener('click', () => {
    revealInFinder(currentRootPath || '');
  });

  $('btn-copy-mention')?.addEventListener('click', () => {
    if (activePreviewFile) {
      copyFileMention(activePreviewFile);
    }
  });

  $('btn-refresh').addEventListener('click', () => {
    showToast('正在刷新文件树...');
    loadRootTree();
  });

  $('btn-toggle-hidden').addEventListener('click', () => {
    showHiddenFiles = !showHiddenFiles;
    $('btn-toggle-hidden').classList.toggle('active', showHiddenFiles);
    showToast(showHiddenFiles ? '已显示点文件与隐藏目录' : '已隐藏点文件与忽略目录');
    loadRootTree();
  });

  const pathBar = $('path-input-bar');
  $('btn-change-path').addEventListener('click', () => {
    pathBar.hidden = !pathBar.hidden;
    if (!pathBar.hidden) {
      $('manual-path-input').value = currentRootPath || '';
      $('manual-path-input').focus();
    }
  });

  $('btn-cancel-path').addEventListener('click', () => {
    pathBar.hidden = true;
  });

  $('btn-apply-path').addEventListener('click', () => {
    const val = $('manual-path-input').value.trim();
    if (val) {
      currentRootPath = val;
      currentWorkspaceUri = null;
      pathBar.hidden = true;
      showToast(`Set root to: ${val}`);
      loadRootTree();
    }
  });

  $('manual-path-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('btn-apply-path').click();
    if (e.key === 'Escape') $('btn-cancel-path').click();
  });

  $('search-input').addEventListener('input', (e) => handleSearch(e.target.value));
  $('btn-clear-search').addEventListener('click', () => {
    $('search-input').value = '';
    handleSearch('');
  });

  function initResizer() {
    const resizer = $('preview-resizer');
    const drawer = $('preview-drawer');
    if (!resizer || !drawer) return;

    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    resizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      startY = e.clientY;
      startHeight = drawer.offsetHeight;
      resizer.classList.add('resizing');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'row-resize';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const dy = startY - e.clientY;
      const minH = 100;
      const maxH = window.innerHeight * 0.85;
      const newHeight = Math.max(minH, Math.min(maxH, startHeight + dy));
      drawer.style.height = `${newHeight}px`;
    });

    window.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        resizer.classList.remove('resizing');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
    });
  }

  $('btn-open-tab')?.addEventListener('click', () => {
    if (activePreviewFile) {
      openFileInNativeTab(activePreviewFile);
    }
  });

  $('btn-close-preview').addEventListener('click', closePreview);

  $('btn-send-agent').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!activePreviewFile) return;

    const textToQuote = currentSelectedText;
    const fileToQuote = activePreviewFile;
    const isQuoting = Boolean(textToQuote);

    if (typeof window.openAskAgentPopover === 'function') {
      window.openAskAgentPopover({
        title: isQuoting ? '💬 提問 Agent (選取文字引用)' : '💬 提問 Agent',
        placeholder: isQuoting
          ? '請輸入想對此段文字/程式碼提出的問題（按 Enter 直接發送，Shift+Enter 換行）...'
          : '請輸入想對此檔案提出的問題（按 Enter 直接發送，Shift+Enter 換行）...',
        onSubmit: async (customMessage) => {
          const bubble = $('selection-quote-bubble');
          if (bubble) bubble.hidden = true;
          currentSelectedText = '';
          window.getSelection()?.removeAllRanges();
          $('btn-send-agent').textContent = '💬 Ask';

          if (isQuoting) {
            await sendSelectionToAgent(fileToQuote, textToQuote, customMessage);
          } else {
            await sendFilePathToAgent(fileToQuote, customMessage);
          }
        }
      });
    } else {
      if (isQuoting) {
        const bubble = $('selection-quote-bubble');
        if (bubble) bubble.hidden = true;
        currentSelectedText = '';
        window.getSelection()?.removeAllRanges();
        $('btn-send-agent').textContent = '💬 Ask';
        sendSelectionToAgent(fileToQuote, textToQuote);
      } else {
        sendFilePathToAgent(fileToQuote);
      }
    }
  });

  $('tree-viewport').addEventListener('click', (e) => {
    if (e.target === $('tree-viewport') || e.target === $('tree-container')) {
      clearSelection();
    }
  });

  initResizer();

  // Tree-level keyboard shortcuts (Ctrl+C to copy @mentions)
  document.addEventListener('keydown', async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (selectedItems.size > 0) {
        e.preventDefault();
        const items = Array.from(selectedItems.values()).map(v => v.item);
        const textMentions = items.map(it => {
          const p = it.relPath.replace(/\\/g, '/');
          return p.includes(' ') ? `@"${p}"` : `@${p}`;
        }).join(' ');
        try {
          await navigator.clipboard.writeText(textMentions);
          showToast(`📋 已複製引用: ${textMentions}`);
        } catch (_) {
          try {
            await fetchApi('/api/copy-text-to-clipboard', {
              method: 'POST',
              body: { text: textMentions }
            });
            showToast(`📋 已複製引用: ${textMentions}`);
          } catch (err) {
            showToast(`複製失敗: ${err.message}`);
          }
        }
      }
    }
  });

  setupTextSelectionQuote();
  fetchApi('/api/ensure-drag-bridge', { method: 'POST', body: {} }).catch(() => {});
  loadRootTree();
}

init();
