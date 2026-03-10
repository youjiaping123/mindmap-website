/**
 * 对话式修改思维导图（流式 + 闲聊双模式）
 * 依赖: state.js, utils.js, ui.js, markmap.js, markdown-engine.js
 */

/**
 * 解析 SSE 数据行，提取 content delta
 */
function parseChatSSEDelta(line) {
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

/** 发送对话消息（流式） */
async function handleChat() {
  const input = $('chatInput');
  const message = input.value.trim();

  if (!message) return;
  if (message.length > MAX_CHAT_MESSAGE_LENGTH) {
    showError(`消息过长，请控制在 ${MAX_CHAT_MESSAGE_LENGTH} 字以内`);
    return;
  }
  if (!AppState.currentMarkdown) {
    showError('请先生成一个思维导图，再使用对话功能');
    return;
  }
  if (AppState.chatLoading) return;

  appendChatMessage('user', message);
  input.value = '';
  input.style.height = 'auto';

  setChatLoading(true);

  // 创建一个空的 assistant 气泡，后续流式填充
  const assistantMsgId = appendChatMessage('assistant', '');
  const bubbleEl = document.querySelector(`#${assistantMsgId} .chat-msg-bubble`);
  if (bubbleEl) bubbleEl.classList.add('chat-msg-thinking');

  let fullResponse = '';

  try {
    const selectedModel = $('modelSelect').value || '';

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentMarkdown: AppState.currentMarkdown,
        message,
        model: selectedModel,
        history: AppState.chatHistory.slice(-6),
      }),
    });

    if (!response.ok) {
      let errMsg = '修改失败，请重试';
      try {
        const errData = await response.json();
        errMsg = errData.error || errMsg;
      } catch {}
      throw new Error(errMsg);
    }

    // 流式读取 SSE
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    if (bubbleEl) bubbleEl.classList.remove('chat-msg-thinking');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const delta = parseChatSSEDelta(trimmed);
        if (!delta) continue;
        if (delta.done) break;
        if (delta.content) {
          fullResponse += delta.content;
          // 流式更新气泡内容
          if (bubbleEl) {
            // 如果看起来是 JSON 操作指令，显示处理中提示
            if (fullResponse.trimStart().startsWith('[')) {
              bubbleEl.textContent = '🔧 正在生成修改指令...';
            } else {
              bubbleEl.textContent = fullResponse;
            }
            // 自动滚动
            const body = $('chatBody');
            if (body) body.scrollTop = body.scrollHeight;
          }
        }
      }
    }

    fullResponse = fullResponse.trim();

    if (!fullResponse) {
      if (bubbleEl) bubbleEl.textContent = '⚠️ AI 返回了空结果，请重试';
      return;
    }

    // 判断模式：以 [ 开头视为操作指令，否则视为闲聊
    if (fullResponse.startsWith('[')) {
      // === 操作指令模式 ===
      let raw = fullResponse;
      // 清理可能的代码块包裹
      raw = raw.replace(/^[\s\S]*?```[\w]*\n?/, '').replace(/\n?```[\s\S]*$/, '');
      if (!raw.trim().startsWith('[')) {
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (jsonMatch) raw = jsonMatch[0];
      }
      raw = raw.trim();

      let operations;
      try {
        operations = JSON.parse(raw);
        if (!Array.isArray(operations)) operations = [operations];
      } catch {
        if (bubbleEl) bubbleEl.textContent = '⚠️ AI 返回格式异常，请重试';
        return;
      }

      // 空数组
      if (operations.length === 0) {
        if (bubbleEl) bubbleEl.textContent = '🤔 没有识别到需要修改的内容，请描述具体要修改哪个节点。';
        AppState.chatHistory.push({ role: 'user', content: message });
        AppState.chatHistory.push({ role: 'assistant', content: '没有识别到修改指令' });
        return;
      }

      // 保存撤销快照
      AppState.markdownUndoStack.push(AppState.currentMarkdown);
      if (AppState.markdownUndoStack.length > AppState.maxUndoSize) {
        AppState.markdownUndoStack.shift();
      }
      AppState.markdownRedoStack = [];

      const result = applyOperations(AppState.currentMarkdown, operations);

      AppState.chatHistory.push({ role: 'user', content: message });
      AppState.chatHistory.push({ role: 'assistant', content: result.summary.join('; ') });

      AppState.currentMarkdown = result.markdown;

      // 更新气泡为操作摘要
      if (bubbleEl) bubbleEl.textContent = result.summary.join('\n');
      updateUndoRedoButtons();

      renderMarkmap(AppState.currentMarkdown);
      $('markdownContent').textContent = AppState.currentMarkdown;
      switchTab('preview');

    } else {
      // === 闲聊模式 ===
      // 气泡内容已经流式更新好了，只需保存历史
      AppState.chatHistory.push({ role: 'user', content: message });
      AppState.chatHistory.push({ role: 'assistant', content: fullResponse });
    }

  } catch (error) {
    if (bubbleEl) {
      bubbleEl.classList.remove('chat-msg-thinking');
      bubbleEl.textContent = `❌ ${error.message}`;
    }
  } finally {
    setChatLoading(false);
  }
}

