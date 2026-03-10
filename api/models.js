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

  // 支持通过环境变量 OPENAI_MODELS 手动指定模型列表（逗号分隔）
  const envModels = process.env.OPENAI_MODELS;
  if (envModels) {
    const models = envModels.split(',').map((m) => m.trim()).filter(Boolean);
    return res.status(200).json({ success: true, models, default: defaultModel });
  }

  // 尝试从远程 API 获取
  try {
    const response = await fetch(`${baseUrl}/v1/models`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      console.warn('Models API not available:', response.status, '- falling back to default model');
      return res.status(200).json({ success: true, models: [defaultModel], default: defaultModel });
    }

    const data = await response.json();
    const models = (data.data || [])
      .map((m) => m.id)
      .sort((a, b) => a.localeCompare(b));

    if (models.length === 0) {
      return res.status(200).json({ success: true, models: [defaultModel], default: defaultModel });
    }

    return res.status(200).json({ success: true, models, default: defaultModel });
  } catch (error) {
    console.warn('Failed to fetch models, falling back to default:', error.message);
    return res.status(200).json({ success: true, models: [defaultModel], default: defaultModel });
  }
}
