/**
 * 前端导出桥接
 * - 桌面端：直接下载
 * - iOS WebKit：先打开桥接页，再交付预览或可见链接
 */

const ExportBridge = (() => {
  const PREVIEWABLE_MIME_TYPES = new Set([
    'image/jpeg',
    'image/svg+xml',
    'application/pdf',
  ]);
  const OBJECT_URL_TTL = 10 * 60 * 1000;

  function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function isIosWebKit() {
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    const isAppleMobile = /iPad|iPhone|iPod/.test(ua) ||
      (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isWebKit = /WebKit/i.test(ua);
    const isOtherIOSBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua);

    return isAppleMobile && isWebKit && !isOtherIOSBrowser;
  }

  function shouldBridge(mimeType) {
    return isIosWebKit() && !!mimeType;
  }

  function isPreviewableMimeType(mimeType) {
    return PREVIEWABLE_MIME_TYPES.has(mimeType);
  }

  function normalizeBlob(blob, mimeType) {
    const type = mimeType || blob?.type || 'application/octet-stream';
    if (blob instanceof Blob && blob.type === type) return blob;
    return new Blob([blob], { type });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('文件编码失败'));
        }
      };
      reader.onerror = () => reject(new Error('文件编码失败'));
      reader.readAsDataURL(blob);
    });
  }

  async function toAttachmentDataUrl(blob) {
    const dataUrl = await blobToDataUrl(blob);
    const marker = ';base64,';
    const markerIndex = dataUrl.indexOf(marker);

    if (markerIndex === -1) return dataUrl;
    return `data:attachment/file${dataUrl.slice(markerIndex)}`;
  }

  function scheduleUrlCleanup(url, popup = null) {
    let revoked = false;
    const revoke = () => {
      if (revoked) return;
      revoked = true;
      try {
        URL.revokeObjectURL(url);
      } catch {}
    };

    const timeoutId = window.setTimeout(() => {
      if (intervalId) window.clearInterval(intervalId);
      revoke();
    }, OBJECT_URL_TTL);

    const intervalId = popup
      ? window.setInterval(() => {
        if (popup.closed) {
          window.clearTimeout(timeoutId);
          window.clearInterval(intervalId);
          revoke();
        }
      }, 2000)
      : null;
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

    scheduleUrlCleanup(url);
    return { deliveryMode: 'download' };
  }

  function openBridgeWindow(filename) {
    const popup = window.open('', '_blank');
    if (!popup) return null;

    renderPage(popup, {
      title: '正在准备导出文件',
      subtitle: filename,
      body: '<p class="export-bridge-note">文件生成完成后会自动打开预览或保存页。</p>',
      primaryLabel: '',
      showPrimary: false,
    });

    return popup;
  }

  function renderPage(popup, {
    title,
    subtitle = '',
    body = '',
    primaryLabel = '关闭页面',
    showPrimary = true,
  }) {
    if (!popup || popup.closed) return;

    const doc = popup.document;
    doc.open();
    doc.write(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${escapeText(title)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #0f172a;
      --panel: rgba(15, 23, 42, 0.9);
      --text: #e2e8f0;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --accent-strong: #0ea5e9;
      --line: rgba(148, 163, 184, 0.22);
      --button-text: #ffffff;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f8fafc;
        --panel: rgba(255, 255, 255, 0.96);
        --text: #0f172a;
        --muted: #475569;
        --accent: #0284c7;
        --accent-strong: #0369a1;
        --line: rgba(15, 23, 42, 0.12);
      }
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans SC', sans-serif;
      background:
        radial-gradient(circle at top, rgba(56, 189, 248, 0.18), transparent 38%),
        linear-gradient(180deg, var(--bg), #020617);
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .export-bridge-card {
      width: min(100%, 460px);
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 28px 22px;
      box-shadow: 0 24px 60px rgba(2, 6, 23, 0.28);
      backdrop-filter: blur(16px);
    }
    h1 {
      margin: 0 0 8px;
      font-size: 24px;
      line-height: 1.2;
    }
    .export-bridge-subtitle {
      margin: 0 0 18px;
      color: var(--muted);
      word-break: break-word;
      font-size: 14px;
    }
    .export-bridge-body {
      color: var(--text);
      font-size: 15px;
      line-height: 1.7;
    }
    .export-bridge-note {
      margin: 0;
      color: var(--muted);
    }
    .export-bridge-link {
      color: var(--accent);
      text-decoration: none;
      font-weight: 600;
      word-break: break-all;
    }
    .export-bridge-link:active,
    .export-bridge-link:hover {
      color: var(--accent-strong);
    }
    .export-bridge-actions {
      display: flex;
      gap: 12px;
      margin-top: 20px;
      flex-wrap: wrap;
    }
    .export-bridge-btn {
      appearance: none;
      border: none;
      border-radius: 999px;
      padding: 12px 18px;
      font-size: 15px;
      font-weight: 700;
      background: linear-gradient(135deg, var(--accent), var(--accent-strong));
      color: var(--button-text);
      cursor: pointer;
    }
    .export-bridge-btn.export-bridge-btn-secondary {
      background: transparent;
      border: 1px solid var(--line);
      color: var(--text);
    }
  </style>
</head>
<body>
  <main class="export-bridge-card">
    <h1>${escapeText(title)}</h1>
    ${subtitle ? `<p class="export-bridge-subtitle">${escapeText(subtitle)}</p>` : ''}
    <section class="export-bridge-body">${body}</section>
    <div class="export-bridge-actions">
      ${showPrimary ? `<button class="export-bridge-btn" id="exportBridgePrimary">${escapeText(primaryLabel)}</button>` : ''}
      <button class="export-bridge-btn export-bridge-btn-secondary" id="exportBridgeClose">关闭页面</button>
    </div>
  </main>
</body>
</html>`);
    doc.close();

    const closeButton = doc.getElementById('exportBridgeClose');
    if (closeButton) {
      closeButton.addEventListener('click', () => popup.close());
    }
  }

  function deliverPreview(popup, blob, filename) {
    const url = URL.createObjectURL(blob);
    scheduleUrlCleanup(url, popup);

    if (!popup || popup.closed) {
      window.location.href = url;
      return { deliveryMode: 'preview' };
    }

    renderPage(popup, {
      title: '文件已准备完成',
      subtitle: filename,
      body: `
        <p class="export-bridge-note">正在打开预览页。如未自动跳转，请使用下面的链接。</p>
        <p><a class="export-bridge-link" id="exportBridgeOpenLink" href="${escapeText(url)}">打开预览</a></p>
      `,
      primaryLabel: '打开预览',
    });

    const doc = popup.document;
    const link = doc.getElementById('exportBridgeOpenLink');
    const primaryButton = doc.getElementById('exportBridgePrimary');
    const openPreview = () => {
      if (popup.closed) return;
      popup.location.replace(url);
    };

    if (link) {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        openPreview();
      });
    }
    if (primaryButton) {
      primaryButton.addEventListener('click', openPreview);
    }

    popup.setTimeout(openPreview, 120);
    return { deliveryMode: 'preview' };
  }

  function canShareFile(file) {
    if (!window.isSecureContext) return false;
    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
      return false;
    }

    try {
      return navigator.canShare({ files: [file] });
    } catch {
      return false;
    }
  }

  async function deliverBinary(popup, blob, filename, mimeType) {
    if (!popup || popup.closed) {
      return downloadDirectly(blob, filename);
    }

    const file = typeof File === 'function'
      ? new File([blob], filename, { type: mimeType || blob.type || 'application/octet-stream' })
      : null;
    const shareAvailable = file ? canShareFile(file) : false;
    const directHref = shareAvailable
      ? URL.createObjectURL(blob)
      : await toAttachmentDataUrl(blob);

    if (shareAvailable) {
      scheduleUrlCleanup(directHref, popup);
    }

    renderPage(popup, {
      title: '文件已准备完成',
      subtitle: filename,
      body: `
        <p class="export-bridge-note">
          ${shareAvailable
    ? '点击按钮可调用系统分享，保存到“文件”或交给支持的 App。'
    : '点击下方链接可打开导出文件；若 iPhone 未直接保存，请长按链接并选择“下载链接文件”。'}
        </p>
        <p><a class="export-bridge-link" id="exportBridgeDownloadLink" href="${escapeText(directHref)}" download="${escapeText(filename)}">打开导出文件</a></p>
      `,
      primaryLabel: shareAvailable ? '保存到文件 / 分享' : '打开导出链接',
    });

    const doc = popup.document;
    const link = doc.getElementById('exportBridgeDownloadLink');
    const primaryButton = doc.getElementById('exportBridgePrimary');

    if (primaryButton) {
      primaryButton.addEventListener('click', async () => {
        if (shareAvailable) {
          try {
            await popup.navigator.share({
              files: [file],
              title: filename,
            });
          } catch (error) {
            if (error?.name === 'AbortError') return;
            const note = doc.querySelector('.export-bridge-note');
            if (note) {
              note.textContent = '系统分享未成功，请改用下方链接；如需保存，请长按链接并选择“下载链接文件”。';
            }
          }
          return;
        }

        if (link) {
          popup.location.href = link.href;
        }
      });
    }

    return { deliveryMode: shareAvailable ? 'share-page' : 'link-page' };
  }

  function begin({ filename, mimeType }) {
    const bridgeRequired = shouldBridge(mimeType);
    const popup = bridgeRequired ? openBridgeWindow(filename) : null;

    if (bridgeRequired && !popup) {
      throw new Error('Safari 阻止了导出窗口，请允许弹窗后重试');
    }

    return {
      async deliver(blob) {
        const normalizedBlob = normalizeBlob(blob, mimeType);

        if (!bridgeRequired) {
          return downloadDirectly(normalizedBlob, filename);
        }
        if (isPreviewableMimeType(mimeType)) {
          return deliverPreview(popup, normalizedBlob, filename);
        }
        return deliverBinary(popup, normalizedBlob, filename, mimeType);
      },
      fail(message) {
        if (!popup || popup.closed) return;
        renderPage(popup, {
          title: '导出失败',
          subtitle: filename,
          body: `<p class="export-bridge-note">${escapeText(message)}</p>`,
          primaryLabel: '',
          showPrimary: false,
        });
      },
    };
  }

  return {
    begin,
    isIosWebKit,
  };
})();
