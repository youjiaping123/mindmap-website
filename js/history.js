/**
 * 历史记录管理 (localStorage)
 * 依赖: constants.js, utils.js, state.js
 */

/** 从 localStorage 获取历史记录 */
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

/** 保存一条历史记录 */
function saveHistory(topic, markdown) {
  const history = getHistory();
  history.unshift({
    id: Date.now().toString(),
    topic,
    markdown,
    time: new Date().toISOString(),
  });
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistoryList();
}

/** 删除一条历史记录 */
function deleteHistory(id) {
  const history = getHistory().filter((item) => item.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistoryList();
}

/** 清空所有历史记录 */
function clearAllHistory() {
  if (!confirm('确定要清空所有历史记录吗？')) return;
  localStorage.removeItem(HISTORY_KEY);
  renderHistoryList();
}

/** 加载一条历史记录到视图 */
function loadHistory(id) {
  const record = getHistory().find((item) => item.id === id);
  if (!record) return;

  AppState.currentMarkdown = record.markdown;
  AppState.currentTopic = record.topic;
  AppState.versionResults = [{ markdown: record.markdown }];
  AppState.activeVersionIndex = 0;

  $('topicInput').value = record.topic;

  renderMarkmap(AppState.currentMarkdown);

  $('toolbar').style.display = 'flex';
  $('contentArea').style.display = 'flex';
  $('chatSection').style.display = 'flex';
  clearChat();

  // 隐藏 hero 区域
  const hero = $('heroSection');
  if (hero) hero.style.display = 'none';

  $('markdownContent').textContent = AppState.currentMarkdown;
  switchTab('preview');

  if (typeof renderVersionTabs === 'function') {
    renderVersionTabs();
  } else {
    const container = $('versionTabs');
    if (container) {
      container.style.display = 'none';
      container.innerHTML = '';
    }
  }

  if (window.innerWidth <= 640) toggleHistoryPanel();
}

/** 渲染历史记录列表到面板 */
function renderHistoryList() {
  const list = $('historyList');
  const emptyTip = $('historyEmpty');
  const clearBtn = $('historyClearBtn');
  if (!list) return;

  const history = getHistory();

  if (history.length === 0) {
    list.innerHTML = '';
    if (emptyTip) emptyTip.style.display = 'block';
    if (clearBtn) clearBtn.style.display = 'none';
    return;
  }

  if (emptyTip) emptyTip.style.display = 'none';
  if (clearBtn) clearBtn.style.display = 'inline-flex';

  list.innerHTML = history
    .map((item) => {
      const timeStr = formatTime(new Date(item.time));
      const firstLine = item.markdown.split('\n').find((l) => l.trim()) || '';
      const summary = firstLine.replace(/^#+\s*/, '').trim();
      return `
        <div class="history-item" data-id="${item.id}">
          <div class="history-item-main" onclick="loadHistory('${item.id}')">
            <div class="history-item-topic">${escapeHtml(item.topic)}</div>
            <div class="history-item-summary">${escapeHtml(summary)}</div>
            <div class="history-item-time">${timeStr}</div>
          </div>
          <button class="history-item-delete" onclick="event.stopPropagation();deleteHistory('${item.id}')" title="删除" aria-label="删除此记录">
            ✕
          </button>
        </div>`;
    })
    .join('');
}

/** 切换历史面板显示/隐藏 */
function toggleHistoryPanel() {
  const panel = $('historyPanel');
  const overlay = $('historyOverlay');
  if (!panel) return;

  AppState.historyPanelOpen = !AppState.historyPanelOpen;
  panel.classList.toggle('open', AppState.historyPanelOpen);
  overlay.classList.toggle('open', AppState.historyPanelOpen);
  if (AppState.historyPanelOpen) renderHistoryList();
}
