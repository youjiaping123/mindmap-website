// 邮箱验证码登录：验证码、会话与每用户额度（数据存储在 Upstash Redis）
import crypto from 'node:crypto';
import { errorResponse } from './http.js';
import { incrementWithExpiry, isRedisConfigured, redis } from './redis.js';
import { getRequestIp } from './security.js';

export const SESSION_COOKIE = 'mm_session';

const SESSION_TTL_SECONDS = 30 * 24 * 3600;
const CODE_TTL_SECONDS = 10 * 60;
const CODE_MAX_ATTEMPTS = 5;
const SEND_COOLDOWN_SECONDS = 60;
const SEND_PER_EMAIL_PER_DAY = 10;
const SEND_PER_IP_PER_HOUR = 20;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readPositiveIntEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** 是否开启登录（AUTH_ENABLED=true 时，生成与对话接口要求登录） */
export function isAuthEnabled() {
  return ['1', 'true', 'yes'].includes(String(process.env.AUTH_ENABLED || '').trim().toLowerCase());
}

export function getUserLimits() {
  return {
    dailyQuota: readPositiveIntEnv('USER_DAILY_QUOTA', 50),
    perMinute: readPositiveIntEnv('USER_RATE_LIMIT_PER_MINUTE', 10),
  };
}

export function normalizeEmail(raw) {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : '';
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** 按北京时间计算日期，额度在北京时间零点重置 */
function beijingDate() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function parseCookies(req) {
  const header = req?.headers?.cookie || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function sessionCookie(value, maxAge) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

/** 认证相关的服务端配置是否齐全，缺失时返回提示文案 */
export function getAuthConfigError({ needsMail = false } = {}) {
  if (!isRedisConfigured()) return '登录服务未配置（缺少 Redis）';
  if (needsMail && !(process.env.RESEND_API_KEY && process.env.MAIL_FROM)) return '登录服务未配置（缺少发信服务）';
  return '';
}

async function sendLoginCodeEmail(email, code) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [email],
      subject: `ZevenAI 登录验证码：${code}`,
      text: `你的登录验证码是 ${code}，${CODE_TTL_SECONDS / 60} 分钟内有效。\n如果不是你本人操作，请忽略这封邮件。`,
    }),
  });
  if (!response.ok) {
    console.error('Resend error:', response.status, await response.text());
    throw new Error('MAIL_SEND_FAILED');
  }
}

/**
 * 发送登录验证码
 * @returns {Promise<{ ok: true } | { ok: false, status: number, error: string }>}
 */
export async function sendLoginCode(req, email) {
  const cooldownSet = await redis('SET', `auth:send-cooldown:${email}`, '1', 'EX', SEND_COOLDOWN_SECONDS, 'NX');
  if (!cooldownSet) {
    return { ok: false, status: 429, error: `发送太频繁，请 ${SEND_COOLDOWN_SECONDS} 秒后再试` };
  }

  const hourKey = new Date().toISOString().slice(0, 13);
  const ipCount = await incrementWithExpiry(`auth:send-ip:${getRequestIp(req)}:${hourKey}`, 3600);
  const emailCount = await incrementWithExpiry(`auth:send-email:${email}:${beijingDate()}`, 2 * 24 * 3600);
  if (ipCount > SEND_PER_IP_PER_HOUR || emailCount > SEND_PER_EMAIL_PER_DAY) {
    return { ok: false, status: 429, error: '验证码发送次数过多，请稍后再试' };
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await redis('SET', `auth:code:${email}`, sha256(`${email}:${code}`), 'EX', CODE_TTL_SECONDS);
  await redis('DEL', `auth:code-attempts:${email}`);
  try {
    await sendLoginCodeEmail(email, code);
  } catch (error) {
    // 发送失败时允许立即重试
    await redis('DEL', `auth:send-cooldown:${email}`);
    throw error;
  }
  return { ok: true };
}

/**
 * 校验验证码，成功后创建会话并写入 Cookie
 * @returns {Promise<{ ok: true, email: string } | { ok: false, status: number, error: string }>}
 */
export async function verifyLoginCode(res, email, code) {
  const invalid = { ok: false, status: 400, error: '验证码错误或已过期' };
  if (!/^\d{6}$/.test(code)) return invalid;

  const storedHash = await redis('GET', `auth:code:${email}`);
  if (!storedHash) return invalid;

  const attempts = await incrementWithExpiry(`auth:code-attempts:${email}`, CODE_TTL_SECONDS);
  if (attempts > CODE_MAX_ATTEMPTS) {
    await redis('DEL', `auth:code:${email}`);
    return { ok: false, status: 429, error: '尝试次数过多，请重新获取验证码' };
  }

  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(sha256(`${email}:${code}`), 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return invalid;

  await redis('DEL', `auth:code:${email}`);
  await redis('DEL', `auth:code-attempts:${email}`);
  await redis('SET', `user:${email}`, JSON.stringify({ createdAt: new Date().toISOString() }), 'NX');

  const token = crypto.randomBytes(32).toString('base64url');
  await redis('SET', `auth:session:${sha256(token)}`, email, 'EX', SESSION_TTL_SECONDS);
  res.setHeader('Set-Cookie', sessionCookie(token, SESSION_TTL_SECONDS));
  return { ok: true, email };
}

/** 读取当前登录用户的邮箱，未登录返回空字符串 */
export async function getSessionEmail(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return '';
  return (await redis('GET', `auth:session:${sha256(token)}`)) || '';
}

export async function logout(req, res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) await redis('DEL', `auth:session:${sha256(token)}`);
  res.setHeader('Set-Cookie', sessionCookie('', 0));
}

export async function getUsedToday(email) {
  return Number(await redis('GET', `usage:${email}:${beijingDate()}`)) || 0;
}

/**
 * 生成 / 对话前的登录与额度检查，通过时计入一次用量
 * 未开启登录或可信调用方（X-App-Token）直接放行
 * @returns {Promise<{ ok: true, remaining: number|null } | { ok: false, response: any }>}
 */
export async function authorizeUserRequest(req, res, { routeKey, isTrustedRequest }) {
  if (!isAuthEnabled() || isTrustedRequest) return { ok: true, remaining: null };

  const configError = getAuthConfigError();
  if (configError) return { ok: false, response: errorResponse(res, 503, configError) };

  const email = await getSessionEmail(req);
  if (!email) {
    return { ok: false, response: res.status(401).json({ error: '请先登录', code: 'LOGIN_REQUIRED' }) };
  }
  if (await redis('EXISTS', `user:blocked:${email}`)) {
    return { ok: false, response: errorResponse(res, 403, '该账号已被停用') };
  }

  const { dailyQuota, perMinute } = getUserLimits();
  const minuteKey = new Date().toISOString().slice(0, 16);
  const minuteCount = await incrementWithExpiry(`rl:${routeKey}:${email}:${minuteKey}`, 120);
  if (minuteCount > perMinute) {
    res.setHeader('Retry-After', '60');
    return { ok: false, response: errorResponse(res, 429, '操作太频繁，请稍后再试') };
  }

  const used = await incrementWithExpiry(`usage:${email}:${beijingDate()}`, 2 * 24 * 3600);
  if (used > dailyQuota) {
    return {
      ok: false,
      response: res.status(429).json({ error: `今日额度已用完（每天 ${dailyQuota} 次），明天再来吧`, code: 'QUOTA_EXCEEDED' }),
    };
  }

  const remaining = dailyQuota - used;
  res.setHeader('X-Quota-Remaining', String(remaining));
  return { ok: true, remaining };
}
