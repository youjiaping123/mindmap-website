/**
 * 核心生成流程（SSE 流式）
 * 依赖: state.js, utils.js, ui.js, history.js, markmap.js, chat.js
 */

/**
 * 解析 SSE 数据行，提取 content delta
 * OpenAI SSE 格式: data: {"choices":[{"delta":{"content":"xxx"}}]}
 */
function parseSSEDelta(line) {
  if (!line.startsWith('data: ')) return null;
  const payload = line.slice(6).trim();
  if (payload === '[DONE]') return { done: true };
  try {
    const json = JSON.parse(payload);
    const content = json?.choices?.[0]?.delta?.content;
    return content != null ? { content } : null;
  } catch {
    return null;
  }
}

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

  // 如果正在流式生成，则中止
  if (AppState.isStreaming && AppState.streamAbort) {
    AppState.streamAbort.abort();
    AppState.isStreaming = false;
    setLoading(false);
    return;
  }

  setLoading(true);
  hideError();

  // 提前展示面板
  $('toolbar').style.display = 'flex';
  $('contentArea').style.display = 'flex';
  $('chatSection').style.display = 'flex';
  switchTab('preview');
  clearChat();

  const hero = $('heroSection');
  if (hero) hero.style.display = 'none';

  // 清空旧内容
  AppState.currentMarkdown = '';
  AppState.currentTopic = topic;
  $('markdownContent').textContent = '';

  // 先创建一个空的 markmap 实例
  renderMarkmap('# 生成中...');

  const abortController = new AbortController();
  AppState.streamAbort = abortController;
  AppState.isStreaming = true;

  // 节流更新 markmap
  let renderTimer = null;
  let lastRenderTime = 0;
  const RENDER_INTERVAL = 150; // ms

  function scheduleRender() {
    const now = Date.now();
    if (now - lastRenderTime >= RENDER_INTERVAL) {
      doRender();
    } else if (!renderTimer) {
      renderTimer = setTimeout(doRender, RENDER_INTERVAL - (now - lastRenderTime));
    }
  }

  function doRender() {
    renderTimer = null;
    lastRenderTime = Date.now();
    const md = AppState.currentMarkdown.trim();
    if (md) {
      updateMarkmap(md);
      $('markdownContent').textContent = md;
    }
  }

  try {
    const selectedModel = $('modelSelect').value || '';
    const customPrompt = ($('customPrompt').value || '').trim();

    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, model: selectedModel, customPrompt }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      // 非流式错误响应
      let errMsg = '生成失败，请重试';
      try {
        const errData = await response.json();
        errMsg = errData.error || errMsg;
      } catch {}
      throw new Error(errMsg);
    }

    // 读取 SSE 流
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 按行处理 SSE
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 最后一个可能是不完整的行

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const delta = parseSSEDelta(trimmed);
        if (!delta) continue;
        if (delta.done) break;
        if (delta.content) {
          AppState.currentMarkdown += delta.content;
          scheduleRender();
        }
      }
    }

    // 最终渲染
    if (renderTimer) {
      clearTimeout(renderTimer);
      renderTimer = null;
    }

    const finalMd = AppState.currentMarkdown.trim();
    if (!finalMd) {
      throw new Error('AI 返回了空内容，请重试');
    }

    // 最终完整渲染一次（用 renderMarkmap 确保工具栏等完整）
    renderMarkmap(finalMd);
    $('markdownContent').textContent = finalMd;

    // 保存历史
    saveHistory(topic, finalMd);
    showToast('思维导图生成成功！', 'success');

  } catch (error) {
    if (error.name === 'AbortError') {
      showToast('已取消生成', 'info');
    } else {
      showError(error.message);
    }
  } finally {
    AppState.isStreaming = false;
    AppState.streamAbort = null;
    setLoading(false);
  }
}
