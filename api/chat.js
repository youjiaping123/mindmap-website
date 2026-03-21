// Vercel Serverless Function - 对话式局部修改思维导图（流式）
import {
  getOpenAIConfig,
  getBodySizeLimits,
  guardApiRequest,
  resolveModel,
  callChatCompletionsStream,
  pipeSSE,
  errorResponse,
} from './_shared.js';

const CHAT_SYSTEM_PROMPT = `你是一位智能思维导图助手，既能帮用户修改思维导图，也能正常聊天回答问题。

## 判断用户意图

1. **修改指令**：用户想要展开、删除、重命名、插入、替换思维导图中的节点 → 输出 JSON 操作指令
2. **闲聊/提问**：用户在闲聊、提问、寻求建议、或者与导图内容无关的对话 → 正常用文字回复

## 修改指令模式

当用户意图是修改思维导图时，输出格式为：

\`\`\`
[JSON操作指令数组]
\`\`\`

每个操作都**必须包含 level 字段**，表示目标节点在 Markdown 中的标题层级（# 的数量）。

可用的操作类型：

1. **expand** - 展开/细化节点
   \`{ "op": "expand", "target": "节点文本", "level": 2, "children": "### 子节点1\\n### 子节点2\\n#### 孙节点" }\`

2. **delete** - 删除节点及其所有子节点
   \`{ "op": "delete", "target": "节点文本", "level": 2 }\`

3. **rename** - 重命名节点
   \`{ "op": "rename", "target": "旧节点文本", "level": 2, "newName": "新节点文本" }\`

4. **insert** - 在某节点后面（同级）插入新节点
   \`{ "op": "insert", "target": "参考节点文本", "level": 2, "content": "## 新节点\\n### 子节点1" }\`

5. **replace** - 替换节点及其子节点
   \`{ "op": "replace", "target": "节点文本", "level": 2, "content": "## 新节点名\\n### 新子节点1" }\`

修改指令规则：
- target 是节点**纯文本**（不含 # 前缀），精确匹配
- level 是目标节点的 # 数量（# = 1, ## = 2, ### = 3...）
- 一个请求可以包含多个操作
- Markdown 标题最多 6 级，目标节点 ≥ 4 级时子节点不超过 2 层深度

## 闲聊模式

当用户意图不是修改导图时，直接用自然语言回复。回复要简洁友好，可以：
- 回答关于导图内容的问题
- 提供修改建议（但不要直接输出 JSON，等用户确认后再操作）
- 正常闲聊

## 关键区分规则

- 如果回复**以 \`[\` 字符开头**，系统会将其视为 JSON 操作指令
- 如果回复**不以 \`[\` 开头**，系统会将其视为闲聊文字
- 所以闲聊回复时**绝对不要以 \`[\` 开头**
- 操作指令时**必须以 \`[\` 开头，以 \`]\` 结尾**，不要包含任何其他文字`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return errorResponse(res, 405, 'Method not allowed');
  }

  const guard = guardApiRequest(req, res, { routeKey: 'chat' });
  if (!guard.ok) return guard.response;

  const config = getOpenAIConfig();
  const {
    apiKey,
    baseUrl,
    defaultModel,
    chatMaxTokens,
  } = config;
  if (!apiKey) {
    return errorResponse(res, 500, 'OPENAI_API_KEY is not configured');
  }

  try {
    const { currentMarkdown, message, model, history } = req.body;
    const {
      maxCurrentMarkdownLength,
      maxChatHistoryLength,
    } = getBodySizeLimits(config, guard.context.isTrustedRequest);

    if (!currentMarkdown || typeof currentMarkdown !== 'string' || !currentMarkdown.trim()) {
      return errorResponse(res, 400, '请先生成思维导图');
    }
    if (currentMarkdown.trim().length > maxCurrentMarkdownLength) {
      return errorResponse(res, 400, `当前导图内容过长（最多 ${maxCurrentMarkdownLength} 字）`);
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      return errorResponse(res, 400, '请输入你的问题或指令');
    }
    if (message.length > 500) {
      return errorResponse(res, 400, '消息过长（最多 500 字）');
    }

    const selectedModel = resolveModel(model, defaultModel);

    const messages = [{ role: 'system', content: CHAT_SYSTEM_PROMPT }];

    const recentHistory = Array.isArray(history) ? history.slice(-6) : [];
    let historyCharCount = 0;
    for (const item of recentHistory) {
      if (!item || typeof item !== 'object') continue;
      const role = item.role;
      const content = typeof item.content === 'string' ? item.content : '';
      if ((role === 'user' || role === 'assistant') && content) {
        historyCharCount += content.length;
      }
    }
    if (historyCharCount > maxChatHistoryLength) {
      return errorResponse(res, 400, `历史消息过长（最多 ${maxChatHistoryLength} 字）`);
    }

    for (const h of recentHistory) {
      if (!h || typeof h !== 'object') continue;
      if ((h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string' && h.content) {
        messages.push({ role: h.role, content: h.content });
      }
    }

    messages.push({
      role: 'user',
      content: `当前思维导图 Markdown：\n\n${currentMarkdown.trim()}\n\n---\n\n用户消息：${message.trim()}`,
    });

    // 流式调用
    const upstreamAbortController = new AbortController();
    const upstreamResponse = await callChatCompletionsStream({
      baseUrl,
      apiKey,
      model: selectedModel,
      messages,
      temperature: 0.3,
      maxTokens: chatMaxTokens,
      signal: upstreamAbortController.signal,
    });

    // 直接将 SSE 流转发给前端
    await pipeSSE(upstreamResponse, req, res, upstreamAbortController);

  } catch (error) {
    if (error.message === 'AI_SERVICE_ERROR') {
      return errorResponse(res, 502, 'AI 服务异常，请稍后重试');
    }
    console.error('Server error:', error);
    return errorResponse(res, 500, 'Internal server error');
  }
}
