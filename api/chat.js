// Vercel Serverless Function - 对话式修改思维导图
// 用户可以针对某个节点提问或要求展开，AI 在原有思维导图基础上修改并返回完整 Markdown

export default async function handler(req, res) {
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
    const { currentMarkdown, message, model, history } = req.body;

    if (!currentMarkdown || typeof currentMarkdown !== 'string' || !currentMarkdown.trim()) {
      return res.status(400).json({ error: '请先生成思维导图' });
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: '请输入你的问题或指令' });
    }

    if (message.length > 500) {
      return res.status(400).json({ error: '消息过长（最多 500 字）' });
    }

    const selectedModel = (model && typeof model === 'string' && model.trim()) ? model.trim() : OPENAI_MODEL;

    const systemPrompt = `你是一位专业的思维导图编辑助手。用户已经有一份 Markdown 格式的思维导图大纲，现在他想对其中的某个部分进行修改、展开、追问或调整。

## 你的任务

根据用户的指令，在**现有思维导图的基础上**进行修改，然后输出**修改后的完整 Markdown 思维导图**。

## 规则

1. 保留用户未要求修改的部分，不要删除或大幅改动未提及的节点
2. 根据用户要求对特定节点进行展开、细化、删除、合并、重命名等操作
3. 输出格式仍然使用 Markdown 标题格式（# ## ### ####）
4. 中心主题（#）保持不变，除非用户明确要求修改
5. 直接输出完整的修改后 Markdown 内容，不要用代码块包裹
6. 不要添加任何额外的说明文字，只输出 Markdown 思维导图内容

## 常见操作示例

- 用户说"展开XX节点"→ 在该节点下增加子分支
- 用户说"XX节点太简略了"→ 丰富该节点的子内容
- 用户说"删除XX节点"→ 移除该节点及其子节点
- 用户说"把XX改成YY"→ 重命名该节点
- 用户说"在XX下面加一个YY"→ 在指定位置新增节点
- 用户说"XX是什么意思"→ 在该节点下添加解释性子节点`;

    // 构建消息列表
    const messages = [
      { role: 'system', content: systemPrompt },
    ];

    // 加入对话历史（如有），帮助 AI 理解上下文
    if (Array.isArray(history) && history.length > 0) {
      // 只取最近 10 轮对话，避免 token 过多
      const recentHistory = history.slice(-10);
      for (const h of recentHistory) {
        if (h.role === 'user' && h.content) {
          messages.push({ role: 'user', content: h.content });
        } else if (h.role === 'assistant' && h.content) {
          messages.push({ role: 'assistant', content: h.content });
        }
      }
    }

    // 当前用户消息：带上现有 markdown 作为上下文
    messages.push({
      role: 'user',
      content: `当前的思维导图 Markdown 如下：

${currentMarkdown.trim()}

---

用户的修改要求：${message.trim()}

请在上面思维导图的基础上进行修改，输出完整的修改后 Markdown（不要包裹在代码块中）。`,
    });

    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: selectedModel,
        temperature: 0.7,
        max_tokens: 4096,
        messages: messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OpenAI API error:', response.status, errText);
      return res.status(502).json({ error: 'AI 服务异常，请稍后重试' });
    }

    const data = await response.json();
    let markdown = data?.choices?.[0]?.message?.content?.trim() || '';

    // 清理可能的代码块包裹
    if (markdown.startsWith('```')) {
      markdown = markdown.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
    }

    if (!markdown) {
      return res.status(502).json({ error: 'AI 返回了空结果，请重试' });
    }

    return res.status(200).json({
      success: true,
      markdown: markdown,
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
