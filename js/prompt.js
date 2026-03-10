/**
 * 自定义提示词管理
 * 依赖: constants.js, utils.js, state.js, presets.js
 */

/** 展开/折叠自定义提示词区域 */
function togglePrompt() {
  const body = $('promptBody');
  const icon = $('promptToggleIcon');
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'block' : 'none';
  icon.textContent = isHidden ? '▼' : '▶';
}

/** 清空自定义提示词 */
function resetPrompt() {
  const textarea = $('customPrompt');
  textarea.value = '';
  AppState.activePreset = '';
  updatePresetButtons();
  updatePromptCharCount();
  updatePromptHint();
}

/** 将默认提示词填充到文本框，方便用户参考修改 */
function fillDefaultPrompt() {
  const textarea = $('customPrompt');
  textarea.value = DEFAULT_PROMPT;
  updatePromptCharCount();
  updatePromptHint();
  textarea.focus();
}

/** 更新提示词字符计数 */
function updatePromptCharCount() {
  const textarea = $('customPrompt');
  const count = $('promptCharCount');
  if (textarea && count) {
    const limit = AppState.activePreset ? MAX_PROMPT_LENGTH : MAX_PROMPT_LENGTH_MANUAL;
    count.textContent = `${textarea.value.length} / ${limit}`;
  }
}

/** 更新提示词状态提示 */
function updatePromptHint() {
  const textarea = $('customPrompt');
  const hint = $('promptToggleHint');
  if (!textarea || !hint) return;

  if (textarea.value.trim()) {
    hint.textContent = '（已自定义）';
    hint.style.color = 'var(--primary)';
  } else {
    hint.textContent = '（使用默认提示词）';
    hint.style.color = '';
  }
}

/** 初始化提示词输入事件 */
function initPromptListeners() {
  const textarea = $('customPrompt');
  if (!textarea) return;

  textarea.addEventListener('input', () => {
    // 手动输入时限制字数（预设模式不截断）
    if (!AppState.activePreset && textarea.value.length > MAX_PROMPT_LENGTH_MANUAL) {
      textarea.value = textarea.value.slice(0, MAX_PROMPT_LENGTH_MANUAL);
    }
    AppState.activePreset = '';
    updatePresetButtons();
    updatePromptCharCount();
    updatePromptHint();
  });
}
