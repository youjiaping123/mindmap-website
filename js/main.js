/**
 * 应用入口 - 事件监听与初始化
 * 依赖: 所有其他 js 模块
 */

document.addEventListener('DOMContentLoaded', () => {
  // 初始化主题
  applyTheme(getSavedTheme());

  // 初始化粒子背景
  initParticles();

  // 初始化模块
  loadModels();
  renderHistoryList();
  initPromptListeners();

  // 主题输入框: Enter 键触发生成
  $('topicInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      handleGenerate();
    }
  });

  // 对话输入框: Enter 发送, Shift+Enter 换行
  const chatInput = $('chatInput');
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      handleChat();
    }
  });

  // 对话输入框自动调整高度
  chatInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });

  // 窗口 resize 时重新 fit markmap
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (AppState.markmapInstance) AppState.markmapInstance.fit();
    }, 200);
  });

  // 全屏切换时更新图标 & refit markmap
  document.addEventListener('fullscreenchange', _onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', _onFullscreenChange);

  function _onFullscreenChange() {
    _updateFullscreenIcon();
    // 延迟 refit，等 DOM 布局完成
    setTimeout(() => {
      if (AppState.markmapInstance) AppState.markmapInstance.fit();
    }, 150);
  }

  // 版本滑块 - 拖动时实时更新显示数字
  const versionSlider = $('versionSlider');
  const versionCountDisplay = $('versionCountDisplay');
  if (versionSlider && versionCountDisplay) {
    versionSlider.addEventListener('input', () => {
      versionCountDisplay.textContent = versionSlider.value;
    });
  }

  // 节点编辑弹窗 - 取消 & 保存 & 背景点击关闭
  const nodeEditModal = $('nodeEditModal');
  if (nodeEditModal) {
    const cancelBtn = nodeEditModal.querySelector('.node-edit-cancel');
    const saveBtn = nodeEditModal.querySelector('.node-edit-save');
    const backdrop = nodeEditModal.querySelector('.node-edit-backdrop');

    if (cancelBtn) cancelBtn.addEventListener('click', closeNodeEditModal);
    if (saveBtn) saveBtn.addEventListener('click', saveNodeEdit);
    if (backdrop) backdrop.addEventListener('click', closeNodeEditModal);

    // ESC 关闭编辑弹窗
    const editInput = $('nodeEditInput');
    if (editInput) {
      editInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeNodeEditModal();
        }
      });
    }
  }

  // ESC 键关闭弹窗/退出全屏（全局）
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // 优先关闭节点编辑弹窗
      const modal = $('nodeEditModal');
      if (modal && modal.style.display === 'flex') {
        e.preventDefault();
        closeNodeEditModal();
        return;
      }
      // 其次退出模拟全屏
      const panel = $('previewPanel');
      if (panel && panel.classList.contains('is-fake-fullscreen')) {
        e.preventDefault();
        _exitFakeFullscreen(panel);
      }
    }
  });

  // 浏览器返回按钮退出模拟全屏 (移动端常用手势)
  window.addEventListener('popstate', (e) => {
    const panel = $('previewPanel');
    if (panel && panel.classList.contains('is-fake-fullscreen')) {
      e.preventDefault();
      _exitFakeFullscreen(panel);
    }
  });

  // 页面加载完成后的入场动画
  requestAnimationFrame(() => {
    document.body.style.opacity = '1';
  });
});
