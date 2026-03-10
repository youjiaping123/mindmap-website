// Vercel Serverless Function - 直接调用 OpenAI API 生成思维导图
// API Key 存储在环境变量中，不暴露给前端

export default async function handler(req, res) {
  // 只允许 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
  }

  try {
    const { topic } = req.body;

    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      return res.status(400).json({ error: 'Please provide a valid topic' });
    }

    if (topic.length > 200) {
      return res.status(400).json({ error: 'Topic is too long (max 200 chars)' });
    }

    // 直接调用 OpenAI Chat Completions API
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.7,
        max_tokens: 4096,
        messages: [
          {
            role: 'system',
            content: `你是一位专业的思维导图设计师。用户会给你一个主题，你需要围绕该主题生成一份结构清晰、层次分明的思维导图大纲。

## 输出要求

1. 使用 Markdown 标题格式（# 表示中心主题，## 表示一级分支，### 表示二级分支，以此类推）
2. 中心主题只能有一个（一个 #）
3. 一级分支 4-8 个（##），每个一级分支下有 2-5 个二级分支（###）
4. 如有必要可以有三级分支（####），但不要超过四级
5. 每个节点的文字简洁有力，一般不超过 10 个字
6. 直接输出 Markdown 内容，不要用代码块包裹，不要添加任何额外说明

## 示例输出

# 人工智能
## 机器学习
### 监督学习
### 无监督学习
### 强化学习
## 深度学习
### 卷积神经网络
### 循环神经网络
### Transformer
## 自然语言处理
### 文本分类
### 机器翻译
### 对话系统
## 计算机视觉
### 图像识别
### 目标检测
### 图像生成`,
          },
          {
            role: 'user',
            content: `请为以下主题生成思维导图大纲：${topic.trim()}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OpenAI API error:', response.status, errText);
      return res.status(502).json({ error: 'AI service error, please try again later' });
    }

    const data = await response.json();
    const markdown = data?.choices?.[0]?.message?.content?.trim() || '';

    if (!markdown) {
      console.error('Empty response from OpenAI:', JSON.stringify(data));
      return res.status(502).json({ error: 'AI returned empty result, please try again' });
    }

    return res.status(200).json({
      success: true,
      markdown: markdown,
      topic: topic.trim(),
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
