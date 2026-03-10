// Vercel Serverless Function - 获取可用模型列表
// 通过 /v1/models 接口列出模型供前端选择

export default async function handler(req, res) {
  // 只允许 GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
  }

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Models API error:', response.status, errText);
      return res.status(502).json({ error: 'Failed to fetch models' });
    }

    const data = await response.json();

    // 提取模型 id 列表并排序
    const models = (data.data || [])
      .map((m) => m.id)
      .sort((a, b) => a.localeCompare(b));

    return res.status(200).json({
      success: true,
      models: models,
      default: OPENAI_MODEL,
    });
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
