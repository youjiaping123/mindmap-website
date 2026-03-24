/**
 * 核心生成流程（SSE 流式）+ 多版本并行生成
 * 依赖: state.js, utils.js, ui.js, history.js, markmap.js, chat.js
 */

/* ===== 多版本 Tab 渲染 & 切换 ===== */

/** 渲染版本 Tab 按钮 */
function renderVersionTabs() {
  const container = $('versionTabs');
  if (!container) return;

  const results = AppState.versionResults;
  if (!results || results.length <= 1) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  container.innerHTML = '';

  results.forEach((_, i) => {
    const btn = document.createElement('button');
    btn.className = 'version-tab-btn' + (i === AppState.activeVersionIndex ? ' active' : '');
    btn.textContent = `版本 ${i + 1}`;
    btn.onclick = () => switchToVersion(i);
    container.appendChild(btn);
  });
}

/** 切换到指定版本 */
function switchToVersion(index) {
  const results = AppState.versionResults;
  if (!results || index < 0 || index >= results.length) return;

  if (typeof syncCurrentMarkdownToActiveVersion === 'function') {
    syncCurrentMarkdownToActiveVersion();
  }

  AppState.activeVersionIndex = index;
  const { markdown } = results[index];
  AppState.currentMarkdown = markdown;

  transitionMarkmapToMarkdown(markdown, {
    duration: 600,
    restoreDuration: 300,
    restoreDelay: 700,
  });

  $('markdownContent').textContent = markdown;

  // 更新 Tab 高亮
  const btns = document.querySelectorAll('.version-tab-btn');
  btns.forEach((b, i) => b.classList.toggle('active', i === index));
}

/** 清除版本数据 */
function clearVersionResults() {
  AppState.versionResults = [];
  AppState.activeVersionIndex = -1;
  const container = $('versionTabs');
  if (container) {
    container.style.display = 'none';
    container.innerHTML = '';
  }
}

/* ===== 单版本 SSE 流式消费 ===== */

/**
 * 以流式方式消费 SSE 并实时渲染 markmap（委托给 consumeSSE）
 */
async function _consumeSSEStream(response, _abortSignal, { onDelta, onThrottledRender }) {
  return consumeSSE(response.body, {
    onDelta: (content, accumulated) => {
      if (onDelta) onDelta(content, accumulated);
      if (onThrottledRender) onThrottledRender(accumulated);
    },
  });
}

/**
 * 以非流式方式收集完整结果（用于额外版本的后台生成）
 */
async function _collectFullResponse(topic, selectedModel, customPrompt, temperature, abortSignal) {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, model: selectedModel, customPrompt, temperature }),
    signal: abortSignal,
  });

  if (!response.ok) {
    let errMsg = '生成失败';
    try { const d = await response.json(); errMsg = d.error || errMsg; } catch {}
    throw new Error(errMsg);
  }

  const result = await consumeSSE(response.body);

  if (result.finishReason && result.finishReason !== 'stop') {
    console.warn('后台版本生成提前结束:', result.finishReason);
  }
  if (!result.completedNormally) {
    console.warn('后台版本生成流异常中断，已忽略该版本');
  }

  return result;
}

/* ===== 主生成入口 ===== */

