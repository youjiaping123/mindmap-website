/**
 * 下载功能
 * 依赖: state.js, ui.js
 */

/** 下载 .xmind 文件 */
async function downloadXmind() {
  if (!AppState.currentMarkdown) return;
  try {
    const filename = AppState.currentTopic || 'mindmap';
    await XmindExport.download(AppState.currentMarkdown, filename);
  } catch (error) {
    showError('下载 .xmind 失败: ' + error.message);
  }
}

/** 下载 PNG 图片 */
async function downloadPng() {
  if (!AppState.currentMarkdown || !AppState.markmapInstance) return;
  switchTab('preview');
  try {
    const svgEl = $('markmapSvg');
    const filename = AppState.currentTopic || 'mindmap';
    await PngExport.download(svgEl, filename, {
      scale: 2,
      padding: 50,
      backgroundColor: '#ffffff',
    });
  } catch (error) {
    showError('导出 PNG 失败: ' + error.message);
  }
}
