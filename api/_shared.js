// API 公共配置与工具函数
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

let localEnvLoaded = false;

function parseEnvValue(rawValue) {
  const value = rawValue.trim();
  const isWrappedInSingleQuotes = value.startsWith("'") && value.endsWith("'");
  const isWrappedInDoubleQuotes = value.startsWith('"') && value.endsWith('"');

  if (isWrappedInSingleQuotes || isWrappedInDoubleQuotes) {
    const unwrapped = value.slice(1, -1);
    return isWrappedInDoubleQuotes
      ? unwrapped.replace(/\\n/g, '\n').replace(/\\r/g, '\r')
      : unwrapped;
  }

  return value;
}

function loadLocalEnvFiles() {
  if (localEnvLoaded) return;
  localEnvLoaded = true;

  const protectedKeys = new Set(Object.keys(process.env));
  const envFileNames = ['.env', '.env.local'];

  for (const fileName of envFileNames) {
    const filePath = path.join(PROJECT_ROOT, fileName);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const normalized = trimmed.startsWith('export ')
        ? trimmed.slice(7).trim()
        : trimmed;
      const separatorIndex = normalized.indexOf('=');

      if (separatorIndex <= 0) continue;

      const key = normalized.slice(0, separatorIndex).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

      const rawValue = normalized.slice(separatorIndex + 1);
      if (!protectedKeys.has(key) || process.env[key] == null) {
        process.env[key] = parseEnvValue(rawValue);
      }
    }
  }
}

loadLocalEnvFiles();

