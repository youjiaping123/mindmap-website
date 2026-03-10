// Vercel Serverless Function - 对话式局部修改思维导图
// AI 返回 JSON 操作指令，前端根据指令对 Markdown 做局部修改，节省 token 且不丢失内容

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

    const systemPrompt = `你是一位专业的思维导图编辑助手。用户已有一份 Markdown 格式的思维导图，现在想对其中的某个部分进行修改。

## 你的任务

分析用户的修改要求，输出一个 **JSON 操作指令数组**，前端会根据这些指令对 Markdown 进行局部修改。

## 可用的操作类型

1. **expand** - 展开/细化某个节点：在目标节点下插入新的子节点内容
   \`{ "op": "expand", "target": "节点文本", "children": "### 子节点1\\n### 子节点2\\n#### 孙节点" }\`
   - children 使用 Markdown 标题格式，层级相对于目标节点
   - 例如目标是 ## 级别，那么直接子节点用 ###，孙节点用 ####

2. **delete** - 删除节点及其所有子节点
   \`{ "op": "delete", "target": "节点文本" }\`

3. **rename** - 重命名节点（只改文字，保留层级和子节点）
   \`{ "op": "rename", "target": "旧节点文本", "newName": "新节点文本" }\`

4. **insert** - 在某个节点后面（同级）插入新节点
   \`{ "op": "insert", "target": "参考节点文本", "content": "## 新节点\\n### 子节点1\\n### 子节点2" }\`
   - content 使用完整的 Markdown 标题格式（含 # 前缀）

5. **replace** - 替换某个节点及其所有子节点为新内容
   \`{ "op": "replace", "target": "节点文本", "content": "## 新节点名\\n### 新子节点1\\n### 新子节点2" }\`
   - content 使用完整的 Markdown 标题格式（含 # 前缀）

## 输出规则

1. **只输出一个 JSON 数组**，不要输出其他任何文字
2. target 是节点的**纯文本**（不含 # 前缀），精确匹配
3. 一个请求可以包含多个操作
4. 如果用户的需求无法用上述操作实现，使用 replace 操作替换相关节点

## 示例

用户说"展开深度学习节点"，当前深度学习是 ## 级别：
\`\`\`json
[{"op":"expand","target":"深度学习","children":"### 卷积神经网络\\n#### 图像分类\\n#### 目标检测\\n### 循环神经网络\\n#### 文本生成\\n#### 时序预测\\n### Transformer\\n#### 注意力机制\\n#### 自监督学习"}]
\`\`\`

用户说"删除计算机视觉"：
\`\`\`json
[{"op":"delete","target":"计算机视觉"}]
\`\`\`

用户说"把机器学习改成ML"：
\`\`\`json
[{"op":"rename","target":"机器学习","newName":"ML"}]
\`\`\`

用户说"在机器学习后面加一个迁移学习分支"：
\`\`\`json
[{"op":"insert","target":"机器学习","content":"## 迁移学习\\n### 领域自适应\\n### 微调策略"}]
\`\`\``;

    // 构建消息列表
    const messages = [
      { role: 'system', content: systemPrompt },
    ];

    // 加入对话历史（如有）
    if (Array.isArray(history) && history.length > 0) {
      const recentHistory = history.slice(-6);
      for (const h of recentHistory) {
        if (h.role === 'user' && h.content) {
          messages.push({ role: 'user', content: h.content });
        } else if (h.role === 'assistant' && h.content) {
          messages.push({ role: 'assistant', content: h.content });
        }
      }
    }

    // 当前用户消息
    messages.push({
      role: 'user',
      content: `当前思维导图 Markdown：

${currentMarkdown.trim()}

---

修改要求：${message.trim()}

请输出 JSON 操作指令数组。`,
    });

    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: selectedModel,
        temperature: 0.3,
        max_tokens: 2048,
        messages: messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OpenAI API error:', response.status, errText);
      return res.status(502).json({ error: 'AI 服务异常，请稍后重试' });
    }

    const data = await response.json();
    let raw = data?.choices?.[0]?.message?.content?.trim() || '';

    // 清理可能的代码块包裹
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
    }

    if (!raw) {
      return res.status(502).json({ error: 'AI 返回了空结果，请重试' });
    }

    // 解析 JSON
    let operations;
    try {
      operations = JSON.parse(raw);
      if (!Array.isArray(operations)) {
        operations = [operations];
      }
    } catch (parseErr) {
      console.error('Failed to parse AI response as JSON:', raw);
      // 解析失败时，回退到全量替换模式
      return res.status(200).json({
        success: true,
        mode: 'fallback',
        raw: raw,
        description: 'AI 返回格式异常，请重试',
      });
    }

    return res.status(200).json({
      success: true,
      mode: 'patch',
      operations: operations,
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