/** 生成按钮点击事件 */
async function handleGenerate() {
  const input = $('topicInput');
  const topic = input.value.trim();

  if (!topic) {
    showError('请输入思维导图主题');
    input.focus();
    return;
  }
  if (topic.length > MAX_TOPIC_LENGTH) {
    showError(`主题过长，请控制在 ${MAX_TOPIC_LENGTH} 字以内`);
    input.focus();
    return;
  }

  // 如果正在流式生成，则中止
  if (AppState.isStreaming && AppState.streamAbort) {
    AppState.streamAbort.abort();
    AppState.isStreaming = false;
    setLoading(false);
    return;
  }

  setLoading(true);
  hideError();

  // 提前展示面板
  $('toolbar').style.display = 'flex';
  $('contentArea').style.display = 'flex';
  $('chatSection').style.display = 'flex';
  switchTab('preview');
  clearChat();

  const hero = $('heroSection');
  if (hero) hero.style.display = 'none';

  // 清空旧内容 & 版本
  clearVersionResults();
  AppState.currentMarkdown = '';
  AppState.currentTopic = topic;
  $('markdownContent').textContent = '';

  // 先创建一个空的 markmap 实例
  renderMarkmap('# 生成中...');

  const abortController = new AbortController();
  AppState.streamAbort = abortController;
  AppState.isStreaming = true;

  // 版本数量
  const versionSlider = $('versionSlider');
  const versionCount = versionSlider ? parseInt(versionSlider.value, 10) || 1 : 1;

  // 节流渲染参数
  let renderTimer = null;
  let lastRenderTime = 0;
  let rafId = null;
  let hasRenderedStreamPreview = false;
  const RENDER_INTERVAL = 400;

  function hasVisibleMarkmapContent(markdown) {
    return /[^\s#>*`\-\n]/.test(markdown);
  }

  function scheduleRender() {
    const now = Date.now();
    if (now - lastRenderTime >= RENDER_INTERVAL) {
      doRender();
    } else if (!renderTimer) {
      renderTimer = setTimeout(doRender, RENDER_INTERVAL - (now - lastRenderTime));
    }
  }

  function doRender() {
    renderTimer = null;
    lastRenderTime = Date.now();
    const md = AppState.currentMarkdown.trim();
    if (md && hasVisibleMarkmapContent(md)) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!hasRenderedStreamPreview) {
          renderMarkmap(md);
          hasRenderedStreamPreview = true;
        } else {
          updateMarkmap(md, false);
        }
        $('markdownContent').textContent = md;
      });
    }
  }

  try {
    const selectedModel = $('modelSelect').value || '';
    const customPrompt = ($('customPrompt').value || '').trim();
    const presetTemperature = typeof getActivePresetTemperature === 'function'
      ? getActivePresetTemperature()
      : null;

    // ===== 版本 1: 始终流式预览 =====
    const baseTemp = typeof presetTemperature === 'number'
      ? presetTemperature
      : (globalThis.MINDMAP_MODEL_OPTIONS?.defaultGenerateTemperature ?? 0.7);
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, model: selectedModel, customPrompt, temperature: baseTemp }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      let errMsg = '生成失败，请重试';
      try { const errData = await response.json(); errMsg = errData.error || errMsg; } catch {}
      throw new Error(errMsg);
    }

    // ===== 启动额外版本的后台生成 =====
    const extraPromises = [];
    if (versionCount > 1) {
      for (let i = 1; i < versionCount; i++) {
        // 每个额外版本使用不同 temperature
        const step = globalThis.MINDMAP_MODEL_OPTIONS?.streamVersionTemperatureStep ?? 0.15;
        const maxTemp = globalThis.MINDMAP_MODEL_OPTIONS?.maxGenerateTemperature ?? 1.5;
        const temp = Math.min(baseTemp + i * step, maxTemp);
        extraPromises.push(
          _collectFullResponse(topic, selectedModel, customPrompt, temp, abortController.signal)
            .catch((err) => {
              console.warn(`版本 ${i + 1} 生成失败:`, err.message);
              return null; // 失败的版本返回 null
            })
        );
      }
    }

    // ===== 消费版本 1 的 SSE 流 =====
    const { content: finalMd, finishReason, completedNormally } = await _consumeSSEStream(response, abortController.signal, {
      onDelta: (_delta, accumulated) => {
        AppState.currentMarkdown = accumulated;
      },
      onThrottledRender: () => scheduleRender(),
    });

    // 清理节流定时器
    if (renderTimer) { clearTimeout(renderTimer); renderTimer = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

    if (!finalMd) {
      throw new Error('AI 返回了空内容，请重试');
    }

    const finishMessage = getFinishReasonMessage(finishReason, '生成');
    if (finishMessage) {
      showToast(finishMessage, 'info', 5000);
    }
    if (!completedNormally) {
      const incompleteMessage = getUnexpectedStreamEndMessage('生成');
      console.warn('主版本生成流异常中断：未收到 finish_reason 或 [DONE]');
      showError(incompleteMessage);
    }

    AppState.currentMarkdown = finalMd;

    // 最终渲染：优雅展开
    hasRenderedStreamPreview = true;
    transitionMarkmapToMarkdown(finalMd, {
      duration: 800,
      restoreDuration: 300,
      restoreDelay: 900,
    });
    $('markdownContent').textContent = finalMd;

    // ===== 收集所有版本结果 =====
    if (versionCount > 1) {
      // 版本 1 已就绪
      AppState.versionResults = [{ markdown: finalMd }];
      AppState.activeVersionIndex = 0;

      // 等待额外版本完成
      const extraResults = await Promise.all(extraPromises);
      for (const result of extraResults) {
        if (result?.content && result.completedNormally) {
          AppState.versionResults.push({ markdown: result.content });
        }
      }

      // 渲染版本 Tab
      renderVersionTabs();
      if (AppState.versionResults.length > 1) {
        showToast(`已生成 ${AppState.versionResults.length} 个版本`, 'success');
      }
    } else {
      // 单版本
      AppState.versionResults = [{ markdown: finalMd }];
      AppState.activeVersionIndex = 0;
    }

    if (!completedNormally) {
      showToast('已保留当前部分结果，请检查 Vercel 日志或函数超时配置', 'info', 6000);
      return;
    }

    // 保存历史
    saveHistory(topic, finalMd);
    if (!finishMessage) {
      showToast('思维导图生成成功！', 'success');
    }

  } catch (error) {
    if (error.name === 'AbortError') {
      showToast('已取消生成', 'info');
    } else {
      showError(error.message);
    }
  } finally {
    AppState.isStreaming = false;
    AppState.streamAbort = null;
    setLoading(false);
  }
}
