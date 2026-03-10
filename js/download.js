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
      scale: 8,
      padding: 50,
      backgroundColor: '#ffffff',
    });
    showToast('PNG 图片下载成功', 'success');
  } catch (error) {
    showError('导出 PNG 失败: ' + error.message);
  }
}

/** 下载高清 PDF（矢量，无限放大不模糊） */
async function downloadPdf() {
  if (!AppState.currentMarkdown || !AppState.markmapInstance) return;
  switchTab('preview');
  try {
    const svgEl = $('markmapSvg');
    const filename = AppState.currentTopic || 'mindmap';
    showToast('正在生成高清 PDF...', 'info');
    await PngExport.downloadPdf(svgEl, filename, {
      padding: 50,
      backgroundColor: '#ffffff',
    });
    showToast('高清 PDF 下载成功', 'success');
  } catch (error) {
    showError('导出 PDF 失败: ' + error.message);
  }
}
