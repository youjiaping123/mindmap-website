import { buildOpenAIUrl } from './env.js';

export function errorResponse(res, statusCode, message) {
  return res.status(statusCode).json({ error: message });
}

/** 已知不接受自定义 temperature 的模型（如 claude-sonnet-5-5），同一实例内后续请求直接省略该参数 */
const modelsRejectingTemperature = new Set();

function isTemperatureRejection(status, errText) {
  return status === 400 && /temperature/i.test(errText || '');
}

function serviceError(status, errText) {
  console.error('OpenAI API error:', status, errText);
  const compact = String(errText || '').replace(/\s+/g, ' ').trim();
  return new Error(`AI_SERVICE_ERROR:${status}:${compact.slice(0, 500)}`);
}

/** 解析 callChatCompletionsStream 抛出的上游错误，非上游错误返回 null */
export function parseAIServiceError(error) {
  const match = typeof error?.message === 'string'
    ? error.message.match(/^AI_SERVICE_ERROR:(\d+):([\s\S]*)$/)
    : null;
  return match ? { statusCode: match[1], detail: match[2] } : null;
}

export async function callChatCompletionsStream({
  baseUrl,
  apiKey,
  model,
  messages,
  temperature = 0.7,
  maxTokens = null,
  signal = undefined,
}) {
  const payload = {
    model,
    messages,
    stream: true,
  };

  if (!modelsRejectingTemperature.has(model)) {
    payload.temperature = temperature;
  }

  if (Number.isFinite(maxTokens) && maxTokens > 0) {
    payload.max_tokens = maxTokens;
  }

  const send = () => fetch(buildOpenAIUrl(baseUrl, 'chat/completions'), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  });

  let response = await send();

  // 部分模型不支持自定义 temperature，去掉该参数重试一次
  if (!response.ok && 'temperature' in payload) {
    const errText = await response.text();
    if (!isTemperatureRejection(response.status, errText)) {
      throw serviceError(response.status, errText);
    }
    console.warn(`Model ${model} rejected temperature, retrying without it`);
    modelsRejectingTemperature.add(model);
    delete payload.temperature;
    response = await send();
  }

  if (!response.ok) {
    throw serviceError(response.status, await response.text());
  }

  return response;
}

export async function pipeSSE(upstreamResponse, req, res, upstreamAbortController = null) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  if (!upstreamResponse?.body) {
    res.end();
    return;
  }

  const reader = upstreamResponse.body.getReader();
  const decoder = new TextDecoder();
  let clientDisconnected = false;

  const abortUpstream = () => {
    if (upstreamAbortController && !upstreamAbortController.signal.aborted) {
      upstreamAbortController.abort();
    }
  };

  const handleDisconnect = () => {
    clientDisconnected = true;
    abortUpstream();
    reader.cancel('client_disconnected').catch(() => {});
  };

  req.on('aborted', handleDisconnect);
  req.on('close', handleDisconnect);
  res.on('close', handleDisconnect);
  res.on('error', handleDisconnect);

  try {
    while (!clientDisconnected) {
      const { done, value } = await reader.read();
      if (done) break;
      if (clientDisconnected) break;
      const chunk = decoder.decode(value, { stream: true });
      if (!res.writableEnded) {
        res.write(chunk);
      }
    }
  } catch (err) {
    if (!clientDisconnected && err?.name !== 'AbortError') {
      console.error('SSE pipe error:', err);
    }
  } finally {
    req.off('aborted', handleDisconnect);
    req.off('close', handleDisconnect);
    res.off('close', handleDisconnect);
    res.off('error', handleDisconnect);
    if (!res.writableEnded) {
      res.end();
    }
  }
}
