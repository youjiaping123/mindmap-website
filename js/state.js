/**
 * 全局应用状态
 */

const AppState = {
  currentMarkdown: '',
  currentTopic: '',
  markmapInstance: null,
  historyPanelOpen: false,
  activePreset: '',
  chatHistory: [],
  chatLoading: false,
  /** 流式生成相关 */
  streamAbort: null,    // AbortController，用于取消流式请求
  isStreaming: false,    // 是否正在流式生成
  /** 对话修改撤销/重做栈 */
  markdownUndoStack: [],
  markdownRedoStack: [],
  maxUndoSize: 20,
  /** 多版本生成 */
  versionResults: [],      // [{ markdown, root }]  每个版本的结果
  activeVersionIndex: -1,  // 当前激活的版本索引
};

/** 将 currentMarkdown 回写到当前激活版本，避免切换版本时丢失编辑 */
function syncCurrentMarkdownToActiveVersion() {
  const index = AppState.activeVersionIndex;
  if (!Array.isArray(AppState.versionResults)) return;
  if (index < 0 || index >= AppState.versionResults.length) return;
  if (!AppState.versionResults[index]) return;
  AppState.versionResults[index].markdown = AppState.currentMarkdown;
}
