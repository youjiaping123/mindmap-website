/**
 * 导出模块
 *
 * 提供 PNG、SVG、PDF 导出：
 * - PNG: 无损位图，适合普通分享
 * - SVG: 矢量图，适合大图和后续编辑
 * - PDF: 真矢量 PDF，中文文字通过 pdf-lib 嵌入开源字体
 */

const PngExport = (() => {
  const EXPORT_LIMITS = {
    maxCanvasDimension: 16384,
    maxCanvasArea: 120000000,
  };

  const VECTOR_PDF_FONT = {
    normalUrl: 'assets/fonts/LXGWWenKaiLite-Regular.ttf',
    boldUrl: 'assets/fonts/LXGWWenKaiLite-Medium.ttf',
  };

  const fontBytesCache = new Map();

  function getExportBox(svgElement, padding = 40) {
    const bbox = svgElement.getBBox();
    const width = bbox.width + padding * 2;
    const height = bbox.height + padding * 2;

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error('思维导图尚未完成渲染，请稍后再试');
    }

    return {
      x: bbox.x - padding,
      y: bbox.y - padding,
      width,
      height,
    };
  }

  function getSafeScale(width, height, requestedScale, options = {}) {
    const maxCanvasDimension = options.maxCanvasDimension || EXPORT_LIMITS.maxCanvasDimension;
    const maxCanvasArea = options.maxCanvasArea || EXPORT_LIMITS.maxCanvasArea;

    const scaleByDimension = Math.min(
      maxCanvasDimension / width,
      maxCanvasDimension / height,
    );
    const scaleByArea = Math.sqrt(maxCanvasArea / (width * height));

    const safeScale = Math.max(1, Math.min(requestedScale, scaleByDimension, scaleByArea));
    const actualScale = Math.round(safeScale * 100) / 100;

    return {
      requestedScale,
      actualScale,
      limited: actualScale + 0.01 < requestedScale,
    };
  }

  function inlineStyles(original, clone) {
    const originalChildren = original.children;
    const cloneChildren = clone.children;

    for (let i = 0; i < originalChildren.length && i < cloneChildren.length; i++) {
      const origChild = originalChildren[i];
      const cloneChild = cloneChildren[i];

      if (origChild instanceof Element) {
        const computedStyle = window.getComputedStyle(origChild);
        const importantProps = [
          'fill', 'fill-opacity',
          'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
          'stroke-linecap', 'stroke-linejoin',
          'opacity', 'visibility', 'display',
          'font-family', 'font-size', 'font-weight', 'font-style',
          'text-anchor', 'dominant-baseline', 'text-decoration',
          'letter-spacing', 'word-spacing', 'paint-order',
          'shape-rendering', 'vector-effect', 'color',
        ];

        for (const prop of importantProps) {
          const value = computedStyle.getPropertyValue(prop);
          if (value && value !== '' && value !== 'normal' && value !== 'none') {
            cloneChild.style.setProperty(prop, value);
          }
        }

        inlineStyles(origChild, cloneChild);
      }
    }
  }

  function createStandaloneSvgElement(svgElement, options = {}) {
    const {
      padding = 40,
      backgroundColor = '#ffffff',
      width,
      height,
    } = options;

    const exportBox = getExportBox(svgElement, padding);
    const clonedSvg = svgElement.cloneNode(true);

    inlineStyles(svgElement, clonedSvg);

    clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clonedSvg.setAttribute('viewBox', `${exportBox.x} ${exportBox.y} ${exportBox.width} ${exportBox.height}`);
    clonedSvg.setAttribute('width', width || exportBox.width);
    clonedSvg.setAttribute('height', height || exportBox.height);
    clonedSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    if (backgroundColor) {
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('x', exportBox.x);
      bgRect.setAttribute('y', exportBox.y);
      bgRect.setAttribute('width', exportBox.width);
      bgRect.setAttribute('height', exportBox.height);
      bgRect.setAttribute('fill', backgroundColor);
      clonedSvg.insertBefore(bgRect, clonedSvg.firstChild);
    }

    return {
      svgNode: clonedSvg,
      exportBox,
    };
  }

  function createStandaloneSvgString(svgElement, options = {}) {
    const { svgNode, exportBox } = createStandaloneSvgElement(svgElement, options);
    const serializer = new XMLSerializer();

    return {
      svgString: serializer.serializeToString(svgNode),
      exportBox,
    };
  }

  async function svgStringToImageBlob(svgString, width, height, options = {}) {
    const {
      mimeType = 'image/png',
      quality = 0.95,
      backgroundColor = '#ffffff',
    } = options;

    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(svgUrl);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('浏览器不支持 Canvas 导出'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('导出图片失败'));
          }
        }, mimeType, quality);
      };

      img.onerror = () => {
        URL.revokeObjectURL(svgUrl);
        reject(new Error('SVG 渲染失败'));
      };

      img.src = svgUrl;
    });
  }

  async function svgToImageBlob(svgElement, options = {}) {
    const {
      scale = 4,
      padding = 40,
      backgroundColor = '#ffffff',
      quality = 0.95,
      mimeType = 'image/png',
    } = options;

    const { exportBox } = createStandaloneSvgString(svgElement, {
      padding,
      backgroundColor,
    });
    const { actualScale, limited, requestedScale } = getSafeScale(exportBox.width, exportBox.height, scale, options);
    const outputWidth = Math.max(1, Math.round(exportBox.width * actualScale));
    const outputHeight = Math.max(1, Math.round(exportBox.height * actualScale));

    const { svgString } = createStandaloneSvgString(svgElement, {
      padding,
      backgroundColor,
      width: outputWidth,
      height: outputHeight,
    });

    const blob = await svgStringToImageBlob(
      svgString,
      outputWidth,
      outputHeight,
      { mimeType, quality, backgroundColor },
    );

    return {
      blob,
      exportBox,
      outputWidth,
      outputHeight,
      requestedScale,
      actualScale,
      limited,
    };
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function parseColor(colorString) {
    if (!colorString) return [0, 0, 0];

    const rgbMatch = colorString.match(/rgba?\(([^)]+)\)/i);
    if (rgbMatch) {
      return rgbMatch[1].split(',').slice(0, 3).map((part) => parseFloat(part.trim()) || 0);
    }

    const hex = colorString.trim().replace('#', '');
    if (hex.length === 3) {
      return hex.split('').map((ch) => parseInt(ch + ch, 16));
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }

    return [0, 0, 0];
  }

  async function loadFontBytes(url) {
    if (!fontBytesCache.has(url)) {
      const promise = fetch(url)
        .then((response) => {
          if (!response.ok) {
            throw new Error('中文字体资源加载失败');
          }
          return response.arrayBuffer();
        });
      fontBytesCache.set(url, promise);
    }

    return fontBytesCache.get(url);
  }

  function mountHiddenSvg(svgNode) {
    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '-100000px';
    host.style.top = '0';
    host.style.width = '0';
    host.style.height = '0';
    host.style.opacity = '0';
    host.style.pointerEvents = 'none';
    host.style.overflow = 'hidden';
    host.appendChild(svgNode);
    document.body.appendChild(host);
    return host;
  }

  function stripNonGeometryNodes(svgNode) {
    svgNode.querySelectorAll('foreignObject').forEach((node) => node.remove());
    svgNode.querySelectorAll('style').forEach((node) => node.remove());
  }

  function extractTextLayers(svgElement, exportBox) {
    return Array.from(svgElement.querySelectorAll('foreignObject')).map((fo) => {
      const bbox = fo.getBBox();
      const ctm = fo.getCTM();
      const labelEl = fo.querySelector('div div') || fo.querySelector('div');

      if (!ctm || !labelEl) return null;

      const scaleX = Math.hypot(ctm.a, ctm.b) || 1;
      const scaleY = Math.hypot(ctm.c, ctm.d) || scaleX;
      const topLeft = new DOMPoint(bbox.x, bbox.y).matrixTransform(ctm);
      const style = window.getComputedStyle(labelEl);
      const fontSizePx = parseFloat(style.fontSize) || 16;
      const lineHeightPx = parseFloat(style.lineHeight) || fontSizePx * 1.2;

      return {
        text: (labelEl.textContent || '').trim(),
        x: topLeft.x - exportBox.x,
        y: topLeft.y - exportBox.y,
        width: bbox.width * scaleX,
        height: bbox.height * scaleY,
        fontSize: fontSizePx * scaleY,
        lineHeight: lineHeightPx * scaleY,
        fontStyle: parseInt(style.fontWeight, 10) >= 600 ? 'bold' : 'normal',
        color: parseColor(style.color),
      };
    }).filter((item) => item && item.text);
  }

  async function createGeometryPdfBytes(svgElement, options = {}) {
    if (typeof window.jspdf === 'undefined') {
      throw new Error('几何 PDF 导出库未加载，请刷新页面重试');
    }

    const { jsPDF } = window.jspdf;
    if (typeof jsPDF?.API?.svg !== 'function') {
      throw new Error('SVG 转 PDF 库未加载，请刷新页面重试');
    }

    const { svgNode, exportBox } = createStandaloneSvgElement(svgElement, options);
    stripNonGeometryNodes(svgNode);

    const PX_TO_PT = 72 / 96;
    const pdfWidth = Math.max(10, exportBox.width * PX_TO_PT);
    const pdfHeight = Math.max(10, exportBox.height * PX_TO_PT);
    const orientation = pdfWidth > pdfHeight ? 'landscape' : 'portrait';

    const doc = new jsPDF({
      orientation,
      unit: 'pt',
      format: [pdfWidth, pdfHeight],
      compress: true,
      putOnlyUsedFonts: true,
    });

    const mountPoint = mountHiddenSvg(svgNode);

    try {
      await doc.svg(svgNode, {
        x: 0,
        y: 0,
        width: pdfWidth,
        height: pdfHeight,
      });
    } finally {
      mountPoint.remove();
    }

    return {
      exportBox,
      pdfBytes: doc.output('arraybuffer'),
    };
  }

  async function download(svgElement, filename, options = {}) {
    const result = await svgToImageBlob(svgElement, {
      ...options,
      mimeType: 'image/png',
    });

    triggerDownload(result.blob, `${filename}.png`);
    return result;
  }

  async function downloadSvg(svgElement, filename, options = {}) {
    const { svgString } = createStandaloneSvgString(svgElement, options);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    triggerDownload(blob, `${filename}.svg`);
    return { blob };
  }

  async function downloadPdf(svgElement, filename, options = {}) {
    if (typeof window.PDFLib === 'undefined' || typeof window.fontkit === 'undefined') {
      throw new Error('PDF 字体嵌入库未加载，请刷新页面重试');
    }

    const { PDFDocument, rgb } = window.PDFLib;
    const {
      padding = 40,
      backgroundColor = '#ffffff',
    } = options;

    const exportBox = getExportBox(svgElement, padding);
    const textLayers = extractTextLayers(svgElement, exportBox);
    const { pdfBytes: geometryPdfBytes } = await createGeometryPdfBytes(svgElement, {
      padding,
      backgroundColor,
    });

    const pdfDoc = await PDFDocument.load(geometryPdfBytes);
    pdfDoc.registerFontkit(window.fontkit);

    const [normalFontBytes, boldFontBytes] = await Promise.all([
      loadFontBytes(VECTOR_PDF_FONT.normalUrl),
      loadFontBytes(VECTOR_PDF_FONT.boldUrl),
    ]);
    const normalFont = await pdfDoc.embedFont(normalFontBytes, { subset: true });
    const boldFont = await pdfDoc.embedFont(boldFontBytes, { subset: true });
    const page = pdfDoc.getPages()[0];
    const pageHeight = page.getHeight();
    const PX_TO_PT = 72 / 96;

    textLayers.forEach((layer) => {
      const font = layer.fontStyle === 'bold' ? boldFont : normalFont;
      const fontSizePt = Math.max(6, layer.fontSize * PX_TO_PT);
      const lineHeightPt = Math.max(fontSizePt, layer.lineHeight * PX_TO_PT);
      const textTopPt = (layer.y + Math.max((layer.height - layer.lineHeight) / 2, 0)) * PX_TO_PT;
      const pdfY = pageHeight - textTopPt - fontSizePt;

      page.drawText(layer.text, {
        x: layer.x * PX_TO_PT,
        y: pdfY,
        size: fontSizePt,
        lineHeight: lineHeightPt,
        font,
        color: rgb(layer.color[0] / 255, layer.color[1] / 255, layer.color[2] / 255),
      });
    });

    const finalPdfBytes = await pdfDoc.save();
    const blob = new Blob([finalPdfBytes], { type: 'application/pdf' });
    triggerDownload(blob, `${filename}.pdf`);

    return {
      vector: true,
      exportBox,
      textLayerCount: textLayers.length,
      embeddedFonts: 2,
    };
  }

  return {
    download,
    downloadPdf,
    downloadSvg,
    svgToImageBlob,
  };
})();
