// Vercel Serverless Function - 获取可用模型列表
import { getOpenAIConfig, errorResponse } from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return errorResponse(res, 405, 'Method not allowed');
  }

  const { apiKey, baseUrl, defaultModel } = getOpenAIConfig();
  if (!apiKey) {
    return errorResponse(res, 500, 'OPENAI_API_KEY is not configured');
  }

  try {
    const response = await fetch(`${baseUrl}/v1/models`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Models API error:', response.status, errText);
      return errorResponse(res, 502, 'Failed to fetch models');
    }

    const data = await response.json();
    const models = (data.data || [])
      .map((m) => m.id)
      .sort((a, b) => a.localeCompare(b));

    return res.status(200).json({
      success: true,
      models,
      default: defaultModel,
    });
  } catch (error) {
    console.error('Server error:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
}
