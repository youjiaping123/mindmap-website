/**
 * Markmap 渲染
 * 依赖: state.js
 */

/** 自定义颜色调色板 — 按层级着色 */
const MARKMAP_COLOR_PALETTE = [
  '#374151', // depth 0 (root) — 深灰
  '#3B82F6', // depth 1 — 蓝
  '#16A34A', // depth 2 — 绿
  '#F97316', // depth 3 — 橙
  '#9333EA', // depth 4 — 紫
  '#E11D48', // depth 5 — 玫红
  '#0891B2', // depth 6 — 青
];

const MARKMAP_DEFAULT_OPTIONS = {
  autoFit: true,
  duration: 300,
  maxWidth: 300,
  paddingX: 16,
  initialExpandLevel: -1,
  zoom: true,
  pan: true,
  color: _getNodeColor,
};

const MARKMAP_STREAMING_OPTIONS = {
  duration: 0,
};

/** 根据节点 depth 返回对应颜色 */
function _getNodeColor(node) {
  const depth = node.state ? node.state.depth : 0;
  if (depth === 0) return MARKMAP_COLOR_PALETTE[0];
  return MARKMAP_COLOR_PALETTE[((depth - 1) % (MARKMAP_COLOR_PALETTE.length - 1)) + 1];
}

/** 全局复用的 Transformer 实例 */
let _transformer = null;
function getTransformer() {
  if (!_transformer) {
    const { Transformer } = window.markmap;
    _transformer = new Transformer();
  }
  return _transformer;
}

let _streamFitTimer = null;
let _markmapUpdateQueue = Promise.resolve();

function _scheduleAfterLayout(callback) {
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
}

function requestMarkmapFit(delay = 0) {
  if (_streamFitTimer) {
    clearTimeout(_streamFitTimer);
    _streamFitTimer = null;
  }

  const runFit = () => {
    const mm = AppState.markmapInstance;
    if (!mm) return;
    _markmapUpdateQueue = _markmapUpdateQueue
      .catch(() => {})
      .then(async () => {
        if (AppState.markmapInstance === mm) {
          await mm.fit();
        }
      });
  };

  if (delay > 0) {
    _streamFitTimer = setTimeout(() => {
      _streamFitTimer = null;
      _scheduleAfterLayout(runFit);
    }, delay);
    return;
  }

  _scheduleAfterLayout(runFit);
}

/** 用 markmap 渲染 Markdown 为 SVG 思维导图（首次创建） */
function renderMarkmap(markdown) {
  const svgEl = $('markmapSvg');
  svgEl.innerHTML = '';

  const transformer = getTransformer();
  const { root, features } = transformer.transform(markdown);
  const assets = transformer.getUsedAssets(features);

  const { Markmap, loadCSS, loadJS } = window.markmap;
  if (assets.styles) loadCSS(assets.styles);
  if (assets.scripts) loadJS(assets.scripts, { getMarkmap: () => window.markmap });

  if (AppState.markmapInstance) {
    AppState.markmapInstance.destroy();
  }

  AppState.markmapInstance = Markmap.create(svgEl, MARKMAP_DEFAULT_OPTIONS, root);

  // 设置右键菜单
  _setupContextMenu(AppState.markmapInstance);

  // 添加缩放工具栏
  try {
    const { Toolbar } = window.markmap;
    if (Toolbar) {
      const oldToolbar = document.querySelector('.mm-toolbar');
      if (oldToolbar) oldToolbar.remove();
      const toolbar = Toolbar.create(AppState.markmapInstance);
      toolbar.el.classList.add('mm-toolbar');
      $('markmapContainer').appendChild(toolbar.el);
    }
  } catch (e) {
    console.log('Toolbar not available:', e.message);
  }

  requestMarkmapFit();
}

/**
 * 增量更新已有的 markmap（不销毁重建，只更新数据）
 * 用于流式生成时的高效实时刷新
 * @param {string} markdown - 新的 Markdown 内容
 * @param {boolean} animate - 是否启用完整动画
 */
