/**
 * 下载功能
 * 参考 aimap.html：所有格式先走同一套 SVG 导出数据，再按需转换。
 */

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, label) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}超时，请重试`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function isAppleMobileLike() {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = Number(navigator.maxTouchPoints || 0);

  return /iPhone|iPad|iPod/i.test(ua)
    || (/Mac/i.test(platform) && maxTouchPoints > 1);
}


async function tryShareBlob(blob, fileName) {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return { shared: false, cancelled: false };
  }

  if (typeof File !== 'function') {
    return { shared: false, cancelled: false };
  }

  const file = new File([blob], fileName, {
    type: blob?.type || 'application/octet-stream',
  });
  const shareData = {
    files: [file],
    title: fileName,
  };

  if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
    return { shared: false, cancelled: false };
  }

  try {
    await navigator.share(shareData);
    return { shared: true, cancelled: false };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { shared: false, cancelled: true };
    }

    return { shared: false, cancelled: false };
  }
}

async function downloadBlob(blob, fileName) {
  const isMobile = isAppleMobileLike();
  const blobType = blob?.type || '';

  // iOS Safari: 仅对 PDF 优先使用 Share API，给用户 "存储到文件" 的入口
  // 其他二进制文件（如 .xmind）使用普通的下载机制
  const preferShareOrPreview = isMobile && /^application\/pdf\b/i.test(blobType);

  if (preferShareOrPreview) {
    const shareResult = await tryShareBlob(blob, fileName);
    if (shareResult.shared || shareResult.cancelled) {
      return {
        delivered: shareResult.shared,
        cancelled: shareResult.cancelled,
        method: 'share',
      };
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.rel = 'noopener';
  // 仅 PDF 使用预览模式（target=_blank），其他二进制文件用 download 属性
  const isPdfPreview = isMobile && /^application\/pdf\b/i.test(blobType);
  if (isPdfPreview) {
    link.target = '_blank';
  } else {
    link.download = fileName;
  }
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // iOS Safari 等浏览器在点击后可能异步打开 blob 预览，立即 revoke 会导致后续“存储到文件”失效。
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);

  return {
    delivered: true,
    cancelled: false,
    method: isPdfPreview ? 'preview' : 'download',
  };
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

async function ensureExportReady() {
  const previewPanel = $('previewPanel');
  if (!previewPanel) {
    throw new Error('预览区域不存在');
  }

  if (getComputedStyle(previewPanel).display === 'none') {
    switchTab('preview');
    await wait(180);
  }

  const svgEl = $('markmapSvg');
  if (!svgEl) {
    throw new Error('找不到思维导图，无法导出');
  }

  const markmap = AppState.markmapInstance;
  if (markmap && typeof markmap.fit === 'function') {
    requestMarkmapFit();
    await wait(120);
  }

  const rootGroup = svgEl.querySelector('g');
  if (!rootGroup) {
    throw new Error('思维导图尚未完成渲染，请稍后再试');
  }

  return svgEl;
}

function getMindmapCssRules() {
  let cssText = '';
  const relevantSelectors = ['.markmap', '#markmapSvg', 'text', 'path', 'line', 'circle', 'foreignObject'];

  for (const styleSheet of document.styleSheets) {
    try {
      if (!styleSheet.cssRules) continue;

      for (const rule of styleSheet.cssRules) {
        if (relevantSelectors.some((selector) => rule.selectorText?.includes(selector))) {
          cssText += rule.cssText;
        }
      }
    } catch {}
  }

  return cssText;
}

function createAimapStyleExportData(svgElement) {
  const mainGroup = svgElement.querySelector('g');
  if (!mainGroup) throw new Error('找不到思维导图，无法导出');

  const bbox = mainGroup.getBBox();
  if (!Number.isFinite(bbox.width) || !Number.isFinite(bbox.height) || bbox.width <= 0 || bbox.height <= 0) {
    throw new Error('思维导图尚未完成渲染，请稍后再试');
  }

  const svgClone = svgElement.cloneNode(true);
  svgClone.removeAttribute('style');
  svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svgClone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  svgClone.setAttribute('width', String(bbox.width));
  svgClone.setAttribute('height', String(bbox.height));
  svgClone.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);

  const groupInClone = svgClone.querySelector('g');
  if (groupInClone) {
    groupInClone.removeAttribute('transform');
  }

  const style = document.createElement('style');
  style.textContent = getMindmapCssRules();
  svgClone.insertBefore(style, svgClone.firstChild);

  const serializer = new XMLSerializer();
  let svgString = serializer.serializeToString(svgClone);
  svgString = svgString
    .replace(/(\w+)?:?xlink=/g, 'xmlns:xlink=')
    .replace(/NS\d+:href/g, 'xlink:href');

  return {
    svgString,
    width: Math.max(1, Math.round(bbox.width)),
    height: Math.max(1, Math.round(bbox.height)),
  };
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('加载导出图像失败'));
    image.src = dataUrl;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const done = (fn) => (value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    const rejectOnce = done(reject);
    const resolveOnce = done(resolve);

    const fallbackTimer = setTimeout(() => {
      try {
        const dataUrl = canvas.toDataURL(type, quality);
        const [meta, data] = dataUrl.split(',');
        const mime = (meta.match(/data:(.*?);base64/) || [])[1] || type;
        const binary = atob(data || '');
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        resolveOnce(new Blob([bytes], { type: mime }));
      } catch {
        rejectOnce(new Error('导出图片失败'));
      }
    }, 3000);

    try {
      canvas.toBlob((blob) => {
        clearTimeout(fallbackTimer);
        if (blob) resolveOnce(blob);
        else rejectOnce(new Error('导出图片失败'));
      }, type, quality);
    } catch (error) {
      clearTimeout(fallbackTimer);
      rejectOnce(error instanceof Error ? error : new Error('导出图片失败'));
    }
  });
}

async function createPngBlobFromExportData(exportData, options = {}) {
  const margin = Number.isFinite(options.margin) ? options.margin : 20;
  const scale = Number.isFinite(options.scale) ? options.scale : 3;
  const quality = Number.isFinite(options.quality) ? options.quality : 0.92;
  const mimeType = options.mimeType || 'image/png';

  const canvas = document.createElement('canvas');
  canvas.width = (exportData.width + margin * 2) * scale;
  canvas.height = (exportData.height + margin * 2) * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持 Canvas 导出');

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(exportData.svgString)))}`;
  const img = await withTimeout(loadImageFromDataUrl(dataUrl), 12000, '渲染图片');
  if (typeof img.decode === 'function') {
    await withTimeout(img.decode(), 12000, '渲染图片');
  }

  ctx.drawImage(
    img,
    margin * scale,
    margin * scale,
    exportData.width * scale,
    exportData.height * scale,
  );

  return withTimeout(canvasToBlob(canvas, mimeType, quality), 12000, '生成图片');
}

