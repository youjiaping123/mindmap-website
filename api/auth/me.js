// Vercel Serverless Function - 获取登录状态与今日用量
import { errorResponse, guardApiRequest } from '../_shared.js';
import { getAuthConfigError, getSessionEmail, getUsedToday, getUserLimits, isAuthEnabled } from '../_shared/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return errorResponse(res, 405, 'Method not allowed');
  }

  const guard = guardApiRequest(req, res, { routeKey: 'auth' });
  if (!guard.ok) return guard.response;

  res.setHeader('Cache-Control', 'no-store');
  if (!isAuthEnabled()) return res.status(200).json({ authEnabled: false, user: null });
  if (getAuthConfigError()) return res.status(200).json({ authEnabled: true, user: null });

  try {
    const email = await getSessionEmail(req);
    const user = email
      ? { email, usedToday: await getUsedToday(email), dailyQuota: getUserLimits().dailyQuota }
      : null;
    return res.status(200).json({ authEnabled: true, user });
  } catch (error) {
    console.error('Auth me error:', error);
    return errorResponse(res, 500, '获取登录状态失败');
  }
}
