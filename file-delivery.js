/**
 * 文件交付层
 *
 * 统一处理桌面下载与 iOS Safari 的预览/分享交付差异。
 */

const FileDelivery = (() => {
  const STRATEGIES = new Set(['direct-download', 'preview-page', 'share-page']);
  const PREVIEW_REVOKE_DELAY_MS = 5 * 60 * 1000;
  const sharePayloads = new Map();

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeFilename(filename) {
    const cleaned = String(filename || 'download')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .trim();
    return cleaned || 'download';
  }

  function getEnvironment() {
    const nav = window.navigator || {};
    const ua = nav.userAgent || '';
    const platform = nav.platform || '';
    const maxTouchPoints = Number(nav.maxTouchPoints || 0);
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua)
      || (platform === 'MacIntel' && maxTouchPoints > 1);
    const isWebKit = /AppleWebKit/i.test(ua);

    return {
      isIOSWebKit: isIOSDevice && isWebKit,
      isSecureContext: window.isSecureContext !== false,
    };
  }

  function scheduleObjectUrlCleanup(url) {
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, PREVIEW_REVOKE_DELAY_MS);
  }

  function triggerDirectDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 30_000);

    return {
      deliveryMode: 'direct-download',
      shareSupported: false,
    };
  }

  function getWindowLabel(strategy) {
    if (strategy === 'share-page') return '准备分享文件';
    return '准备打开预览';
  }

  function renderLoadingPage(win, filename, strategy) {
    const title = getWindowLabel(strategy);
    const escapedTitle = escapeHtml(title);
    const escapedFilename = escapeHtml(filename);

    win.document.open();
    win.document.write(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${escapedTitle}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fb;
      --panel: #ffffff;
      --text: #1f2937;
      --muted: #6b7280;
      --border: #dbe3f0;
      --accent: #2563eb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: radial-gradient(circle at top, #e8eefc 0%, var(--bg) 55%);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .card {
      width: min(100%, 420px);
      padding: 28px 24px;
      border-radius: 20px;
      background: var(--panel);
      border: 1px solid var(--border);
      box-shadow: 0 18px 50px rgba(15, 23, 42, 0.10);
    }
    .spinner {
      width: 28px;
      height: 28px;
      margin-bottom: 16px;
      border: 3px solid rgba(37, 99, 235, 0.15);
      border-top-color: var(--accent);
      border-radius: 999px;
      animation: spin 0.8s linear infinite;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 20px;
      line-height: 1.3;
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
      font-size: 14px;
    }
    .file {
      margin-top: 16px;
      padding: 12px 14px;
      border-radius: 14px;
      background: #eff4ff;
      color: #1d4ed8;
      font-size: 13px;
      word-break: break-word;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <section class="card">
    <div class="spinner" aria-hidden="true"></div>
    <h1>${escapedTitle}</h1>
    <p>文件正在生成，请保持此页面打开。生成完成后会自动继续。</p>
    <div class="file">${escapedFilename}</div>
  </section>
</body>
</html>`);
    win.document.close();
  }

  function renderFailurePage(win, filename, message) {
    const escapedFilename = escapeHtml(filename);
    const escapedMessage = escapeHtml(message || '文件导出失败，请返回原页面重试。');

    win.document.open();
    win.document.write(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>导出失败</title>
  <style>
    :root {
      --bg: #fff7f7;
      --panel: #ffffff;
      --text: #1f2937;
      --muted: #6b7280;
      --danger: #dc2626;
      --danger-bg: #fef2f2;
      --border: #f3d2d2;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .card {
      width: min(100%, 420px);
      padding: 28px 24px;
      border-radius: 20px;
      background: var(--panel);
      border: 1px solid var(--border);
      box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
    }
    h1 {
      margin: 0 0 12px;
      color: var(--danger);
      font-size: 20px;
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
      font-size: 14px;
    }
    .error {
      margin-top: 16px;
      padding: 12px 14px;
      border-radius: 14px;
      background: var(--danger-bg);
      color: var(--danger);
      font-size: 14px;
      line-height: 1.6;
    }
    .file {
      margin-top: 12px;
      font-size: 13px;
      color: var(--muted);
      word-break: break-word;
    }
    button {
      margin-top: 18px;
      border: 0;
      border-radius: 12px;
      padding: 12px 16px;
      background: #111827;
      color: #ffffff;
      font: inherit;
    }
  </style>
</head>
<body>
  <section class="card">
    <h1>导出失败</h1>
    <p>文件生成过程中遇到问题，请返回原页面重试。</p>
    <div class="error">${escapedMessage}</div>
    <div class="file">${escapedFilename}</div>
    <button type="button" onclick="window.close()">关闭页面</button>
  </section>
</body>
</html>`);
    win.document.close();
  }

  function getShareUnsupportedReason() {
    if (!window.isSecureContext) {
      return '当前环境不支持系统分享。iPhone Safari 上分享文件通常需要 HTTPS 或 localhost。';
    }
    if (typeof navigator.share !== 'function') {
      return '当前浏览器不支持文件分享，请使用较新的 iOS Safari。';
    }
    return '当前浏览器不支持分享这个文件类型，请尝试“存储到文件”或更换浏览器环境。';
  }

  function canShareFile(file) {
    if (typeof navigator.share !== 'function') return false;
    if (typeof navigator.canShare !== 'function') return true;

    try {
      return navigator.canShare({ files: [file] });
    } catch {
      return false;
    }
  }

  function renderSharePage(win, sessionId, filename, shareSupported, unsupportedReason) {
    const escapedFilename = escapeHtml(filename);
    const escapedReason = escapeHtml(unsupportedReason || '');

    win.document.open();
    win.document.write(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>文件已准备完成</title>
  <style>
    :root {
      --bg: #f5f7fb;
      --panel: #ffffff;
      --text: #111827;
      --muted: #6b7280;
      --border: #dbe3f0;
      --primary: #2563eb;
      --primary-disabled: #93c5fd;
      --secondary: #eef2ff;
      --secondary-text: #374151;
      --warning-bg: #fffbeb;
      --warning-text: #b45309;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: radial-gradient(circle at top, #e8eefc 0%, var(--bg) 55%);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .card {
      width: min(100%, 420px);
      padding: 28px 24px;
      border-radius: 20px;
      background: var(--panel);
      border: 1px solid var(--border);
      box-shadow: 0 18px 50px rgba(15, 23, 42, 0.10);
    }
    h1 {
      margin: 0 0 10px;
      font-size: 20px;
      line-height: 1.3;
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
      font-size: 14px;
    }
    .file {
      margin-top: 16px;
      padding: 12px 14px;
      border-radius: 14px;
      background: #eff4ff;
      color: #1d4ed8;
      font-size: 13px;
      word-break: break-word;
    }
    .warning {
      margin-top: 16px;
      padding: 12px 14px;
      border-radius: 14px;
      background: var(--warning-bg);
      color: var(--warning-text);
      font-size: 13px;
      line-height: 1.6;
    }
    .actions {
      margin-top: 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    button {
      border: 0;
      border-radius: 12px;
      padding: 12px 16px;
      font: inherit;
    }
    .primary {
      background: var(--primary);
      color: #ffffff;
    }
    .primary:disabled {
      background: var(--primary-disabled);
    }
    .secondary {
      background: var(--secondary);
      color: var(--secondary-text);
    }
    .status {
      margin-top: 14px;
      min-height: 20px;
      font-size: 13px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <section class="card">
    <h1>文件已准备完成</h1>
    <p>iPhone Safari 不能稳定直接下载 .xmind 文件，请使用下面的按钮把文件交给系统分享或存到 Files。</p>
    <div class="file">${escapedFilename}</div>
    ${shareSupported ? '' : `<div class="warning">${escapedReason}</div>`}
    <div class="actions">
      <button id="shareBtn" class="primary" type="button" ${shareSupported ? '' : 'disabled'}>保存到文件 / 分享</button>
      <button id="closeBtn" class="secondary" type="button">关闭页面</button>
    </div>
    <div class="status" id="status">${shareSupported ? '点击按钮后会拉起 iOS 系统分享面板。' : '当前环境不支持直接分享文件。'}</div>
  </section>
  <script>
    (function () {
      const sessionId = ${JSON.stringify(sessionId)};
      const shareBtn = document.getElementById('shareBtn');
      const closeBtn = document.getElementById('closeBtn');
      const statusEl = document.getElementById('status');

      function cleanupPreparedFile() {
        const openerApi = window.opener && window.opener.FileDelivery;
        if (openerApi && typeof openerApi.clearPreparedSharePayload === 'function') {
          openerApi.clearPreparedSharePayload(sessionId);
        }
      }

      if (!shareBtn) return;

      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          cleanupPreparedFile();
          window.close();
        });
      }

      window.addEventListener('pagehide', cleanupPreparedFile);

      shareBtn.addEventListener('click', async () => {
        const openerApi = window.opener && window.opener.FileDelivery;
        if (!openerApi || typeof openerApi.getPreparedSharePayload !== 'function') {
          statusEl.textContent = '原页面不可用，请返回应用重新导出。';
          return;
        }

        const payload = openerApi.getPreparedSharePayload(sessionId);
        if (!payload || !payload.blob) {
          statusEl.textContent = '文件不存在或已过期，请返回应用重新导出。';
          return;
        }

        const file = new File([payload.blob], payload.filename, { type: payload.mimeType });
        if (typeof navigator.canShare === 'function') {
          try {
            if (!navigator.canShare({ files: [file] })) {
              statusEl.textContent = '当前环境不支持分享这个文件类型，请尝试 HTTPS 环境。';
              return;
            }
          } catch (error) {
            statusEl.textContent = error && error.message ? error.message : '当前环境不支持文件分享。';
            return;
          }
        }

        shareBtn.disabled = true;
        statusEl.textContent = '正在打开系统分享面板...';

        try {
          await navigator.share({
            files: [file],
            title: payload.filename,
          });
          statusEl.textContent = '系统分享面板已打开，完成保存后即可关闭此页。';
          cleanupPreparedFile();
        } catch (error) {
          if (error && error.name === 'AbortError') {
            statusEl.textContent = '已取消分享，你可以再次点击按钮重试。';
            shareBtn.disabled = false;
            return;
          }

          statusEl.textContent = error && error.message
            ? error.message
            : '系统分享失败，请返回应用重新导出。';
          shareBtn.disabled = false;
        }
      });
    })();
  </script>
</body>
</html>`);
    win.document.close();
  }

  function openPlaceholderWindow(filename, strategy) {
    const popup = window.open('', '_blank');
    if (!popup) {
      throw new Error('浏览器拦截了导出窗口，请允许弹出新页面后重试');
    }

    renderLoadingPage(popup, filename, strategy);
    return popup;
  }

  function begin({ filename, mimeType, strategy }) {
    if (!STRATEGIES.has(strategy)) {
      throw new Error(`Unsupported delivery strategy: ${strategy}`);
    }

    const safeFilename = sanitizeFilename(filename);
    const env = getEnvironment();
    const usePageFlow = env.isIOSWebKit && strategy !== 'direct-download';
    const popup = usePageFlow ? openPlaceholderWindow(safeFilename, strategy) : null;
    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return {
      id: sessionId,
      filename: safeFilename,
      mimeType,
      strategy,
      async complete(blob) {
        if (!(blob instanceof Blob)) {
          throw new Error('导出结果无效，请重试');
        }

        if (!usePageFlow) {
          return triggerDirectDownload(blob, safeFilename);
        }

        if (!popup || popup.closed) {
          throw new Error('导出窗口已关闭，请重新点击按钮导出');
        }

        if (strategy === 'preview-page') {
          const previewUrl = URL.createObjectURL(blob);
          scheduleObjectUrlCleanup(previewUrl);
          popup.location.href = previewUrl;
          return {
            deliveryMode: 'preview-page',
            shareSupported: false,
          };
        }

        const file = new File([blob], safeFilename, { type: mimeType || 'application/octet-stream' });
        const shareSupported = canShareFile(file);
        const unsupportedReason = shareSupported ? '' : getShareUnsupportedReason();

        sharePayloads.set(sessionId, {
          blob,
          filename: safeFilename,
          mimeType: mimeType || 'application/octet-stream',
        });
        renderSharePage(popup, sessionId, safeFilename, shareSupported, unsupportedReason);

        return {
          deliveryMode: 'share-page',
          shareSupported,
          unsupportedReason,
        };
      },
      fail(message) {
        if (popup && !popup.closed) {
          renderFailurePage(popup, safeFilename, message);
        }
      },
    };
  }

  function getPreparedSharePayload(sessionId) {
    return sharePayloads.get(sessionId) || null;
  }

  function clearPreparedSharePayload(sessionId) {
    sharePayloads.delete(sessionId);
  }

  return {
    begin,
    getEnvironment,
    getPreparedSharePayload,
    clearPreparedSharePayload,
  };
})();

window.FileDelivery = FileDelivery;
