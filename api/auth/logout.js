// Vercel Serverless Function - 退出登录
import { errorResponse, guardApiRequest } from '../_shared.js';
import { getAuthConfigError, logout } from '../_shared/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return errorResponse(res, 405, 'Method not allowed');
  }

  const guard = guardApiRequest(req, res, { routeKey: 'auth' });
  if (!guard.ok) return guard.response;

  try {
    if (!getAuthConfigError()) await logout(req, res);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return errorResponse(res, 500, '退出登录失败');
  }
}
