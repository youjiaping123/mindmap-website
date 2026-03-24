/**
 * 应用入口 - 事件监听与初始化
 * 依赖: 所有其他 js 模块
 */

const MARKMAP_REFIT_DELAY_MS = 150;
const MARKMAP_RESIZE_DEBOUNCE_MS = 200;
const CHAT_INPUT_MAX_HEIGHT = 120;

function refitMarkmap(delay = MARKMAP_REFIT_DELAY_MS) {
  requestMarkmapFit(delay);
}

function initAppShell() {
  applyTheme(getSavedTheme());
  initParticles();
  loadModels();
  renderHistoryList();
  initPromptListeners();
}

function bindTopicInput() {
  const topicInput = $('topicInput');
  if (!topicInput) return;

  topicInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      handleGenerate();
    }
  });
}

function bindChatInput() {
  const chatInput = $('chatInput');
  if (!chatInput) return;

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      handleChat();
    }
  });

  chatInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, CHAT_INPUT_MAX_HEIGHT) + 'px';
  });
}

function bindResponsiveHandlers() {
  let resizeTimer = null;

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      requestMarkmapFit();
    }, MARKMAP_RESIZE_DEBOUNCE_MS);
  });

  const onFullscreenChange = () => {
    _updateFullscreenIcon();
    refitMarkmap();
  };

  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
}

function bindVersionSlider() {
  const versionSlider = $('versionSlider');
  const versionCountDisplay = $('versionCountDisplay');
  if (!versionSlider || !versionCountDisplay) return;

  versionSlider.addEventListener('input', () => {
    versionCountDisplay.textContent = versionSlider.value;
  });
}

function bindNodeEditModal() {
  const nodeEditModal = $('nodeEditModal');
  if (!nodeEditModal) return;

  const cancelBtn = nodeEditModal.querySelector('.node-edit-cancel');
  const saveBtn = nodeEditModal.querySelector('.node-edit-save');
  const backdrop = nodeEditModal.querySelector('.node-edit-backdrop');

  if (cancelBtn) cancelBtn.addEventListener('click', closeNodeEditModal);
  if (saveBtn) saveBtn.addEventListener('click', saveNodeEdit);
  if (backdrop) backdrop.addEventListener('click', closeNodeEditModal);

  const editInput = $('nodeEditInput');
  if (!editInput) return;

  editInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeNodeEditModal();
    }
  });
}

function bindGlobalShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;

    const modal = $('nodeEditModal');
    if (modal && modal.style.display === 'flex') {
      e.preventDefault();
      closeNodeEditModal();
      return;
    }

    const panel = $('previewPanel');
    if (panel && panel.classList.contains('is-fake-fullscreen')) {
      e.preventDefault();
      _exitFakeFullscreen(panel);
    }
  });

  window.addEventListener('popstate', (e) => {
    const panel = $('previewPanel');
    if (panel && panel.classList.contains('is-fake-fullscreen')) {
      e.preventDefault();
      _exitFakeFullscreen(panel);
    }
  });
}

function playEntranceAnimation() {
  requestAnimationFrame(() => {
    document.body.style.opacity = '1';
  });
}

function initializeApp() {
  initAppShell();
  bindTopicInput();
  bindChatInput();
  bindResponsiveHandlers();
  bindVersionSlider();
  bindNodeEditModal();
  bindGlobalShortcuts();
  playEntranceAnimation();
}

document.addEventListener('DOMContentLoaded', initializeApp);
