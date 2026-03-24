(function initDetailedPrompt(global) {
  const prompts = global.MINDMAP_SHARED_PROMPTS || (global.MINDMAP_SHARED_PROMPTS = {});
  prompts.DETAILED_PRESET_PROMPT = prompts.DEFAULT_SYSTEM_PROMPT || '';
})(globalThis);
