// Vercel Serverless Function - 对话式局部修改思维导图
import {
  getOpenAIConfig,
  resolveModel,
  callChatCompletions,
  errorResponse,
} from './_shared.js';

const CHAT_SYSTEM_PROMPT = `你是一位专业的思维导图编辑助手。用户已有一份 Markdown 格式的思维导图，现在想对其中的某个部分进行修改。

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return errorResponse(res, 405, 'Method not allowed');
  }

  const { apiKey, baseUrl, defaultModel } = getOpenAIConfig();
  if (!apiKey) {
    return errorResponse(res, 500, 'OPENAI_API_KEY is not configured');
  }

  try {
    const { currentMarkdown, message, model, history } = req.body;

    if (!currentMarkdown || typeof currentMarkdown !== 'string' || !currentMarkdown.trim()) {
      return errorResponse(res, 400, '请先生成思维导图');
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      return errorResponse(res, 400, '请输入你的问题或指令');
    }
    if (message.length > 500) {
      return errorResponse(res, 400, '消息过长（最多 500 字）');
    }

    const selectedModel = resolveModel(model, defaultModel);

    const messages = [{ role: 'system', content: CHAT_SYSTEM_PROMPT }];

    if (Array.isArray(history) && history.length > 0) {
      for (const h of history.slice(-6)) {
        if ((h.role === 'user' || h.role === 'assistant') && h.content) {
          messages.push({ role: h.role, content: h.content });
        }
      }
    }

    messages.push({
      role: 'user',
      content: `当前思维导图 Markdown：\n\n${currentMarkdown.trim()}\n\n---\n\n修改要求：${message.trim()}\n\n请输出 JSON 操作指令数组。`,
    });

    let raw = await callChatCompletions({
      baseUrl,
      apiKey,
      model: selectedModel,
      messages,
      temperature: 0.3,
      maxTokens: 2048,
    });

    if (!raw) {
      return errorResponse(res, 502, 'AI 返回了空结果，请重试');
    }

    // 清理可能的代码块包裹
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
    }

    let operations;
    try {
      operations = JSON.parse(raw);
      if (!Array.isArray(operations)) operations = [operations];
    } catch {
      console.error('Failed to parse AI response as JSON:', raw);
      return res.status(200).json({
        success: true,
        mode: 'fallback',
        raw,
        description: 'AI 返回格式异常，请重试',
      });
    }

    return res.status(200).json({
      success: true,
      mode: 'patch',
      operations,
    });
  } catch (error) {
    if (error.message === 'AI_SERVICE_ERROR') {
      return errorResponse(res, 502, 'AI 服务异常，请稍后重试');
    }
    console.error('Server error:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
}
