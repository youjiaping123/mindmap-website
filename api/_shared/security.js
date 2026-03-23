import { errorResponse } from './http.js';

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
