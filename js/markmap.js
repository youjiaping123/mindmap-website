/**
 * Markmap 渲染
 * 依赖: state.js
 */

/** 用 markmap 渲染 Markdown 为 SVG 思维导图 */
function renderMarkmap(markdown) {
  const svgEl = $('markmapSvg');
  svgEl.innerHTML = '';

  const { Transformer } = window.markmap;
  const transformer = new Transformer();
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
