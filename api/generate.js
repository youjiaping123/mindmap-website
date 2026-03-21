// Vercel Serverless Function - 生成思维导图（SSE 流式）
import {
  getOpenAIConfig,
  getBodySizeLimits,
  guardApiRequest,
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

  const guard = guardApiRequest(req, res, { routeKey: 'generate' });
  if (!guard.ok) return guard.response;

  const config = getOpenAIConfig();
  const { apiKey, baseUrl, defaultModel, generateMaxTokens } = config;
  if (!apiKey) {
    return errorResponse(res, 500, 'OPENAI_API_KEY is not configured');
  }

  try {
    const { topic, model, customPrompt, temperature: reqTemp } = req.body;
    const { maxCustomPromptLength } = getBodySizeLimits(config, guard.context.isTrustedRequest);

    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return errorResponse(res, 400, 'Please provide a valid topic');
    }
    if (topic.length > 200) {
      return errorResponse(res, 400, 'Topic is too long (max 200 chars)');
    }
    if (customPrompt != null && typeof customPrompt !== 'string') {
      return errorResponse(res, 400, 'customPrompt must be a string');
    }
    if (typeof customPrompt === 'string' && customPrompt.trim().length > maxCustomPromptLength) {
      return errorResponse(res, 400, `customPrompt is too long (max ${maxCustomPromptLength} chars)`);
    }

    const selectedModel = resolveModel(model, defaultModel);

    // 支持前端自定义 temperature（用于多版本生成）
    const temperature = (typeof reqTemp === 'number' && reqTemp >= 0 && reqTemp <= 2)
      ? reqTemp : 0.7;

    const useCustom = customPrompt && typeof customPrompt === 'string' && customPrompt.trim();
    const systemPrompt = useCustom ? customPrompt.trim() : DEFAULT_SYSTEM_PROMPT;
    const userMessage = useCustom
      ? topic.trim()
      : `请为以下主题生成思维导图大纲：${topic.trim()}`;

    const upstreamAbortController = new AbortController();
    const upstreamResponse = await callChatCompletionsStream({
      baseUrl,
      apiKey,
      model: selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature,
      maxTokens: generateMaxTokens,
      signal: upstreamAbortController.signal,
    });

    // 以 SSE 流式转发给前端
    await pipeSSE(upstreamResponse, req, res, upstreamAbortController);
  } catch (error) {
    if (error.message === 'AI_SERVICE_ERROR') {
      return errorResponse(res, 502, 'AI service error, please try again later');
    }
    console.error('Server error:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
}
