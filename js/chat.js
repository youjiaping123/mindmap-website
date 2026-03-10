/**
 * 对话式修改思维导图
 * 依赖: state.js, utils.js, ui.js, markmap.js, markdown-engine.js
 */

/** 发送对话消息，局部修改思维导图 */
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
  const thinkingId = appendChatMessage('assistant', '思考中...');

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
        isFirstTurn: AppState.isFirstChatTurn,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || '修改失败，请重试');
    }

    removeChatMessage(thinkingId);

    if (data.mode === 'patch' && Array.isArray(data.operations)) {
      // 保存撤销快照
      AppState.markdownUndoStack.push(AppState.currentMarkdown);
      if (AppState.markdownUndoStack.length > AppState.maxUndoSize) {
        AppState.markdownUndoStack.shift();
      }

      const result = applyOperations(AppState.currentMarkdown, data.operations);

      AppState.chatHistory.push({ role: 'user', content: message });
      AppState.chatHistory.push({ role: 'assistant', content: result.summary.join('; ') });

      AppState.currentMarkdown = result.markdown;
      AppState.isFirstChatTurn = false;
      appendChatMessage('assistant', result.summary.join('\n'));
      updateUndoButton();
    } else if (data.mode === 'fallback') {
      appendChatMessage('assistant', `⚠️ ${data.description || 'AI 返回格式异常，请重试'}`);
      return;
    }

    renderMarkmap(AppState.currentMarkdown);
    $('markdownContent').textContent = AppState.currentMarkdown;
    switchTab('preview');
  } catch (error) {
    removeChatMessage(thinkingId);
    appendChatMessage('assistant', `❌ ${error.message}`);
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
  AppState.isFirstChatTurn = true;
  const list = $('chatMessages');
  if (list) list.innerHTML = '';
  updateUndoButton();
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

  AppState.currentMarkdown = AppState.markdownUndoStack.pop();
  renderMarkmap(AppState.currentMarkdown);
  $('markdownContent').textContent = AppState.currentMarkdown;
  appendChatMessage('assistant', '↩️ 已撤销上一步修改');
  updateUndoButton();
}

/** 更新撤销按钮的可用状态 */
function updateUndoButton() {
  const btn = $('chatUndoBtn');
  if (btn) btn.disabled = AppState.markdownUndoStack.length === 0;
}
