// Upstash Redis REST 客户端（直接调用 REST API，无需 SDK）
// 兼容 Vercel Storage 集成注入的 KV_REST_API_* 与 Upstash 原生的 UPSTASH_REDIS_REST_* 变量名

function getRedisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

export function isRedisConfigured() {
  return Boolean(getRedisConfig());
}

/** 执行一条 Redis 命令，例如 redis('SET', key, value, 'EX', 60) */
export async function redis(...command) {
  const config = getRedisConfig();
  if (!config) throw new Error('REDIS_NOT_CONFIGURED');

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(`REDIS_ERROR:${data.error || response.status}`);
  }
  return data.result;
}

/** 计数器加一，首次创建时设置过期时间，返回加一后的值 */
export async function incrementWithExpiry(key, ttlSeconds) {
  const count = await redis('INCR', key);
  if (count === 1) {
    await redis('EXPIRE', key, ttlSeconds);
  }
  return count;
}