function normalizeOpenAIBaseUrl(rawBaseUrl) {
  const fallback = 'https://api.openai.com/v1';
  const candidate = (typeof rawBaseUrl === 'string' && rawBaseUrl.trim())
    ? rawBaseUrl.trim()
    : fallback;

  try {
    const url = new URL(candidate);
    let pathname = url.pathname.replace(/\/+$/, '');

    // Most OpenAI-compatible services expose endpoints under /v1.
    if (!pathname) {
      pathname = '/v1';
    }

    url.pathname = pathname;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

export function buildOpenAIUrl(baseUrl, endpointPath) {
  return `${baseUrl.replace(/\/+$/, '')}/${endpointPath.replace(/^\/+/, '')}`;
}

/**
 * 获取 OpenAI API 配置（从环境变量）
 */
function readPositiveIntEnv(name) {
  const raw = process.env[name];
  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getHeader(req, name) {
  const value = req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] || '';
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOrigin(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') return '';
  try {
    const url = new URL(rawValue);
    return url.origin;
  } catch {
    return '';
  }
}

function parseCsvOrigins(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') return [];
  const parsed = [];
  for (const part of rawValue.split(',')) {
    const normalized = normalizeOrigin(part.trim());
    if (normalized) parsed.push(normalized);
  }
  return parsed;
}

function getRequestHost(req) {
  return getHeader(req, 'x-forwarded-host') || getHeader(req, 'host');
}

function getRequestProtocol(req) {
  const forwardedProto = getHeader(req, 'x-forwarded-proto');
  if (forwardedProto) {
    return forwardedProto.split(',')[0].trim();
  }

  const host = getRequestHost(req);
  if (host && (host.includes('localhost') || host.includes('127.0.0.1'))) {
    return 'http';
  }
  return 'https';
}

function getDefaultAllowedOrigins(req) {
  const allowed = new Set();
  const host = getRequestHost(req);
  const proto = getRequestProtocol(req);
  if (host) {
    allowed.add(`${proto}://${host}`);
  }
  return allowed;
}

function isLoopbackOrigin(origin) {
  if (!origin) return false;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

function parseOriginFromRequest(req) {
  const origin = normalizeOrigin(getHeader(req, 'origin'));
  if (origin) return origin;

  const referer = getHeader(req, 'referer');
  if (referer) return normalizeOrigin(referer);

  return '';
}

function getRequestIp(req) {
  const forwardedFor = getHeader(req, 'x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = getHeader(req, 'x-real-ip');
  if (realIp) return realIp;
  const socketIp = req?.socket?.remoteAddress;
  return typeof socketIp === 'string' && socketIp ? socketIp : 'unknown';
}

function getRouteKeyLabel(routeKey) {
  if (routeKey === 'generate' || routeKey === 'chat' || routeKey === 'models') {
    return routeKey;
  }
  return 'default';
}

const rateLimitStore = new Map();
const dailyQuotaStore = new Map();
let lastQuotaCleanupDate = '';

function readRouteRateLimit(routeKey) {
  const normalized = getRouteKeyLabel(routeKey);
  if (normalized === 'generate') {
    return readPositiveIntEnv('API_RATE_LIMIT_GENERATE_PER_WINDOW') ?? 20;
  }
  if (normalized === 'chat') {
    return readPositiveIntEnv('API_RATE_LIMIT_CHAT_PER_WINDOW') ?? 20;
  }
  if (normalized === 'models') {
    return readPositiveIntEnv('API_RATE_LIMIT_MODELS_PER_WINDOW') ?? 60;
  }
  return readPositiveIntEnv('API_RATE_LIMIT_DEFAULT_PER_WINDOW') ?? 20;
}

function readRateLimitWindowMs() {
  return readPositiveIntEnv('API_RATE_LIMIT_WINDOW_MS') ?? 60_000;
}

function readDailyQuota() {
  return readPositiveIntEnv('API_DAILY_QUOTA') ?? 800;
}

function cleanupDailyQuotaStoreIfNeeded(dateKey) {
  if (lastQuotaCleanupDate === dateKey) return;
  lastQuotaCleanupDate = dateKey;
  for (const key of dailyQuotaStore.keys()) {
    if (!key.startsWith(`${dateKey}|`)) {
      dailyQuotaStore.delete(key);
    }
  }
}

function checkRateLimit(routeKey, identity) {
  const limit = readRouteRateLimit(routeKey);
  const windowMs = readRateLimitWindowMs();
  const now = Date.now();
  const key = `${getRouteKeyLabel(routeKey)}|${identity}`;

  const entry = rateLimitStore.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    rateLimitStore.set(key, { windowStart: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (entry.count >= limit) {
    const retryAfterMs = Math.max(0, entry.windowStart + windowMs - now);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  entry.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

function checkDailyQuota(identity) {
  const dailyQuota = readDailyQuota();
  const dateKey = new Date().toISOString().slice(0, 10);
  cleanupDailyQuotaStoreIfNeeded(dateKey);

  const key = `${dateKey}|${identity}`;
  const used = dailyQuotaStore.get(key) || 0;
  if (used >= dailyQuota) {
    return { allowed: false };
  }

  dailyQuotaStore.set(key, used + 1);
  return { allowed: true };
}

function authorizeRequest(req) {
  const requiredToken = process.env.API_AUTH_TOKEN?.trim();
  const incomingToken = getHeader(req, 'x-app-token');
  const tokenMatched = Boolean(requiredToken) && incomingToken && incomingToken === requiredToken;

  if (tokenMatched) {
    return {
      allowed: true,
      isTrustedRequest: true,
      identity: 'token:trusted',
    };
  }

  const requestOrigin = parseOriginFromRequest(req);
  if (!requestOrigin) {
    return {
      allowed: false,
      isTrustedRequest: false,
      identity: `ip:${getRequestIp(req)}`,
      reason: 'missing_origin',
    };
  }

  const allowedOriginsFromEnv = parseCsvOrigins(process.env.ALLOWED_ORIGINS);
  const envOriginSet = new Set(allowedOriginsFromEnv);
  const defaultAllowedOrigins = getDefaultAllowedOrigins(req);

  let originAllowed = false;
  if (envOriginSet.size > 0) {
    originAllowed = envOriginSet.has(requestOrigin);
  } else {
    originAllowed = defaultAllowedOrigins.has(requestOrigin) || isLoopbackOrigin(requestOrigin);
  }

  if (!originAllowed) {
    return {
      allowed: false,
      isTrustedRequest: false,
      identity: `ip:${getRequestIp(req)}`,
      reason: 'origin_not_allowed',
    };
  }

  return {
    allowed: true,
    isTrustedRequest: false,
    identity: `ip:${getRequestIp(req)}`,
  };
}

export function guardApiRequest(req, res, { routeKey = 'default' } = {}) {
  const auth = authorizeRequest(req);
  if (!auth.allowed) {
    return {
      ok: false,
      context: null,
      response: errorResponse(res, 401, 'Unauthorized request'),
    };
  }

  const rateResult = checkRateLimit(routeKey, auth.identity);
  if (!rateResult.allowed) {
    res.setHeader('Retry-After', String(rateResult.retryAfterSeconds));
    return {
      ok: false,
      context: null,
      response: errorResponse(res, 429, 'Too many requests, please retry later'),
    };
  }

  const quotaResult = checkDailyQuota(auth.identity);
  if (!quotaResult.allowed) {
    res.setHeader('Retry-After', '86400');
    return {
      ok: false,
      context: null,
      response: errorResponse(res, 429, 'Daily quota exceeded, please retry tomorrow'),
    };
  }

  return {
    ok: true,
    response: null,
    context: {
      isTrustedRequest: auth.isTrustedRequest,
      identity: auth.identity,
    },
  };
}

export function getOpenAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = normalizeOpenAIBaseUrl(process.env.OPENAI_BASE_URL);
  const defaultModel = process.env.OPENAI_MODEL || 'claude-sonnet-4-6';
  const sharedMaxTokens = readPositiveIntEnv('OPENAI_MAX_TOKENS');
  const generateMaxTokens = readPositiveIntEnv('OPENAI_GENERATE_MAX_TOKENS') ?? sharedMaxTokens;
  const chatMaxTokens = readPositiveIntEnv('OPENAI_CHAT_MAX_TOKENS') ?? sharedMaxTokens;
  const maxCustomPromptLength = readPositiveIntEnv('API_MAX_CUSTOM_PROMPT_LENGTH') ?? 30_000;
  const maxCurrentMarkdownLength = readPositiveIntEnv('API_MAX_CURRENT_MARKDOWN_LENGTH') ?? 20_000;
  const maxChatHistoryLength = readPositiveIntEnv('API_MAX_CHAT_HISTORY_LENGTH') ?? 10_000;
  const trustedMaxCustomPromptLength = readPositiveIntEnv('API_TRUSTED_MAX_CUSTOM_PROMPT_LENGTH')
    ?? Math.max(maxCustomPromptLength, 60_000);
  const trustedMaxCurrentMarkdownLength = readPositiveIntEnv('API_TRUSTED_MAX_CURRENT_MARKDOWN_LENGTH')
    ?? Math.max(maxCurrentMarkdownLength, 40_000);
  const trustedMaxChatHistoryLength = readPositiveIntEnv('API_TRUSTED_MAX_CHAT_HISTORY_LENGTH')
    ?? Math.max(maxChatHistoryLength, 20_000);

  return {
    apiKey,
    baseUrl,
    defaultModel,
    generateMaxTokens,
    chatMaxTokens,
    maxCustomPromptLength,
    maxCurrentMarkdownLength,
    maxChatHistoryLength,
    trustedMaxCustomPromptLength,
    trustedMaxCurrentMarkdownLength,
    trustedMaxChatHistoryLength,
  };
}

export function getBodySizeLimits(config, isTrustedRequest = false) {
  if (isTrustedRequest) {
    return {
      maxCustomPromptLength: config.trustedMaxCustomPromptLength,
      maxCurrentMarkdownLength: config.trustedMaxCurrentMarkdownLength,
      maxChatHistoryLength: config.trustedMaxChatHistoryLength,
    };
  }

  return {
    maxCustomPromptLength: config.maxCustomPromptLength,
    maxCurrentMarkdownLength: config.maxCurrentMarkdownLength,
    maxChatHistoryLength: config.maxChatHistoryLength,
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

  const response = await fetch(buildOpenAIUrl(baseUrl, 'chat/completions'), {
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
    throw new Error('AI_SERVICE_ERROR');
  }

  return response;
}

/**
 * 将流式响应写入 Vercel Serverless 的 res，作为 SSE 转发
 */
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