async function exportWithDirectDownload({ buttonSelector, task, successMessage, errorPrefix }) {
  const button = document.querySelector(buttonSelector);
  if (button?.disabled) return;
  const restore = setButtonLoading(button, true, '导出中...');

  try {
    const result = await task();
    const delivery = await downloadBlob(result.blob, result.filename);

    if (delivery?.cancelled) {
      return;
    }

    if (delivery?.method === 'preview') {
      showToast('已打开预览页，请使用系统菜单“存储到文件”或“下载”保存 PDF', 'info', 5000);
      return;
    }

    if (delivery?.method === 'share') {
      showToast(successMessage || '文件已通过系统分享保存', 'success');
      return;
    }

    if (successMessage) showToast(successMessage, 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(`${errorPrefix}${message}`);
  } finally {
    restore();
  }
}

async function downloadSvg() {
  await exportWithDirectDownload({
    buttonSelector: '.svg-btn',
    task: async () => {
      const svgEl = await ensureExportReady();
      const exportData = createAimapStyleExportData(svgEl);
      const blob = new Blob([exportData.svgString], { type: 'image/svg+xml;charset=utf-8' });
      return { blob, filename: generateExportFileName('svg') };
    },
    successMessage: 'SVG 矢量图下载成功',
    errorPrefix: '导出 SVG 失败: ',
  });
}

async function downloadJpg() {
  await exportWithDirectDownload({
    buttonSelector: '.jpg-btn',
    task: async () => {
      const svgEl = await ensureExportReady();
      const exportData = createAimapStyleExportData(svgEl);
      const blob = await createPngBlobFromExportData(exportData, {
        mimeType: 'image/jpeg',
        quality: 0.9,
        scale: 3,
      });
      return { blob, filename: generateExportFileName('jpg') };
    },
    successMessage: 'JPG 图片下载成功',
    errorPrefix: '导出 JPG 失败: ',
  });
}

async function downloadPdf() {
  await exportWithDirectDownload({
    buttonSelector: '.pdf-btn',
    task: async () => {
      if (typeof window.jspdf === 'undefined') {
        throw new Error('PDF 导出库未加载，请刷新页面重试');
      }

      const svgEl = await ensureExportReady();
      const exportData = createAimapStyleExportData(svgEl);
      const jpgBlob = await createPngBlobFromExportData(exportData, {
        mimeType: 'image/jpeg',
        quality: 0.9,
        scale: 3,
      });

      const imageDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('图片编码失败'));
        };
        reader.onerror = () => reject(new Error('图片编码失败'));
        reader.readAsDataURL(jpgBlob);
      });

      const { jsPDF } = window.jspdf;
      const PX_TO_PT = 72 / 96;
      const pdfWidth = Math.max(10, exportData.width * PX_TO_PT);
      const pdfHeight = Math.max(10, exportData.height * PX_TO_PT);
      const orientation = pdfWidth > pdfHeight ? 'landscape' : 'portrait';
      const doc = new jsPDF({
        orientation,
        unit: 'pt',
        format: [pdfWidth, pdfHeight],
        compress: true,
      });

      doc.addImage(imageDataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'NONE');
      const blob = doc.output('blob');
      return { blob, filename: generateExportFileName('pdf') };
    },
    successMessage: 'PDF 下载成功',
    errorPrefix: '导出 PDF 失败: ',
  });
}

async function downloadXmind() {
  if (!String(AppState.currentMarkdown || '').trim()) {
    showError('请先生成一个思维导图，再导出 XMind');
    return;
  }

  await exportWithDirectDownload({
    buttonSelector: '.xmind-btn',
    task: async () => {
      const svgEl = await ensureExportReady();
      const blob = await withTimeout(
        XmindExport.markdownToXmindBlob(AppState.currentMarkdown, {
          svgElement: svgEl,
        }),
        15000,
        '生成 XMind',
      );
      return { blob, filename: generateExportFileName('xmind') };
    },
    successMessage: 'XMind 文件下载成功',
    errorPrefix: '下载 XMind 失败: ',
  });
}
