/**
 * 下载功能
 * 依赖: state.js, ui.js, export-bridge.js
 */

let _exportBusy = false;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensurePreviewReady() {
  switchTab('preview');
  await wait(160);
}

function setExportButtonsBusy(busy) {
  document.querySelectorAll('.export-btn').forEach((button) => {
    button.disabled = busy;
  });
}

function getExportAdvice(result) {
  if (!result?.limited) return '';
  return '；导图过大时浏览器会限制位图尺寸，若需要无限放大细节，建议改用 SVG';
}

function getBitmapSuccessMessage(label, deliveryMode, result) {
  const advice = getExportAdvice(result);
  if (deliveryMode === 'preview') {
    return `${label} 已打开预览页，可用 Safari 分享或存储${advice}`;
  }
  return `${label} 下载成功${advice}`;
}

function getPdfSuccessMessage(deliveryMode, result) {
  const advice = getExportAdvice(result);
  if (deliveryMode === 'preview') {
    return `PDF 已打开预览页，可用 Safari 分享或存储${advice}`;
  }
  return `PDF 下载成功，已写入高分辨率 JPG${advice}`;
}

function getXmindSuccessMessage(deliveryMode) {
  if (deliveryMode === 'share-page') {
    return 'XMind 导出页已打开，可保存到文件或分享';
  }
  if (deliveryMode === 'link-page') {
    return 'XMind 导出页已打开，可点按或长按链接保存';
  }
  return 'XMind 文件下载成功';
}

async function runExport({
  filename,
  mimeType,
  startMessage = '',
  task,
  successMessage,
  errorPrefix,
}) {
  if (_exportBusy) {
    showToast('导出进行中，请稍候', 'info');
    return null;
  }

  _exportBusy = true;
  setExportButtonsBusy(true);

  let session = null;

  try {
    session = ExportBridge.begin({ filename, mimeType });
    await ensurePreviewReady();

    if (startMessage) {
      showToast(startMessage, 'info');
    }

    const result = await task();
    const delivery = await session.deliver(result.blob);
    const message = typeof successMessage === 'function'
      ? successMessage(delivery.deliveryMode, result)
      : successMessage;

    if (message) {
      showToast(message, 'success');
    }

    return result;
  } catch (error) {
    if (session) session.fail(error.message);
    showError(`${errorPrefix}${error.message}`);
    return null;
  } finally {
    _exportBusy = false;
    setExportButtonsBusy(false);
  }
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

/** 下载 .xmind 文件 */
async function downloadXmind() {
  if (!AppState.currentMarkdown || !AppState.markmapInstance) return;

  const basename = AppState.currentTopic || 'mindmap';
  const filename = `${basename}.xmind`;
  const svgEl = $('markmapSvg');

  await runExport({
    filename,
    mimeType: 'application/vnd.xmind.workbook',
    task: () => XmindExport.exportFile(AppState.currentMarkdown, basename, {
      svgElement: svgEl,
    }),
    successMessage: getXmindSuccessMessage,
    errorPrefix: '下载 .xmind 失败: ',
  });
}

/** 下载 JPG 图片 */
async function downloadJpg() {
  if (!AppState.currentMarkdown || !AppState.markmapInstance) return;

  const basename = AppState.currentTopic || 'mindmap';
  const filename = `${basename}.jpg`;
  const svgEl = $('markmapSvg');

  await runExport({
    filename,
    mimeType: 'image/jpeg',
    task: () => PngExport.exportJpg(svgEl, basename, {
      ...BITMAP_EXPORT_OPTIONS,
    }),
    successMessage: (deliveryMode, result) => getBitmapSuccessMessage('JPG 图片', deliveryMode, result),
    errorPrefix: '导出图片失败: ',
  });
}

/** 下载 PDF 文件 */
async function downloadPdf() {
  if (!AppState.currentMarkdown || !AppState.markmapInstance) return;

  const basename = AppState.currentTopic || 'mindmap';
  const filename = `${basename}.pdf`;
  const svgEl = $('markmapSvg');

  await runExport({
    filename,
    mimeType: 'application/pdf',
    startMessage: '正在生成高清 PDF...',
    task: () => PngExport.exportPdf(svgEl, basename, {
      ...BITMAP_EXPORT_OPTIONS,
    }),
    successMessage: getPdfSuccessMessage,
    errorPrefix: '导出 PDF 失败: ',
  });
}

/** 下载 SVG 矢量图 */
async function downloadSvg() {
  if (!AppState.currentMarkdown || !AppState.markmapInstance) return;

  const basename = AppState.currentTopic || 'mindmap';
  const filename = `${basename}.svg`;
  const svgEl = $('markmapSvg');

  await runExport({
    filename,
    mimeType: 'image/svg+xml',
    task: () => PngExport.exportSvg(svgEl, basename, {
      padding: 50,
      backgroundColor: '#ffffff',
    }),
    successMessage: (deliveryMode) => (
      deliveryMode === 'preview'
        ? 'SVG 已打开预览页，可无限放大后再分享或存储'
        : 'SVG 矢量图下载成功，可无限放大查看细节'
    ),
    errorPrefix: '导出图片失败: ',
  });
}
