/**
 * 模型列表加载
 * 依赖: utils.js
 */

const CHAT_DEFAULT_MODEL = 'gpt-4o-mini';

/** 从后端获取可用模型列表并填充下拉框 */
async function loadModels() {
  const select = $('modelSelect');
  const chatSelect = $('chatModelSelect');
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
      if (chatSelect) chatSelect.innerHTML = '<option value="">无可用模型</option>';
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

    // 填充对话专用模型选择器
    if (chatSelect) {
      chatSelect.innerHTML = '';
      let chatDefaultFound = false;

      models.forEach((modelId) => {
        const option = document.createElement('option');
        option.value = modelId;
        option.textContent = modelId;
        // 优先选中 gpt-4o-mini，否则用与生成相同的默认模型
        if (modelId === CHAT_DEFAULT_MODEL) {
          option.selected = true;
          chatDefaultFound = true;
        }
        chatSelect.appendChild(option);
      });

      // 如果模型列表中没有 gpt-4o-mini，选择默认模型
      if (!chatDefaultFound) {
        for (const opt of chatSelect.options) {
          if (opt.value === defaultModel) {
            opt.selected = true;
            break;
          }
        }
        if (chatSelect.selectedIndex < 0) chatSelect.selectedIndex = 0;
      }
    }
  } catch (error) {
    console.error('Failed to load models:', error);
    select.innerHTML = '<option value="">加载失败，将使用默认模型</option>';
    if (chatSelect) chatSelect.innerHTML = '<option value="">加载失败</option>';
  }
}
