/**
 * 导出模块
 *
 * 提供 JPG、SVG 导出：
 * - JPG: 高兼容位图，适合普通分享
 * - SVG: 矢量图，适合大图和后续编辑
 */

const PngExport = (() => {
  const EXPORT_LIMITS = {
    maxCanvasDimension: 16384,
    maxCanvasArea: 120000000,
  };

  function mergeBounds(base, rect) {
    if (!rect) return base;
    if (!base) return { ...rect };

    const x = Math.min(base.x, rect.x);
    const y = Math.min(base.y, rect.y);
    const right = Math.max(base.x + base.width, rect.x + rect.width);
    const bottom = Math.max(base.y + base.height, rect.y + rect.height);

    return {
      x,
      y,
      width: right - x,
      height: bottom - y,
    };
  }

  function toValidBounds(rect) {
    if (!rect) return null;
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) {
      return null;
    }
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  }

  function getLabelElement(foreignObject) {
    return foreignObject.querySelector('div div') || foreignObject.querySelector('div');
  }

  function getLabelClientRect(labelEl) {
    const range = document.createRange();
    range.selectNodeContents(labelEl);
    const rangeRect = range.getBoundingClientRect();

    if (rangeRect.width > 0 && rangeRect.height > 0) {
      return rangeRect;
    }

    return labelEl.getBoundingClientRect();
  }

  function screenRectToSvgRect(svgElement, clientRect) {
    const validClientRect = toValidBounds(clientRect);
    const screenCTM = svgElement.getScreenCTM();

    if (!validClientRect || !screenCTM) {
      return null;
    }

    const left = clientRect.left ?? validClientRect.x;
    const top = clientRect.top ?? validClientRect.y;
    const right = clientRect.right ?? (validClientRect.x + validClientRect.width);
    const bottom = clientRect.bottom ?? (validClientRect.y + validClientRect.height);
    const inverse = screenCTM.inverse();
    const corners = [
      new DOMPoint(left, top),
      new DOMPoint(right, top),
      new DOMPoint(left, bottom),
      new DOMPoint(right, bottom),
    ].map((point) => point.matrixTransform(inverse));
    const xs = corners.map((point) => point.x);
    const ys = corners.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const svgRight = Math.max(...xs);
    const svgBottom = Math.max(...ys);

    return toValidBounds({
      x,
      y,
      width: svgRight - x,
      height: svgBottom - y,
    });
  }

  function extractTextLayers(svgElement) {
    return Array.from(svgElement.querySelectorAll('foreignObject')).map((fo) => {
      const labelEl = getLabelElement(fo);

      if (!labelEl) return null;

      const clientRect = getLabelClientRect(labelEl);
      const svgRect = screenRectToSvgRect(svgElement, clientRect);
      const style = window.getComputedStyle(labelEl);
      const fontSizePx = parseFloat(style.fontSize) || 16;
      const parsedLineHeight = parseFloat(style.lineHeight);
      const lineHeightPx = Number.isFinite(parsedLineHeight) ? parsedLineHeight : fontSizePx * 1.2;
      const widthScale = clientRect.width > 0 ? svgRect?.width / clientRect.width : 1;
      const heightScale = clientRect.height > 0 ? svgRect?.height / clientRect.height : widthScale;
      const text = (labelEl.innerText || labelEl.textContent || '').replace(/\r/g, '').trim();

      if (!svgRect || !text) return null;

      return {
        text,
        x: svgRect.x,
        y: svgRect.y,
        width: svgRect.width,
        height: svgRect.height,
        fontSize: fontSizePx * heightScale,
        lineHeight: lineHeightPx * heightScale,
      };
    }).filter(Boolean);
  }

  function getExportBox(svgElement, padding = 40, textLayers = null) {
    const bbox = toValidBounds(svgElement.getBBox());
    const layers = Array.isArray(textLayers) ? textLayers : extractTextLayers(svgElement);
    const contentBounds = layers.reduce((bounds, layer) => mergeBounds(bounds, {
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
    }), bbox);

    if (!contentBounds) {
      throw new Error('思维导图尚未完成渲染，请稍后再试');
    }

    return {
      x: contentBounds.x - padding,
      y: contentBounds.y - padding,
      width: contentBounds.width + padding * 2,
      height: contentBounds.height + padding * 2,
    };
  }

  function getSafeScale(width, height, requestedScale, options = {}) {
    const maxCanvasDimension = options.maxCanvasDimension || EXPORT_LIMITS.maxCanvasDimension;
    const maxCanvasArea = options.maxCanvasArea || EXPORT_LIMITS.maxCanvasArea;
    const minScale = Number.isFinite(options.minScale) ? options.minScale : 1;
    const maxOutputDimension = Number.isFinite(options.maxOutputDimension)
      ? options.maxOutputDimension
      : null;
    const maxOutputArea = Number.isFinite(options.maxOutputArea)
      ? options.maxOutputArea
      : null;

    let scaleByDimension = Math.min(
      maxCanvasDimension / width,
      maxCanvasDimension / height,
    );
    let scaleByArea = Math.sqrt(maxCanvasArea / (width * height));

    if (maxOutputDimension) {
      scaleByDimension = Math.min(
        scaleByDimension,
        maxOutputDimension / width,
        maxOutputDimension / height,
      );
    }

    if (maxOutputArea) {
      scaleByArea = Math.min(
        scaleByArea,
        Math.sqrt(maxOutputArea / (width * height)),
      );
    }

    const constrainedScale = Math.min(requestedScale, scaleByDimension, scaleByArea);
    const floorScale = Math.min(minScale, scaleByDimension, scaleByArea);
    const safeScale = Math.max(floorScale, constrainedScale);
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
          if (value && value !== '' && value !== 'normal') {
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

    const exportBox = getExportBox(svgElement, padding, options.textLayers);
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

  async function download(svgElement, filename, options = {}) {
    const result = await svgToImageBlob(svgElement, {
      ...options,
      mimeType: 'image/jpeg',
    });

    triggerDownload(result.blob, `${filename}.jpg`);
    return result;
  }

  async function downloadSvg(svgElement, filename, options = {}) {
    const { svgString } = createStandaloneSvgString(svgElement, options);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    triggerDownload(blob, `${filename}.svg`);
    return { blob };
  }

  return {
    download,
    downloadSvg,
    svgToImageBlob,
  };
})();
