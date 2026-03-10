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

/** 下载 JPEG 图片 */
async function downloadPng() {
  if (!AppState.currentMarkdown || !AppState.markmapInstance) return;
  switchTab('preview');
  try {
    const svgEl = $('markmapSvg');
    const filename = AppState.currentTopic || 'mindmap';
    await PngExport.download(svgEl, filename, {
      scale: 6,
      padding: 50,
      backgroundColor: '#ffffff',
      quality: 0.95,
    });
    showToast('JPEG 图片下载成功', 'success');
  } catch (error) {
    showError('导出图片失败: ' + error.message);
  }
}

/** 下载高清 PDF */
async function downloadPdf() {
  if (!AppState.currentMarkdown || !AppState.markmapInstance) return;
  switchTab('preview');
  try {
    const svgEl = $('markmapSvg');
    const filename = AppState.currentTopic || 'mindmap';
    showToast('正在生成 PDF...', 'info');
    await PngExport.downloadPdf(svgEl, filename, {
      scale: 6,
      padding: 50,
      backgroundColor: '#ffffff',
      quality: 0.95,
    });
    showToast('PDF 下载成功', 'success');
  } catch (error) {
    showError('导出 PDF 失败: ' + error.message);
  }
}