/** 追加一条聊天消息到界面 */
function appendChatMessage(role, content) {
  const list = $('chatMessages');
  if (!list) return null;

  const id = 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const isThinking = role === 'assistant' && content === '思考中...';

  const div = document.createElement('div');
  div.className = `chat-msg chat-msg-${role}`;
  div.id = id;
  div.innerHTML = `
    <div class="chat-msg-avatar">${role === 'user' ? '👤' : '🤖'}</div>
    <div class="chat-msg-bubble ${isThinking ? 'chat-msg-thinking' : ''}">${escapeHtml(content)}</div>
  `;
  list.appendChild(div);

  const body = $('chatBody');
  if (body) body.scrollTop = body.scrollHeight;

  return id;
}

/** 移除一条聊天消息 */
function removeChatMessage(id) {
  const el = $(id);
  if (el) el.remove();
}

/** 设置对话加载状态 */
function setChatLoading(loading) {
  AppState.chatLoading = loading;
  const btn = $('chatSendBtn');
  const input = $('chatInput');
  if (btn) btn.disabled = loading;
  if (input) input.disabled = loading;
}

/** 清空对话记录 */
function clearChat() {
  AppState.chatHistory = [];
  AppState.markdownUndoStack = [];
  AppState.markdownRedoStack = [];
  const list = $('chatMessages');
  if (list) list.innerHTML = '';
  updateUndoRedoButtons();
}

/** 使用快捷指令 */
function useChatQuick(text) {
  const input = $('chatInput');
  if (input) {
    input.value = text;
    input.focus();
  }
}

/** 撤销上一次对话修改 */
function undoChat() {
  if (AppState.markdownUndoStack.length === 0) return;

  // 当前状态存入重做栈
  AppState.markdownRedoStack.push(AppState.currentMarkdown);

  AppState.currentMarkdown = AppState.markdownUndoStack.pop();
  renderMarkmap(AppState.currentMarkdown);
  $('markdownContent').textContent = AppState.currentMarkdown;
  appendChatMessage('assistant', '↩️ 已撤销上一步修改');
  updateUndoRedoButtons();
}

/** 重做（回退撤销） */
function redoChat() {
  if (AppState.markdownRedoStack.length === 0) return;

  // 当前状态存入撤销栈
  AppState.markdownUndoStack.push(AppState.currentMarkdown);

  AppState.currentMarkdown = AppState.markdownRedoStack.pop();
  renderMarkmap(AppState.currentMarkdown);
  $('markdownContent').textContent = AppState.currentMarkdown;
  appendChatMessage('assistant', '↪️ 已重做修改');
  updateUndoRedoButtons();
}

/** 更新撤销/重做按钮的可用状态 */
function updateUndoRedoButtons() {
  const undoBtn = $('chatUndoBtn');
  const redoBtn = $('chatRedoBtn');
  if (undoBtn) undoBtn.disabled = AppState.markdownUndoStack.length === 0;
  if (redoBtn) redoBtn.disabled = AppState.markdownRedoStack.length === 0;
}
