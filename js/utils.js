/**
 * 通用工具函数
 */

/** HTML 转义，防止 XSS */
const _HTML_ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => _HTML_ESCAPE_MAP[c]);
}

/** 相对时间格式化 */
function formatTime(date) {
  const now = new Date();
  const diff = now - date;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

/** 获取 DOM 元素的简写（仅 ID 选择） */
function $(id) {
  return document.getElementById(id);
}

/** 提取兼容 OpenAI 风格 content 字段中的文本 */
function extractLLMTextContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content.map((part) => {
    if (typeof part === 'string') return part;
    if (!part || typeof part !== 'object') return '';
    if (typeof part.text === 'string') return part.text;
    if (part.text && typeof part.text.value === 'string') return part.text.value;
    if (typeof part.value === 'string') return part.value;
    return '';
  }).join('');
}

/** 解析 OpenAI 兼容 SSE 数据行 */
function parseOpenAICompatibleSSELine(line) {
  if (!line.startsWith('data: ')) return null;

  const payload = line.slice(6).trim();
  if (!payload) return null;
  if (payload === '[DONE]') return { done: true };

  try {
    const json = JSON.parse(payload);
    if (json?.error?.message) {
      return { errorMessage: json.error.message };
    }

    const choice = json?.choices?.[0];
    const content = extractLLMTextContent(choice?.delta?.content);

    return {
      content: content || null,
      finishReason: choice?.finish_reason || null,
      errorMessage: null,
    };
  } catch {
    return null;
  }
}

/** 将 finish_reason 转换为可读提示 */
function getFinishReasonMessage(finishReason, label = '输出') {
  if (!finishReason || finishReason === 'stop') return '';

  switch (finishReason) {
    case 'length':
    case 'max_tokens':
      return `AI ${label}达到 token 上限，结果可能被截断`;
    case 'content_filter':
      return `AI ${label}触发内容过滤，结果被拦截或截断`;
    default:
      return `AI ${label}提前结束（finish_reason: ${finishReason}）`;
  }
}

/** 流式连接未正常收尾时的提示 */
function getUnexpectedStreamEndMessage(label = '输出') {
  return `AI ${label}的流式连接提前结束，结果可能不完整；这更像是网络/代理/Vercel 超时，而不是 max_tokens`;
}

/**
 * 通用 SSE 流消费器
 * 统一处理 ReadableStream → SSE 行解析 → delta 分发
 * @param {ReadableStream} readableStream - response.body
 * @param {Object} callbacks
 * @param {function} [callbacks.onDelta] - (content, accumulated) => void
 * @param {function} [callbacks.onFinishReason] - (reason) => void
 * @returns {Promise<{ content: string, finishReason: string|null, completedNormally: boolean }>}
 */
async function consumeSSE(readableStream, callbacks = {}) {
  const reader = readableStream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';
  let finishReason = null;
  let sawDone = false;
  let sseFinished = false;

  function consumeLine(line) {
    const delta = parseOpenAICompatibleSSELine(line);
    if (!delta) return false;
    if (delta.errorMessage) throw new Error(delta.errorMessage);
    if (delta.finishReason) {
      finishReason = delta.finishReason;
      if (callbacks.onFinishReason) callbacks.onFinishReason(delta.finishReason);
    }
    if (delta.done) {
      sawDone = true;
      return true;
    }
    if (delta.content) {
      accumulated += delta.content;
      if (callbacks.onDelta) callbacks.onDelta(delta.content, accumulated);
    }
    return false;
  }

  while (!sseFinished) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (consumeLine(trimmed)) {
        sseFinished = true;
        break;
      }
    }
  }

  const trailingLine = buffer.trim();
  if (trailingLine && !sseFinished) {
    consumeLine(trailingLine);
  }

  return {
    content: accumulated.trim(),
    finishReason,
    completedNormally: sawDone || !!finishReason,
  };
}
