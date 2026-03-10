/**
 * 核心生成流程
 * 依赖: state.js, utils.js, ui.js, history.js, markmap.js, chat.js
 */

/** 生成按钮点击事件 */
async function handleGenerate() {
  const input = $('topicInput');
  const topic = input.value.trim();

  if (!topic) {
    showError('请输入思维导图主题');
    input.focus();
    return;
  }
  if (topic.length > MAX_TOPIC_LENGTH) {
    showError(`主题过长，请控制在 ${MAX_TOPIC_LENGTH} 字以内`);
    input.focus();
    return;
  }

  setLoading(true);
  hideError();

  try {
    const selectedModel = $('modelSelect').value || '';
    const customPrompt = ($('customPrompt').value || '').trim();

    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, model: selectedModel, customPrompt }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || '生成失败，请重试');
    }

    AppState.currentMarkdown = data.markdown;
    AppState.currentTopic = topic;

    saveHistory(topic, data.markdown);
    renderMarkmap(AppState.currentMarkdown);

    $('toolbar').style.display = 'flex';
    $('contentArea').style.display = 'flex';
    $('chatSection').style.display = 'flex';
    clearChat();

    $('markdownContent').textContent = AppState.currentMarkdown;
    switchTab('preview');

    // 生成成功后缩小 hero 区域
    const hero = $('heroSection');
    if (hero) hero.style.display = 'none';

    showToast('思维导图生成成功！', 'success');
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false);
  }
}
