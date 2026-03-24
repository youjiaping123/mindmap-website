/**
 * 预设提示词风格
 * 依赖: constants.js, state.js
 */

const PRESET_PROMPTS = {
  detailed: {
    label: '📚 详尽模式',
    description: '分支多、层级深、覆盖全面',
    temperature: globalThis.MINDMAP_MODEL_OPTIONS?.presetTemperatures?.detailed ?? 0.6,
    prompt: globalThis.MINDMAP_SHARED_PROMPTS?.DETAILED_PRESET_PROMPT || '',
  },

  concise: {
    label: '⚡ 简洁模式',
    description: '精炼扼要、一目了然',
    temperature: globalThis.MINDMAP_MODEL_OPTIONS?.presetTemperatures?.concise ?? 0.4,
    prompt: globalThis.MINDMAP_SHARED_PROMPTS?.CONCISE_PRESET_PROMPT || '',
  },

  creative: {
    label: '🎨 创意模式',
    description: '发散联想、多角度思考',
    temperature: globalThis.MINDMAP_MODEL_OPTIONS?.presetTemperatures?.creative ?? 0.95,
    prompt: globalThis.MINDMAP_SHARED_PROMPTS?.CREATIVE_PRESET_PROMPT || '',
  },
};

/** 获取当前激活预设的默认温度 */
function getActivePresetTemperature() {
  const preset = PRESET_PROMPTS[AppState.activePreset];
  return typeof preset?.temperature === 'number' ? preset.temperature : null;
}

/** 应用预设提示词风格 */
function applyPreset(key) {
  const textarea = $('customPrompt');
  const body = $('promptBody');
  const icon = $('promptToggleIcon');

  // 如果点击已激活的预设，则取消
  if (AppState.activePreset === key) {
    textarea.value = '';
    AppState.activePreset = '';
    updatePresetButtons();
    updatePromptCharCount();
    updatePromptHint();
    return;
  }

  const preset = PRESET_PROMPTS[key];
  if (!preset) return;

  body.style.display = 'block';
  icon.textContent = '▼';
  textarea.value = preset.prompt;
  AppState.activePreset = key;

  updatePresetButtons();
  updatePromptCharCount();
  updatePromptHint();
}

/** 更新预设按钮的选中状态 */
function updatePresetButtons() {
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.preset === AppState.activePreset);
  });
}