function updateMarkmap(markdown, animate = true) {
  if (!AppState.markmapInstance) {
    renderMarkmap(markdown);
    return Promise.resolve();
  }

  _markmapUpdateQueue = _markmapUpdateQueue.catch(() => {}).then(async () => {
    try {
      const transformer = getTransformer();
      const { root } = transformer.transform(markdown);

      if (!animate) {
        // 流式期间关闭布局动画，只保留最终完成后的完整过渡。
        AppState.markmapInstance.setOptions(MARKMAP_STREAMING_OPTIONS);
      } else {
        AppState.markmapInstance.setOptions({ duration: MARKMAP_DEFAULT_OPTIONS.duration });
      }

      await AppState.markmapInstance.setData(root);

      if (!animate) {
        requestMarkmapFit(900);
      } else {
        requestMarkmapFit();
      }
    } catch (e) {
      renderMarkmap(markdown);
    }
  });

  return _markmapUpdateQueue;
}

function transitionMarkmapToMarkdown(markdown, {
  duration = 300,
  restoreDuration = duration,
  restoreDelay = 0,
  fit = true,
} = {}) {
  if (!AppState.markmapInstance) {
    renderMarkmap(markdown);
    return Promise.resolve();
  }

  _markmapUpdateQueue = _markmapUpdateQueue.catch(() => {}).then(async () => {
    AppState.markmapInstance.setOptions({ duration });

    const transformer = getTransformer();
    const { root } = transformer.transform(markdown);
    await AppState.markmapInstance.setData(root);

    if (fit) {
      requestMarkmapFit();
    }

    if (restoreDuration !== duration || restoreDelay > 0) {
      setTimeout(() => {
        if (AppState.markmapInstance) {
          AppState.markmapInstance.setOptions({ duration: restoreDuration });
        }
      }, restoreDelay);
    }
  });

  return _markmapUpdateQueue;
}

/* ===== 右键菜单 & 节点编辑 ===== */

/** 移除已有的右键菜单 */
function _removeContextMenu() {
  const existing = document.getElementById('node-context-menu');
  if (existing) existing.remove();
}

/**
 * 解析 markmap-lib 0.18 的 payload.lines 字段
 *
 * markmap-lib 0.18 输出: payload.lines = "0,1"（字符串，逗号分隔）
 * markmap-lib 0.15 输出: payload.lines = [0, 1]（数组）
 *
 * 返回 [start, end] 整数数组，end 是独占结束行（可直接用于 slice/filter）
 */
function _parseLines(lines) {
  if (!lines) return null;
  if (Array.isArray(lines)) {
    return [parseInt(lines[0], 10), parseInt(lines[1], 10)];
  }
  if (typeof lines === 'string') {
    const parts = lines.split(',');
    if (parts.length >= 2) return [parseInt(parts[0], 10), parseInt(parts[1], 10)];
  }
  return null;
}

/**
 * 解码 HTML 实体字符串（markmap-lib 0.18 的 content 字段是 HTML 编码）
 * 例如 "&#x795e;&#x7ecf;" → "神经"
 */
