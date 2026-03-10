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

/** 下载矢量 PDF（通过浏览器打印功能，需用户选择 "另存为 PDF"） */
async function downloadPdf() {
  if (!AppState.currentMarkdown || !AppState.markmapInstance) return;
  switchTab('preview');
  try {
    const svgEl = $('markmapSvg');
    const filename = AppState.currentTopic || 'mindmap';
    showToast('即将打开打印对话框，请选择"另存为 PDF"即可导出矢量 PDF', 'info', 4000);
    PngExport.downloadPdf(svgEl, filename, {
      padding: 50,
      backgroundColor: '#ffffff',
    });
  } catch (error) {
    showError('导出 PDF 失败: ' + error.message);
  }
}
