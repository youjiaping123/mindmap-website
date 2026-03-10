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
};