function _decodeHtml(html) {
  if (!html) return '';
  // 使用浏览器的 DOMParser 能力进行解码
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

/**
 * 从 D3 datum 中解析统一的节点信息（兼容 markmap 0.15 / 0.18）
 * 返回 { content, lineStart, lineEnd, nodeData } 或 null
 */
function _parseNodeDatum(d) {
  if (!d) return null;

  const payload = d.payload;            // 0.18: 直接在顶层
  if (payload?.lines != null) {
    const parsed = _parseLines(payload.lines);
    if (!parsed) return null;
    return {
      content: _decodeHtml(d.content || ''),
      lineStart: parsed[0],
      lineEnd: parsed[1],               // 独占结束行
      nodeData: d,
    };
  }

  // 0.15 风格: d.data.payload
  const payload15 = d.data?.payload;
  if (payload15?.lines != null) {
    const parsed = _parseLines(payload15.lines);
    if (!parsed) return null;
    return {
      content: _decodeHtml(d.data?.content || ''),
      lineStart: parsed[0],
      lineEnd: parsed[1],
      nodeData: d,
    };
  }
  return null;
}

/**
 * payload.lines 在 markmap 0.18 中已经包含整棵子树的行范围 [start, end)，
 * 因此直接用即可，无需递归遍历子节点
 */
function _getLinesRange(nodeData) {
  return _parseNodeDatum(nodeData);
}

/** 在 SVG 容器上绑定原生 contextmenu 事件（比 D3 .on() 更可靠） */
let _contextMenuClickHandler = null;
let _contextMenuSvgEl = null;
let _contextMenuSvgHandler = null;
let _contextMenuTouchCleanup = null;

function _bindTouchContextMenu(svgEl) {
  if (_contextMenuTouchCleanup) _contextMenuTouchCleanup();

  let pressTimer = null;
  let startX = 0;
  let startY = 0;
  let targetNode = null;
  const LONG_PRESS_MS = 420;
  const MOVE_THRESHOLD = 12;

  function clearTouchContextMenu() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    targetNode = null;
  }

  function onTouchStart(event) {
    if (event.touches.length !== 1) {
      clearTouchContextMenu();
      return;
    }

    const nodeEl = event.target.closest('g.markmap-node');
    if (!nodeEl) {
      clearTouchContextMenu();
      return;
    }

    clearTouchContextMenu();

    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    targetNode = nodeEl;
    pressTimer = window.setTimeout(() => {
      pressTimer = null;
      if (!targetNode) return;

      const parsed = _parseNodeDatum(d3.select(targetNode).datum());
      if (!parsed) return;

      _removeContextMenu();
      _createContextMenu({ clientX: startX, clientY: startY }, parsed);
    }, LONG_PRESS_MS);
  }

  function onTouchMove(event) {
    if (!pressTimer || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const moved = Math.hypot(touch.clientX - startX, touch.clientY - startY);
    if (moved > MOVE_THRESHOLD) clearTouchContextMenu();
  }

  svgEl.addEventListener('touchstart', onTouchStart, { passive: true });
  svgEl.addEventListener('touchmove', onTouchMove, { passive: true });
  svgEl.addEventListener('touchend', clearTouchContextMenu, { passive: true });
  svgEl.addEventListener('touchcancel', clearTouchContextMenu, { passive: true });

  _contextMenuTouchCleanup = () => {
    clearTouchContextMenu();
    svgEl.removeEventListener('touchstart', onTouchStart);
    svgEl.removeEventListener('touchmove', onTouchMove);
    svgEl.removeEventListener('touchend', clearTouchContextMenu);
    svgEl.removeEventListener('touchcancel', clearTouchContextMenu);
  };
}

function _setupContextMenu(mm) {
  const svgEl = mm.svg.node ? mm.svg.node() : mm.svg;

  // document click handler 只注册一次，防止多次 renderMarkmap 时叠加
  if (!_contextMenuClickHandler) {
    _contextMenuClickHandler = (e) => {
      if (!e.target.closest('#node-context-menu')) {
        _removeContextMenu();
      }
    };
    document.addEventListener('click', _contextMenuClickHandler);
  }

  if (_contextMenuSvgEl && _contextMenuSvgHandler) {
    _contextMenuSvgEl.removeEventListener('contextmenu', _contextMenuSvgHandler);
  }

  // 右键事件绑定到 SVG DOM 元素（原生事件，比 D3 .on() 更可靠）
  _contextMenuSvgHandler = (event) => {
    event.preventDefault();
    event.stopPropagation();
    _removeContextMenu();

    const nodeEl = event.target.closest('g.markmap-node');
    if (!nodeEl) return;

    const d = d3.select(nodeEl).datum();
    const parsed = _parseNodeDatum(d);
    if (!parsed) {
      console.warn('[contextmenu] cannot parse node datum:', d);
      return;
    }

    _createContextMenu(event, parsed);
  };

  svgEl.addEventListener('contextmenu', _contextMenuSvgHandler);
  _contextMenuSvgEl = svgEl;
  _bindTouchContextMenu(svgEl);
}

/** 创建并显示右键菜单 */
function _createContextMenu(event, parsed) {
  const { content, lineStart, nodeData } = parsed;
  // position:fixed 需要 clientX/Y（视口坐标），pageX/Y 会在有滚动时偏移
  const { clientX, clientY } = event;

  const mdLines = AppState.currentMarkdown.split('\n');
  if (lineStart === undefined || mdLines[lineStart] === undefined) {
    console.error('[contextmenu] invalid lineStart:', lineStart);
    return;
  }
  const fullLine = mdLines[lineStart];

  const menu = document.createElement('div');
  menu.id = 'node-context-menu';
  menu.className = 'markmap-context-menu';
  menu.addEventListener('contextmenu', (e) => e.preventDefault());

  // 编辑节点
  const editItem = document.createElement('div');
  editItem.className = 'context-menu-item';
  editItem.innerHTML = '✏️ 编辑节点';
  editItem.onclick = (e) => {
    e.stopPropagation();
    _removeContextMenu();
    // 提取行前缀（# / ## / - 等），保留层级
    const match = fullLine.match(/^(\s*(?:#+\s*|-\s*|\d+\.\s*))/);
    const prefix = match ? match[0] : '';
    // content 已经过 HTML 解码，直接使用
    _openNodeEditModal(content || fullLine.slice(prefix.length), lineStart, prefix);
  };
  menu.appendChild(editItem);

  // 删除节点
  const deleteItem = document.createElement('div');
  deleteItem.className = 'context-menu-item danger';
  deleteItem.innerHTML = '🗑️ 删除节点';
  deleteItem.onclick = (e) => {
    e.stopPropagation();
    _removeContextMenu();
    _deleteNode(parsed);
  };
  menu.appendChild(deleteItem);

  document.body.appendChild(menu);

  // 防止菜单溢出屏幕
  const menuW = menu.offsetWidth;
  const menuH = menu.offsetHeight;
  const left = (clientX + menuW > window.innerWidth)  ? window.innerWidth  - menuW - 5 : clientX;
  const top  = (clientY + menuH > window.innerHeight) ? window.innerHeight - menuH - 5 : clientY;
  menu.style.left = `${left}px`;
  menu.style.top  = `${top}px`;
}

/** 当前正在编辑的节点上下文 */
let _editingNodeCtx = null;

/** 打开节点编辑弹窗 */
function _openNodeEditModal(originalText, lineIndex, prefix) {
  _editingNodeCtx = { lineIndex, prefix };
  const input = $('nodeEditInput');
  input.value = originalText;
  $('nodeEditModal').style.display = 'flex';
  input.focus();
  input.select();
}

/** 关闭节点编辑弹窗 */
function closeNodeEditModal() {
  _editingNodeCtx = null;
  $('nodeEditModal').style.display = 'none';
}

/** 保存节点编辑 */
function saveNodeEdit() {
  if (!_editingNodeCtx) return;

  const newText = $('nodeEditInput').value;
  const { lineIndex, prefix } = _editingNodeCtx;
  const lines = AppState.currentMarkdown.split('\n');

  if (lines[lineIndex] !== undefined) {
    lines[lineIndex] = prefix + newText;
    AppState.currentMarkdown = lines.join('\n');
  }

  if (typeof syncCurrentMarkdownToActiveVersion === 'function') {
    syncCurrentMarkdownToActiveVersion();
  }

  updateMarkmap(AppState.currentMarkdown);
  $('markdownContent').textContent = AppState.currentMarkdown;
  closeNodeEditModal();
  showToast('节点已更新', 'success');
}

/** 删除节点及其所有子节点
 *  markmap 0.18 的 payload.lines = "start,end" 已包含整棵子树范围，直接删除即可
 */
function _deleteNode(parsed) {
  if (!parsed) return;
  const { lineStart, lineEnd } = parsed;
  if (lineStart == null || lineEnd == null) {
    showToast('无法定位节点行号', 'error');
    return;
  }

  const lines = AppState.currentMarkdown.split('\n');
  // lineEnd 是独占结束行，删除 [lineStart, lineEnd)
  const newLines = lines.filter((_, i) => i < lineStart || i >= lineEnd);
  AppState.currentMarkdown = newLines.join('\n');

  if (typeof syncCurrentMarkdownToActiveVersion === 'function') {
    syncCurrentMarkdownToActiveVersion();
  }

  updateMarkmap(AppState.currentMarkdown);
  $('markdownContent').textContent = AppState.currentMarkdown;
  showToast('节点已删除', 'success');
}
