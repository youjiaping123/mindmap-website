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
    duration: 500,
    maxWidth: 300,
    paddingX: 16,
    initialExpandLevel: -1,
  }, root);

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

  // 延迟 fit 确保渲染完成
  setTimeout(() => {
    if (AppState.markmapInstance) AppState.markmapInstance.fit();
  }, 300);
}

/**
 * 增量更新已有的 markmap（不销毁重建，只更新数据）
 * 用于流式生成时的高效实时刷新
 */
function updateMarkmap(markdown) {
  if (!AppState.markmapInstance) {
    renderMarkmap(markdown);
    return;
  }

  try {
    const transformer = getTransformer();
    const { root } = transformer.transform(markdown);
    AppState.markmapInstance.setData(root);
    AppState.markmapInstance.fit();
  } catch (e) {
    // fallback: 如果增量更新失败，重新创建
    renderMarkmap(markdown);
  }
}
