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
  try {
    await ensurePreviewReady();
    const filename = AppState.currentTopic || 'mindmap';
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

/** 下载 JPG 图片 */
async function downloadJpg() {
  if (!AppState.currentMarkdown || !AppState.markmapInstance) return;
  try {
    await ensurePreviewReady();
    const svgEl = $('markmapSvg');
    const filename = AppState.currentTopic || 'mindmap';
    const result = await PngExport.download(svgEl, filename, {
      scale: 4,
      padding: 50,
      backgroundColor: '#ffffff',
    });
    showToast(`JPG 图片下载成功${getExportAdvice(result)}`, 'success');
  } catch (error) {
    showError('导出图片失败: ' + error.message);
  }
}

// 兼容旧按钮/历史调用名。
const downloadPng = downloadJpg;

/** 下载 SVG 矢量图 */
async function downloadSvg() {
  if (!AppState.currentMarkdown || !AppState.markmapInstance) return;
  try {
    await ensurePreviewReady();
    const svgEl = $('markmapSvg');
    const filename = AppState.currentTopic || 'mindmap';
    await PngExport.downloadSvg(svgEl, filename, {
      padding: 50,
      backgroundColor: '#ffffff',
    });
    showToast('SVG 矢量图下载成功，可无限放大查看细节', 'success');
  } catch (error) {
    showError('导出图片失败: ' + error.message);
  }
}
