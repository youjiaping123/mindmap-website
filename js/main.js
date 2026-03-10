/**
 * 应用入口 - 事件监听与初始化
 * 依赖: 所有其他 js 模块
 */

document.addEventListener('DOMContentLoaded', () => {
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
});
