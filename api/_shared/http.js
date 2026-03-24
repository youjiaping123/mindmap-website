import { buildOpenAIUrl } from './env.js';

export function errorResponse(res, statusCode, message) {
  return res.status(statusCode).json({ error: message });
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
    temperature,
    messages,
    stream: true,
  };

  if (Number.isFinite(maxTokens) && maxTokens > 0) {
    payload.max_tokens = maxTokens;
  }

  const response = await fetch(buildOpenAIUrl(baseUrl, 'chat/completions'), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('OpenAI API error:', response.status, errText);
    const compact = String(errText || '').replace(/\s+/g, ' ').trim();
    throw new Error(`AI_SERVICE_ERROR:${response.status}:${compact.slice(0, 500)}`);
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
