/**
 * UI 工具函数
 * 依赖: utils.js
 */

/** 设置生成按钮的加载状态 */
function setLoading(loading) {
  const btn = $('generateBtn');
  const btnText = btn.querySelector('.btn-text');
  const btnLoading = btn.querySelector('.btn-loading');

  btn.disabled = loading;
  btnText.style.display = loading ? 'none' : 'inline-flex';
  btnLoading.style.display = loading ? 'inline-flex' : 'none';
}

/** 显示错误消息 */
function showError(message) {
  const el = $('errorMsg');
  el.textContent = message;
  el.style.display = 'block';
}

/** 隐藏错误消息 */
function hideError() {
  $('errorMsg').style.display = 'none';
}

/** Tab 切换 */
function switchTab(tab) {
  const previewPanel = $('previewPanel');
  const markdownPanel = $('markdownPanel');
  const tabPreview = $('tabPreview');
  const tabMarkdown = $('tabMarkdown');

  if (tab === 'preview') {
    previewPanel.style.display = 'block';
    markdownPanel.style.display = 'none';
    tabPreview.classList.add('active');
    tabMarkdown.classList.remove('active');
    setTimeout(() => {
      if (AppState.markmapInstance) AppState.markmapInstance.fit();
    }, 100);
  } else {
    previewPanel.style.display = 'none';
    markdownPanel.style.display = 'block';
    tabPreview.classList.remove('active');
    tabMarkdown.classList.add('active');
  }
}
