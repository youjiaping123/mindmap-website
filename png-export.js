/**
 * 图片导出模块
 *
 * 将 SVG 思维导图导出为 JPEG 图片或矢量 PDF
 */

const PngExport = (() => {

  /**
   * 将 SVG 元素导出为 JPEG Blob
   * JPEG 相比 PNG：体积缩小 90%+，微信/QQ 等全平台兼容，白底思维导图肉眼无差别
   * @param {SVGElement} svgElement - SVG DOM 元素
   * @param {object} options - 选项
   * @returns {Promise<Blob>}
   */
  async function svgToImageBlob(svgElement, options = {}) {
    const {
      scale = 6,           // 6x 分辨率（高清，JPEG 压缩后体积仍可控）
      padding = 40,        // 四周留白
      backgroundColor = '#ffffff',
      quality = 0.95,      // JPEG 质量（0.95 接近无损，文字更锐利）
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
            reject(new Error('Failed to create JPEG'));
          }
        }, 'image/jpeg', quality);
      };
      img.onerror = () => reject(new Error('Failed to load SVG'));
      img.src = svgDataUrl;
    });
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
   * 触发下载 JPEG 图片
   * @param {SVGElement} svgElement - SVG DOM 元素
   * @param {string} filename - 文件名（不含扩展名）
   * @param {object} options - 导出选项
   */
  async function download(svgElement, filename, options = {}) {
    const blob = await svgToImageBlob(svgElement, options);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * 触发下载高清 PDF（JPEG 位图嵌入，一键下载无需打印对话框）
   * 复用 svgToImageBlob 生成高清 JPEG，再用 jsPDF 包装成 PDF
   */
  async function downloadPdf(svgElement, filename, options = {}) {
    const {
      scale = 6,
      padding = 40,
      backgroundColor = '#ffffff',
      quality = 0.95,
    } = options;

    if (typeof window.jspdf === 'undefined') {
      throw new Error('PDF 导出库未加载，请刷新页面重试');
    }

    // 复用图片导出逻辑生成 JPEG Blob
    const blob = await svgToImageBlob(svgElement, { scale, padding, backgroundColor, quality });

    // Blob → Data URL
    const imgDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(blob);
    });

    // 计算 PDF 页面尺寸（mm）
    const bbox = svgElement.getBBox();
    const width = bbox.width + padding * 2;
    const height = bbox.height + padding * 2;
    const PX_TO_MM = 0.264583;
    const pdfWidth = width * PX_TO_MM;
    const pdfHeight = height * PX_TO_MM;
    const orientation = pdfWidth > pdfHeight ? 'landscape' : 'portrait';

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation,
      unit: 'mm',
      format: [pdfWidth, pdfHeight],
    });

    doc.addImage(imgDataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    doc.save(`${filename}.pdf`);
  }

  return { download, downloadPdf, svgToImageBlob };
})();
