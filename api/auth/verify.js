// Vercel Serverless Function - 校验验证码并登录
import { errorResponse, guardApiRequest } from '../_shared.js';
import { getAuthConfigError, getUsedToday, getUserLimits, isAuthEnabled, normalizeEmail, verifyLoginCode } from '../_shared/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return errorResponse(res, 405, 'Method not allowed');
  }

  const guard = guardApiRequest(req, res, { routeKey: 'auth' });
  if (!guard.ok) return guard.response;

  if (!isAuthEnabled()) return errorResponse(res, 404, '未开启登录');
  const configError = getAuthConfigError();
  if (configError) return errorResponse(res, 503, configError);

  const email = normalizeEmail(req.body?.email);
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!email) return errorResponse(res, 400, '请输入有效的邮箱地址');

  try {
    const result = await verifyLoginCode(res, email, code);
    if (!result.ok) return errorResponse(res, result.status, result.error);
    return res.status(200).json({
      success: true,
      user: { email, usedToday: await getUsedToday(email), dailyQuota: getUserLimits().dailyQuota },
    });
  } catch (error) {
    console.error('Verify code error:', error);
    return errorResponse(res, 500, '登录失败，请稍后重试');
  }
}
