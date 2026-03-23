/**
 * 下载功能
 * 采用 aimap.html 同款直接下载思路：
 * 生成 Blob -> createObjectURL -> <a download> -> click()
 */

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function resolveExportTopic() {
  const markdown = String(AppState.currentMarkdown || '').trim();
  const lines = markdown.split('\n');

  for (const line of lines) {
    const match = line.match(/^#\s+(.+)/);
    if (match) {
      const topic = match[1].replace(/[^\w\u4e00-\u9fa5]/g, '').trim();
      if (topic) return topic;
    }
  }

  const currentTopic = String(AppState.currentTopic || '').replace(/[^\w\u4e00-\u9fa5]/g, '').trim();
  return currentTopic || 'mindmap';
}

function generateExportFileName(extension) {
  const topic = resolveExportTopic();
  const now = new Date();
  const dateStr = now.getFullYear().toString()
    + String(now.getMonth() + 1).padStart(2, '0')
    + String(now.getDate()).padStart(2, '0')
    + String(now.getHours()).padStart(2, '0')
    + String(now.getMinutes()).padStart(2, '0')
    + String(now.getSeconds()).padStart(2, '0');

  return `${topic}_${dateStr}.${extension}`;
}

function getExportSvgElement() {
  return $('markmapSvg');
}

async function ensureExportReady() {
  const previewPanel = $('previewPanel');
  if (!previewPanel) {
    throw new Error('预览区域不存在');
  }

  if (getComputedStyle(previewPanel).display === 'none') {
    switchTab('preview');
    await wait(180);
  }

  const svgEl = getExportSvgElement();
  if (!svgEl) {
    throw new Error('找不到思维导图，无法导出');
  }

  const markmap = AppState.markmapInstance;
  if (markmap && typeof markmap.fit === 'function') {
    markmap.fit();
    await wait(120);
  }

  const hasContent = !!svgEl.querySelector('g');
  if (!hasContent) {
    throw new Error('思维导图尚未完成渲染，请稍后再试');
  }

  return svgEl;
}

function setButtonLoading(button, loading, text) {
  if (!button) return () => {};

  const originalHtml = button.dataset.originalHtml || button.innerHTML;
  if (!button.dataset.originalHtml) {
    button.dataset.originalHtml = originalHtml;
  }

  if (loading) {
    button.disabled = true;
    button.textContent = text;
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.originalHtml || originalHtml;
  }

  return () => {
    button.disabled = false;
    button.innerHTML = button.dataset.originalHtml || originalHtml;
  };
}

async function exportWithDirectDownload({
  buttonSelector,
  loadingText,
  task,
  successMessage,
  errorPrefix,
}) {
  const button = document.querySelector(buttonSelector);
  if (button?.disabled) return;

  const restore = setButtonLoading(button, true, loadingText);

  try {
    const result = await task();
    downloadBlob(result.blob, result.filename);
    if (successMessage) {
      showToast(successMessage, 'success');
    }
    return result;
  } catch (error) {
    showError(`${errorPrefix}${error.message}`);
    return null;
  } finally {
    restore();
  }
}

async function downloadXmind() {
  if (!String(AppState.currentMarkdown || '').trim()) {
    showError('请先生成一个思维导图，再导出 XMind');
    return;
  }

  await exportWithDirectDownload({
    buttonSelector: '.xmind-btn',
    loadingText: '导出中...',
    task: async () => {
      let svgEl = null;
      try {
        svgEl = await ensureExportReady();
      } catch {
        svgEl = null;
      }

      const filename = generateExportFileName('xmind');
      const blob = await XmindExport.markdownToXmindBlob(AppState.currentMarkdown, {
        svgElement: svgEl,
      });

      return {
        blob,
        filename,
      };
    },
    successMessage: 'XMind 文件下载成功',
    errorPrefix: '下载 .xmind 失败: ',
  });
}

async function downloadJpg() {
  await exportWithDirectDownload({
    buttonSelector: '.jpg-btn',
    loadingText: '导出中...',
    task: async () => {
      const svgEl = await ensureExportReady();
      const result = await PngExport.exportJpg(svgEl, resolveExportTopic(), {
        scale: 3,
        padding: 40,
        backgroundColor: '#ffffff',
        quality: 0.9,
        adaptiveScale: false,
      });

      return {
        blob: result.blob,
        filename: generateExportFileName('jpg'),
      };
    },
    successMessage: 'JPG 图片下载成功',
    errorPrefix: '导出图片失败: ',
  });
}

async function downloadPdf() {
  await exportWithDirectDownload({
    buttonSelector: '.pdf-btn',
    loadingText: '导出中...',
    task: async () => {
      const svgEl = await ensureExportReady();
      const result = await PngExport.exportPdf(svgEl, resolveExportTopic(), {
        scale: 3,
        padding: 40,
        backgroundColor: '#ffffff',
        quality: 0.9,
        adaptiveScale: false,
      });

      return {
        blob: result.blob,
        filename: generateExportFileName('pdf'),
      };
    },
    successMessage: 'PDF 下载成功',
    errorPrefix: '导出 PDF 失败: ',
  });
}

async function downloadSvg() {
  await exportWithDirectDownload({
    buttonSelector: '.svg-btn',
    loadingText: '导出中...',
    task: async () => {
      const svgEl = await ensureExportReady();
      const result = await PngExport.exportSvg(svgEl, resolveExportTopic(), {
        padding: 40,
        backgroundColor: '#ffffff',
      });

      return {
        blob: result.blob,
        filename: generateExportFileName('svg'),
      };
    },
    successMessage: 'SVG 矢量图下载成功',
    errorPrefix: '导出图片失败: ',
  });
}
