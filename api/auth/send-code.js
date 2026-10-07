// Vercel Serverless Function - 发送登录验证码
import { errorResponse, guardApiRequest } from '../_shared.js';
import { getAuthConfigError, isAuthEnabled, normalizeEmail, sendLoginCode } from '../_shared/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return errorResponse(res, 405, 'Method not allowed');
  }

  const guard = guardApiRequest(req, res, { routeKey: 'auth' });
  if (!guard.ok) return guard.response;

  if (!isAuthEnabled()) return errorResponse(res, 404, '未开启登录');
  const configError = getAuthConfigError({ needsMail: true });
  if (configError) return errorResponse(res, 503, configError);

  const email = normalizeEmail(req.body?.email);
  if (!email) return errorResponse(res, 400, '请输入有效的邮箱地址');

  try {
    const result = await sendLoginCode(req, email);
    if (!result.ok) return errorResponse(res, result.status, result.error);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Send code error:', error);
    return errorResponse(res, 502, '验证码发送失败，请稍后重试');
  }
}
