/**
 * 导出模块
 *
 * 提供 PNG、SVG、PDF 导出：
 * - PNG: 无损位图，适合普通分享
 * - SVG: 矢量图，适合大图和后续编辑
 * - PDF: 基于 PNG 的高保真单页 PDF
 */

const PngExport = (() => {
  const EXPORT_LIMITS = {
    maxCanvasDimension: 16384,
    maxCanvasArea: 120000000,
  };

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

  function createStandaloneSvgString(svgElement, options = {}) {
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

    const serializer = new XMLSerializer();
    return {
      svgString: serializer.serializeToString(clonedSvg),
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

    const { svgString, exportBox } = createStandaloneSvgString(svgElement, {
      padding,
      backgroundColor,
    });
    const { actualScale, limited, requestedScale } = getSafeScale(exportBox.width, exportBox.height, scale, options);
    const outputWidth = Math.max(1, Math.round(exportBox.width * actualScale));
    const outputHeight = Math.max(1, Math.round(exportBox.height * actualScale));

    const rasterizedSvg = createStandaloneSvgString(svgElement, {
      padding,
      backgroundColor,
      width: outputWidth,
      height: outputHeight,
    });

    const blob = await svgStringToImageBlob(
      rasterizedSvg.svgString,
      outputWidth,
      outputHeight,
      { mimeType, quality, backgroundColor },
    );

    return {
      blob,
      svgString,
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

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('读取导出文件失败'));
      reader.readAsDataURL(blob);
    });
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
    if (typeof window.jspdf === 'undefined') {
      throw new Error('PDF 导出库未加载，请刷新页面重试');
    }

    const {
      padding = 40,
      backgroundColor = '#ffffff',
      quality = 0.98,
      scale = 4,
    } = options;

    const result = await svgToImageBlob(svgElement, {
      scale,
      padding,
      backgroundColor,
      quality,
      mimeType: 'image/png',
    });

    const imgDataUrl = await blobToDataUrl(result.blob);
    const PX_TO_MM = 0.264583;
    const pdfWidth = Math.max(10, result.exportBox.width * PX_TO_MM);
    const pdfHeight = Math.max(10, result.exportBox.height * PX_TO_MM);
    const orientation = pdfWidth > pdfHeight ? 'landscape' : 'portrait';

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation,
      unit: 'mm',
      format: [pdfWidth, pdfHeight],
      compress: true,
    });

    doc.addImage(imgDataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
    doc.save(`${filename}.pdf`);

    return result;
  }

  return {
    download,
    downloadPdf,
    downloadSvg,
    svgToImageBlob,
  };
})();
