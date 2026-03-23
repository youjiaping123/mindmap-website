/**
 * 下载功能
 * 依赖: state.js, ui.js
 */

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let exportInProgress = false;

async function ensurePreviewReady() {
  switchTab('preview');
  await wait(160);
}

function setExportButtonsDisabled(disabled) {
  document.querySelectorAll('.export-btn').forEach((button) => {
    button.disabled = disabled;
  });
}

function getDeliveryStrategy(iOSStrategy) {
  const fileDelivery = typeof FileDelivery !== 'undefined' ? FileDelivery : null;
  const env = fileDelivery?.getEnvironment ? fileDelivery.getEnvironment() : { isIOSWebKit: false };
  return env.isIOSWebKit ? iOSStrategy : 'direct-download';
}

function beginDeliverySession(filename, mimeType, iOSStrategy) {
  const fileDelivery = typeof FileDelivery !== 'undefined' ? FileDelivery : null;
  if (!fileDelivery?.begin) {
    throw new Error('文件交付模块未加载，请刷新页面重试');
  }

  return fileDelivery.begin({
    filename,
    mimeType,
    strategy: getDeliveryStrategy(iOSStrategy),
  });
}

async function runExportWithDelivery({ filename, mimeType, iOSStrategy, task }) {
  if (exportInProgress) {
    showToast('正在准备导出文件，请稍候', 'info');
    return null;
  }

  let deliverySession = null;
  exportInProgress = true;
  setExportButtonsDisabled(true);

  try {
    deliverySession = beginDeliverySession(filename, mimeType, iOSStrategy);
    await ensurePreviewReady();
    return await task(deliverySession);
  } catch (error) {
    if (deliverySession?.fail) {
      deliverySession.fail(error.message);
    }
    throw error;
  } finally {
    exportInProgress = false;
    setExportButtonsDisabled(false);
  }
}

/** 下载 .xmind 文件 */
async function downloadXmind() {
  if (!AppState.currentMarkdown || !AppState.markmapInstance) return;
  const filename = AppState.currentTopic || 'mindmap';
  const outputFilename = `${filename}.xmind`;

  try {
    const svgEl = $('markmapSvg');
    const result = await runExportWithDelivery({
      filename: outputFilename,
      mimeType: 'application/vnd.xmind.workbook',
      iOSStrategy: 'share-page',
      task: (deliverySession) => XmindExport.download(AppState.currentMarkdown, filename, {
        svgElement: svgEl,
        deliverySession,
      }),
    });

    if (!result) return;

    if (result.deliveryMode === 'share-page') {
      if (result.shareSupported === false) {
        showToast('已打开保存页；当前环境可能不支持系统分享，请使用 HTTPS 或部署后重试', 'info', 7000);
      } else {
        showToast('已打开保存页，请点击“保存到文件 / 分享”', 'success', 5000);
      }
      return;
    }

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
  const outputFilename = `${filename}.jpg`;

  try {
    const svgEl = $('markmapSvg');
    const result = await runExportWithDelivery({
      filename: outputFilename,
      mimeType: 'image/jpeg',
      iOSStrategy: 'preview-page',
      task: (deliverySession) => PngExport.download(svgEl, filename, {
        ...BITMAP_EXPORT_OPTIONS,
        deliverySession,
      }),
    });

    if (!result) return;

    if (result.deliveryMode === 'preview-page') {
      showToast(`已打开 JPG 预览页，可用 Safari 分享/存储${getExportAdvice(result)}`, 'success', 5000);
      return;
    }

    showToast(`JPG 图片下载成功${getExportAdvice(result)}`, 'success');
  } catch (error) {
    showError('导出图片失败: ' + error.message);
  }
}

// 兼容旧按钮/历史调用名。
const downloadPng = downloadJpg;

/** 下载 PDF 文件 */
async function downloadPdf() {
  if (!AppState.currentMarkdown || !AppState.markmapInstance) return;
  const filename = AppState.currentTopic || 'mindmap';
  const outputFilename = `${filename}.pdf`;

  try {
    const svgEl = $('markmapSvg');
    showToast('正在生成高清 PDF...', 'info');
    const result = await runExportWithDelivery({
      filename: outputFilename,
      mimeType: 'application/pdf',
      iOSStrategy: 'preview-page',
      task: (deliverySession) => PngExport.downloadPdf(svgEl, filename, {
        ...BITMAP_EXPORT_OPTIONS,
        deliverySession,
      }),
    });

    if (!result) return;

    if (result.deliveryMode === 'preview-page') {
      showToast(`已打开 PDF 预览页，可用 Safari 分享/存储${getExportAdvice(result)}`, 'success', 5000);
      return;
    }

    showToast(`PDF 下载成功，已写入高分辨率 JPG${getExportAdvice(result)}`, 'success');
  } catch (error) {
    showError('导出 PDF 失败: ' + error.message);
  }
}

/** 下载 SVG 矢量图 */
async function downloadSvg() {
  if (!AppState.currentMarkdown || !AppState.markmapInstance) return;
  const filename = AppState.currentTopic || 'mindmap';
  const outputFilename = `${filename}.svg`;

  try {
    const svgEl = $('markmapSvg');
    const result = await runExportWithDelivery({
      filename: outputFilename,
      mimeType: 'image/svg+xml',
      iOSStrategy: 'preview-page',
      task: (deliverySession) => PngExport.downloadSvg(svgEl, filename, {
        padding: 50,
        backgroundColor: '#ffffff',
        deliverySession,
      }),
    });

    if (!result) return;

    if (result.deliveryMode === 'preview-page') {
      showToast('已打开 SVG 预览页，可用 Safari 分享/存储', 'success', 5000);
      return;
    }

    showToast('SVG 矢量图下载成功，可无限放大查看细节', 'success');
  } catch (error) {
    showError('导出图片失败: ' + error.message);
  }
}
