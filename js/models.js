/**
 * 模型列表加载
 * 依赖: utils.js
 */

/** 从后端获取可用模型列表并填充下拉框 */
async function loadModels() {
  const select = $('modelSelect');
  try {
    const response = await fetch('/api/models');
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || '获取模型列表失败');
    }

    select.innerHTML = '';

    const models = data.models || [];
    const defaultModel = data.default || '';

    if (models.length === 0) {
      select.innerHTML = '<option value="">无可用模型</option>';
      return;
    }

    models.forEach((modelId) => {
      const option = document.createElement('option');
      option.value = modelId;
      option.textContent = modelId;
      if (modelId === defaultModel) option.selected = true;
      select.appendChild(option);
    });

    if (defaultModel && !models.includes(defaultModel)) {
      select.selectedIndex = 0;
    }
  } catch (error) {
    console.error('Failed to load models:', error);
    select.innerHTML = '<option value="">加载失败，将使用默认模型</option>';
  }
}
