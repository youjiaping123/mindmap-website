/**
 * 前端导出桥接
 * 当前统一采用 aimap.html 同款直接下载：
 * Blob -> Object URL -> <a download> -> click()
 */

const ExportBridge = (() => {
  function normalizeBlob(blob, mimeType) {
    const type = mimeType || blob?.type || 'application/octet-stream';
    if (blob instanceof Blob && blob.type === type) return blob;
    return new Blob([blob], { type });
  }

  function downloadDirectly(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
    return { deliveryMode: 'download' };
  }

  function begin({ filename, mimeType }) {
    return {
      async deliver(blob) {
        const normalizedBlob = normalizeBlob(blob, mimeType);
        return downloadDirectly(normalizedBlob, filename);
      },
      fail() {},
    };
  }

  return {
    begin,
  };
})();
