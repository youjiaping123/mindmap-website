// Vercel Serverless Function - 生成思维导图（SSE 流式）
import {
  getOpenAIConfig,
  resolveModel,
  callChatCompletionsStream,
  pipeSSE,
  errorResponse,
  DEFAULT_SYSTEM_PROMPT,
} from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return errorResponse(res, 405, 'Method not allowed');
  }

  const { apiKey, baseUrl, defaultModel } = getOpenAIConfig();
  if (!apiKey) {
    return errorResponse(res, 500, 'OPENAI_API_KEY is not configured');
  }

  try {
    const { topic, model, customPrompt } = req.body;

    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return errorResponse(res, 400, 'Please provide a valid topic');
    }
    if (topic.length > 200) {
      return errorResponse(res, 400, 'Topic is too long (max 200 chars)');
    }

    const selectedModel = resolveModel(model, defaultModel);

    const useCustom = customPrompt && typeof customPrompt === 'string' && customPrompt.trim();
    const systemPrompt = useCustom ? customPrompt.trim() : DEFAULT_SYSTEM_PROMPT;
    const userMessage = useCustom
      ? topic.trim()
      : `请为以下主题生成思维导图大纲：${topic.trim()}`;

    const upstreamResponse = await callChatCompletionsStream({
      baseUrl,
      apiKey,
      model: selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      maxTokens: 4096,
    });

    // 以 SSE 流式转发给前端
    await pipeSSE(upstreamResponse, res);
  } catch (error) {
    if (error.message === 'AI_SERVICE_ERROR') {
      return errorResponse(res, 502, 'AI service error, please try again later');
    }
    console.error('Server error:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
}
