/**
 * 下载功能
 * 依赖: state.js, ui.js
 */

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensurePreviewReady() {
  switchTab('preview');
  await wait(160);
}

/** 下载 .xmind 文件 */
async function downloadXmind() {
  if (!AppState.currentMarkdown || !AppState.markmapInstance) return;
  const filename = AppState.currentTopic || 'mindmap';

  try {
    await ensurePreviewReady();
    const svgEl = $('markmapSvg');
    await XmindExport.download(AppState.currentMarkdown, filename, {
      svgElement: svgEl,
    });
    showToast('Xmind 文件下载成功', 'success');
  } catch (error) {
    showError('下载 .xmind 失败: ' + error.message);
  }
}

function getExportAdvice(result) {
  if (!result?.limited) return '';
  return '；导图过大时浏览器会限制位图尺寸，若需要无限放大细节，建议改用 SVG';
}

const BITMAP_EXPORT_OPTIONS = {
  scale: 4,
  padding: 50,
  backgroundColor: '#ffffff',
  quality: 0.86,
  adaptiveScale: true,
  targetPixels: 30000000,
  adaptiveMinScale: 3.0,
  adaptiveMaxScale: 4.5,
};

/** 下载 JPG 图片 */
async function downloadJpg() {
  if (!AppState.currentMarkdown || !AppState.markmapInstance) return;
  const filename = AppState.currentTopic || 'mindmap';

  try {
    await ensurePreviewReady();
    const svgEl = $('markmapSvg');
    const result = await PngExport.download(svgEl, filename, {
      ...BITMAP_EXPORT_OPTIONS,
    });
    showToast(`JPG 图片下载成功${getExportAdvice(result)}`, 'success');
  } catch (error) {
    showError('导出图片失败: ' + error.message);
  }
}

/** 下载 PDF 文件 */
async function downloadPdf() {
  if (!AppState.currentMarkdown || !AppState.markmapInstance) return;
  const filename = AppState.currentTopic || 'mindmap';

  try {
    await ensurePreviewReady();
    const svgEl = $('markmapSvg');
    showToast('正在生成高清 PDF...', 'info');
    const result = await PngExport.downloadPdf(svgEl, filename, {
      ...BITMAP_EXPORT_OPTIONS,
    });
    showToast(`PDF 下载成功，已写入高分辨率 JPG${getExportAdvice(result)}`, 'success');
  } catch (error) {
    showError('导出 PDF 失败: ' + error.message);
  }
}

/** 下载 SVG 矢量图 */
async function downloadSvg() {
  if (!AppState.currentMarkdown || !AppState.markmapInstance) return;
  const filename = AppState.currentTopic || 'mindmap';

  try {
    await ensurePreviewReady();
    const svgEl = $('markmapSvg');
    await PngExport.downloadSvg(svgEl, filename, {
      padding: 50,
      backgroundColor: '#ffffff',
    });
    showToast('SVG 矢量图下载成功，可无限放大查看细节', 'success');
  } catch (error) {
    showError('导出图片失败: ' + error.message);
  }
}
