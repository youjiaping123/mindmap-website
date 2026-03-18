// API 公共配置与工具函数

/**
 * 获取 OpenAI API 配置（从环境变量）
 */
function readPositiveIntEnv(name) {
  const raw = process.env[name];
  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getOpenAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const defaultModel = process.env.OPENAI_MODEL || 'claude-sonnet-4-6';
  const sharedMaxTokens = readPositiveIntEnv('OPENAI_MAX_TOKENS');
  const generateMaxTokens = readPositiveIntEnv('OPENAI_GENERATE_MAX_TOKENS') ?? sharedMaxTokens;
  const chatMaxTokens = readPositiveIntEnv('OPENAI_CHAT_MAX_TOKENS') ?? sharedMaxTokens;

  return {
    apiKey,
    baseUrl,
    defaultModel,
    generateMaxTokens,
    chatMaxTokens,
  };
}

/**
 * 选择模型：优先使用用户指定的，否则使用默认
 */
export function resolveModel(userModel, defaultModel) {
  return (userModel && typeof userModel === 'string' && userModel.trim())
    ? userModel.trim()
    : defaultModel;
}

/**
 * 调用 OpenAI Chat Completions API
 */
export async function callChatCompletions({ baseUrl, apiKey, model, messages, temperature = 0.7, maxTokens = null }) {
  const payload = {
    model,
    temperature,
    messages,
  };

  if (Number.isFinite(maxTokens) && maxTokens > 0) {
    payload.max_tokens = maxTokens;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('OpenAI API error:', response.status, errText);
    throw new Error('AI_SERVICE_ERROR');
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content?.trim() || '';
  return content;
}

/**
 * 调用 OpenAI Chat Completions API（流式）
 * 返回 ReadableStream（来自 fetch response.body）
 */
export async function callChatCompletionsStream({ baseUrl, apiKey, model, messages, temperature = 0.7, maxTokens = null }) {
  const payload = {
    model,
    temperature,
    messages,
    stream: true,
  };

  if (Number.isFinite(maxTokens) && maxTokens > 0) {
    payload.max_tokens = maxTokens;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('OpenAI API error:', response.status, errText);
    throw new Error('AI_SERVICE_ERROR');
  }

  return response;
}

/**
 * 将流式响应写入 Vercel Serverless 的 res，作为 SSE 转发
 */
export async function pipeSSE(upstreamResponse, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const reader = upstreamResponse.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
    }
  } catch (err) {
    console.error('SSE pipe error:', err);
  } finally {
    res.end();
  }
}

/**
 * 统一错误响应
 */
export function errorResponse(res, statusCode, message) {
  return res.status(statusCode).json({ error: message });
}

/**
 * 默认系统提示词
 */
export const DEFAULT_SYSTEM_PROMPT = `你是一位专业的思维导图设计师。用户会给你一个主题，你需要围绕该主题生成一份结构清晰、层次分明的思维导图大纲。

## 输出要求

1. 使用 Markdown 标题格式（# 表示中心主题，## 表示一级分支，### 表示二级分支，以此类推）
2. 中心主题只能有一个（一个 #）
3. 一级分支 4-8 个（##），每个一级分支下有 2-5 个二级分支（###）
4. 如有必要可以有三级分支（####），但不要超过四级
5. 每个节点的文字简洁有力，一般不超过 10 个字
6. 直接输出 Markdown 内容，不要用代码块包裹，不要添加任何额外说明

## 示例输出

# 人工智能
## 机器学习
### 监督学习
### 无监督学习
### 强化学习
## 深度学习
### 卷积神经网络
### 循环神经网络
### Transformer
## 自然语言处理
### 文本分类
### 机器翻译
### 对话系统
## 计算机视觉
### 图像识别
### 目标检测
### 图像生成`;
