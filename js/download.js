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
    showToast('Xmind 文件下载成功', 'success');
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
      scale: 4,
      padding: 50,
      backgroundColor: '#ffffff',
    });
    showToast('PNG 图片下载成功', 'success');
  } catch (error) {
    showError('导出 PNG 失败: ' + error.message);
  }
}

/** 下载 SVG 矢量图 */
function downloadSvg() {
  if (!AppState.currentMarkdown || !AppState.markmapInstance) return;
  switchTab('preview');
  try {
    const svgEl = $('markmapSvg');
    const filename = AppState.currentTopic || 'mindmap';
    PngExport.downloadSvg(svgEl, filename, {
      padding: 50,
      backgroundColor: '#ffffff',
    });
    showToast('SVG 矢量图下载成功', 'success');
  } catch (error) {
    showError('导出 SVG 失败: ' + error.message);
  }
}
