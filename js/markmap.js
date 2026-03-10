/**
 * Markmap 渲染
 * 依赖: state.js
 */

/** 全局复用的 Transformer 实例 */
let _transformer = null;
function getTransformer() {
  if (!_transformer) {
    const { Transformer } = window.markmap;
    _transformer = new Transformer();
  }
  return _transformer;
}

/**
 * 当前流式状态标记，供 transition 补丁判断使用哪种缓动
 * 'idle' = 正常交互, 'streaming' = 流式生成中
 */
let _animationMode = 'idle';

/**
 * Monkey-patch markmap 实例的 transition() 方法，
 * 用更丝滑的缓动函数替代 d3 默认的 easeCubicInOut（后者在短时长下
 * 会产生"起步慢→加速→减速"的跳跃感）。
 *
 * - 流式期间（streaming）：easeLinear — 线性过渡在极短时长下最自然，
 *   多次叠加也不会抖动
 * - 正常交互（idle）：easeQuadOut — 快速启动、缓慢停止，
 *   感知上比 cubicInOut 流畅得多，没有"卡顿→弹跳"的感觉
 */
function _patchTransition(mm) {
  const origTransition = mm.transition.bind(mm);
  mm.transition = function (sel) {
    const t = origTransition(sel);
    // 根据当前模式选缓动
    if (_animationMode === 'streaming') {
      t.ease(d3.easeLinear);
    } else {
      t.ease(d3.easeQuadOut);
    }
    return t;
  };
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

  AppState.markmapInstance = Markmap.create(svgEl, {
    autoFit: true,
    duration: 300,       // 展开/折叠动画时长
    maxWidth: 300,
    paddingX: 16,
    initialExpandLevel: -1,
    zoom: true,
    pan: true,
  }, root);

  // 补丁：替换缓动函数
  _patchTransition(AppState.markmapInstance);

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

  // 等待浏览器完成布局后再 fit，用 rAF 双帧确保渲染完成
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (AppState.markmapInstance) AppState.markmapInstance.fit();
    });
  });
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
    return;
  }

  try {
    const transformer = getTransformer();
    const { root } = transformer.transform(markdown);

    if (!animate) {
      // 流式模式：线性缓动 + 较长时长 = 多个节点同时匀速滑入，连续流动感
      _animationMode = 'streaming';
      AppState.markmapInstance.setOptions({ duration: 400 });
    } else {
      _animationMode = 'idle';
    }

    AppState.markmapInstance.setData(root);

    // 流式期间也调 fit，线性缓动下视口平移是匀速的，不会跳动
    AppState.markmapInstance.fit();
  } catch (e) {
    renderMarkmap(markdown);
  }
}
