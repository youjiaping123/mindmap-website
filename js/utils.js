/**
 * 通用工具函数
 */

/** HTML 转义，防止 XSS */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
