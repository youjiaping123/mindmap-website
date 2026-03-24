/**
 * 全局常量与配置
 */

const HISTORY_KEY = 'mindmap_history';
const MAX_HISTORY = 50;
const MAX_PROMPT_LENGTH = 20000;   // 允许超长预设提示词（详尽模式约 18k 字符）
const MAX_PROMPT_LENGTH_MANUAL = 2000; // 手动输入时的推荐字数上限
const MAX_TOPIC_LENGTH = 2000;
const MAX_CHAT_MESSAGE_LENGTH = 500;

/** 默认系统提示词（前后端共享同一份来源） */
const DEFAULT_PROMPT = globalThis.MINDMAP_SHARED_PROMPTS?.DEFAULT_SYSTEM_PROMPT || '';
