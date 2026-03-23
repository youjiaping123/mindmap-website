/**
 * 对话式修改思维导图（流式 + 闲聊双模式）
 * 依赖: state.js, utils.js, ui.js, markmap.js, markdown-engine.js
 */

/**
 * 判断流式累积的文本是否看起来像 JSON 操作指令
 * 用于流式阶段决定显示"正在生成修改指令"还是直接显示文字
 */
function looksLikeJSON(text) {
  const trimmed = text.trim();
  // 直接以 [ 开头
  if (trimmed.startsWith('[')) return true;
  // 被代码块包裹：```json\n[...
  if (/```[\w]*\s*\[/.test(trimmed)) return true;
  // 含有明显的操作指令特征
  if (/\[\s*\{\s*"op"\s*:/.test(trimmed)) return true;
  return false;
}

/**
 * 从 AI 回复中提取 JSON 数组字符串
 * 支持：直接 JSON、代码块包裹、前后有多余文字等情况
 * 返回 null 表示非操作指令（闲聊）
 */
function extractJSONArray(text) {
  const trimmed = text.trim();

  // 1. 直接以 [ 开头 ] 结尾
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed;
  }

  // 2. 尝试从代码块中提取
  const codeBlockMatch = trimmed.match(/```[\w]*\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    const inner = codeBlockMatch[1].trim();
    if (inner.startsWith('[') && inner.endsWith(']')) {
      return inner;
    }
  }

  // 3. 贪婪匹配最外层 [ ... ]
  const arrayMatch = trimmed.match(/(\[[\s\S]*\])/);
  if (arrayMatch) {
    const candidate = arrayMatch[1].trim();
    // 验证它确实包含操作指令关键字
    if (/"op"\s*:/.test(candidate)) {
      return candidate;
    }
  }

  return null;
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
    const selectedModel = $('chatModelSelect')?.value || $('modelSelect')?.value || '';

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

    if (bubbleEl) bubbleEl.classList.remove('chat-msg-thinking');

    // 流式读取 SSE（复用通用 consumeSSE）
    const { content: rawResponse, finishReason, completedNormally } = await consumeSSE(response.body, {
      onDelta: (_delta, accumulated) => {
        fullResponse = accumulated;
        if (bubbleEl) {
          if (looksLikeJSON(fullResponse)) {
            bubbleEl.textContent = '🔧 正在生成修改指令...';
          } else {
            bubbleEl.textContent = fullResponse;
          }
          const body = $('chatBody');
          if (body) body.scrollTop = body.scrollHeight;
        }
      },
    });

    fullResponse = rawResponse;

    if (!fullResponse) {
      if (bubbleEl) bubbleEl.textContent = '⚠️ AI 返回了空结果，请重试';
      return;
    }

    if (!completedNormally) {
      const incompleteMessage = getUnexpectedStreamEndMessage('回复');
      if (bubbleEl) bubbleEl.textContent = `⚠️ ${incompleteMessage}`;
      console.warn('对话流异常中断：未收到 finish_reason 或 [DONE]');
      showToast(incompleteMessage, 'error', 6000);
      return;
    }

    const finishMessage = getFinishReasonMessage(finishReason, '回复');
    if (finishMessage) {
      showToast(finishMessage, 'info', 5000);
    }

    // 判断模式：尝试提取 JSON 操作指令，否则视为闲聊
    const jsonStr = extractJSONArray(fullResponse);
    if (jsonStr) {
      // === 操作指令模式 ===
      let operations;
      try {
        operations = JSON.parse(jsonStr);
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
      if (typeof syncCurrentMarkdownToActiveVersion === 'function') {
        syncCurrentMarkdownToActiveVersion();
      }

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
  if (typeof syncCurrentMarkdownToActiveVersion === 'function') {
    syncCurrentMarkdownToActiveVersion();
  }
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
  if (typeof syncCurrentMarkdownToActiveVersion === 'function') {
    syncCurrentMarkdownToActiveVersion();
  }
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
