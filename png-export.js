/**
 * 图片导出模块
 *
 * 将 SVG 思维导图导出为 PNG 图片或 SVG 矢量图
 */

const PngExport = (() => {

  /**
   * 将 SVG 元素导出为 PNG Blob
   * @param {SVGElement} svgElement - SVG DOM 元素
   * @param {object} options - 选项
   * @returns {Promise<Blob>}
   */
  async function svgToPngBlob(svgElement, options = {}) {
    const {
      scale = 4,     // 4x 分辨率，高清导出
      padding = 40,  // 四周留白
      backgroundColor = '#ffffff',
    } = options;

    // 克隆 SVG 以避免修改原始元素
    const clonedSvg = svgElement.cloneNode(true);

    // 获取实际内容的边界框
    const bbox = svgElement.getBBox();

    const width = bbox.width + padding * 2;
    const height = bbox.height + padding * 2;

    // 设置 viewBox 使内容居中
    clonedSvg.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`);
    clonedSvg.setAttribute('width', width * scale);
    clonedSvg.setAttribute('height', height * scale);

    // 内联所有计算样式
    inlineStyles(svgElement, clonedSvg);

    // 添加白色背景矩形
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', bbox.x - padding);
    bgRect.setAttribute('y', bbox.y - padding);
    bgRect.setAttribute('width', width);
    bgRect.setAttribute('height', height);
    bgRect.setAttribute('fill', backgroundColor);
    clonedSvg.insertBefore(bgRect, clonedSvg.firstChild);

    // SVG → Data URL
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clonedSvg);
    const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);

    // Data URL → Canvas → PNG Blob
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');

        // 白色背景
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 绘制 SVG
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(blob => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create PNG'));
          }
        }, 'image/png');
      };
      img.onerror = () => reject(new Error('Failed to load SVG'));
      img.src = svgDataUrl;
    });
  }

  /**
   * 将 SVG 元素导出为独立的 SVG Blob（矢量图，无限缩放不模糊）
   * @param {SVGElement} svgElement - SVG DOM 元素
   * @param {object} options - 选项
   * @returns {Blob}
   */
  function svgToSvgBlob(svgElement, options = {}) {
    const {
      padding = 40,
      backgroundColor = '#ffffff',
    } = options;

    const clonedSvg = svgElement.cloneNode(true);
    const bbox = svgElement.getBBox();

    const width = bbox.width + padding * 2;
    const height = bbox.height + padding * 2;

    // 设置 viewBox 和尺寸
    clonedSvg.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`);
    clonedSvg.setAttribute('width', width);
    clonedSvg.setAttribute('height', height);
    clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

    // 内联所有计算样式
    inlineStyles(svgElement, clonedSvg);

    // 收集页面中 markmap 相关的 <style> 样式并嵌入
    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    let cssText = '';
    try {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            // 只收集 markmap 相关的 CSS 规则
            if (rule.cssText && (
              rule.cssText.includes('.markmap') ||
              rule.cssText.includes('markmap') ||
              rule.selectorText && rule.selectorText.includes('.markmap')
            )) {
              cssText += rule.cssText + '\n';
            }
          }
        } catch (_) {
          // 跨域样式表会抛错，忽略
        }
      }
    } catch (_) {}

    // 同时收集 SVG 内嵌的 <style>
    const internalStyles = svgElement.querySelectorAll('style');
    internalStyles.forEach(s => { cssText += s.textContent + '\n'; });

    if (cssText) {
      styleEl.textContent = cssText;
      clonedSvg.insertBefore(styleEl, clonedSvg.firstChild);
    }

    // 添加白色背景矩形
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', bbox.x - padding);
    bgRect.setAttribute('y', bbox.y - padding);
    bgRect.setAttribute('width', width);
    bgRect.setAttribute('height', height);
    bgRect.setAttribute('fill', backgroundColor);
    // 背景放在 <style> 后面，其他内容前面
    const firstContent = clonedSvg.querySelector(':not(style):not(defs)');
    if (firstContent) {
      clonedSvg.insertBefore(bgRect, firstContent);
    } else {
      clonedSvg.appendChild(bgRect);
    }

    const serializer = new XMLSerializer();
    const svgString = '<?xml version="1.0" encoding="UTF-8"?>\n' + serializer.serializeToString(clonedSvg);

    return new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  }

  /**
   * 递归内联样式，确保 SVG 导出后样式正确
   */
  function inlineStyles(original, clone) {
    const originalChildren = original.children;
    const cloneChildren = clone.children;

    for (let i = 0; i < originalChildren.length && i < cloneChildren.length; i++) {
      const origChild = originalChildren[i];
      const cloneChild = cloneChildren[i];

      if (origChild instanceof Element) {
        const computedStyle = window.getComputedStyle(origChild);

        // 内联所有关键样式属性（增加更多属性以提高保真度）
        const importantProps = [
          'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity',
          'opacity', 'fill-opacity',
          'font-family', 'font-size', 'font-weight', 'font-style',
          'text-anchor', 'dominant-baseline', 'text-decoration', 'color',
          'letter-spacing', 'word-spacing',
        ];

        for (const prop of importantProps) {
          const value = computedStyle.getPropertyValue(prop);
          if (value && value !== '' && value !== 'none' && value !== 'normal' && value !== '0px') {
            cloneChild.style.setProperty(prop, value);
          }
        }

        // 递归子元素
        inlineStyles(origChild, cloneChild);
      }
    }
  }

  /**
   * 触发下载 PNG 图片
   * @param {SVGElement} svgElement - SVG DOM 元素
   * @param {string} filename - 文件名（不含扩展名）
   * @param {object} options - 导出选项
   */
  async function download(svgElement, filename, options = {}) {
    const blob = await svgToPngBlob(svgElement, options);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * 触发下载 SVG 矢量图
   * @param {SVGElement} svgElement - SVG DOM 元素
   * @param {string} filename - 文件名（不含扩展名）
   * @param {object} options - 导出选项
   */
  function downloadSvg(svgElement, filename, options = {}) {
    const blob = svgToSvgBlob(svgElement, options);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { download, downloadSvg, svgToPngBlob, svgToSvgBlob };
})();
