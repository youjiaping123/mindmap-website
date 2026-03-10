/**
 * AI 思维导图生成器 - 主逻辑
 */

// ============================
// 全局状态
// ============================

let currentMarkdown = '';   // 当前的 Markdown 内容
let currentTopic = '';      // 当前的主题
let markmapInstance = null; // markmap 实例

// ============================
// 核心流程
// ============================

/**
 * 生成按钮点击事件
 */
async function handleGenerate() {
  const input = document.getElementById('topicInput');
  const topic = input.value.trim();

  if (!topic) {
    showError('请输入思维导图主题');
    input.focus();
    return;
  }

  // UI: 进入加载状态
  setLoading(true);
  hideError();

  try {
    // 调用后端 API
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || '生成失败，请重试');
    }

    // 保存结果
    currentMarkdown = data.markdown;
    currentTopic = topic;

    // 渲染思维导图
    renderMarkmap(currentMarkdown);

    // 显示工具栏和内容区
    document.getElementById('toolbar').style.display = 'flex';
    document.getElementById('contentArea').style.display = 'flex';

    // 显示 Markdown 源码
    document.getElementById('markdownContent').textContent = currentMarkdown;

    // 默认切到预览 tab
    switchTab('preview');

  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false);
  }
}

// ============================
// Markmap 渲染
// ============================

/**
 * 用 markmap 渲染 Markdown 为 SVG 思维导图
 */
function renderMarkmap(markdown) {
  const svgEl = document.getElementById('markmapSvg');

  // 清空之前的内容
  svgEl.innerHTML = '';

  // 使用 markmap-lib 解析 Markdown
  const { Transformer } = window.markmap;
  const transformer = new Transformer();
  const { root, features } = transformer.transform(markdown);

  // 获取资源
  const assets = transformer.getUsedAssets(features);

  // 加载 CSS 资源
  const { Markmap, loadCSS, loadJS } = window.markmap;
  if (assets.styles) loadCSS(assets.styles);
  if (assets.scripts) loadJS(assets.scripts, { getMarkmap: () => window.markmap });

  // 创建 markmap 实例
  if (markmapInstance) {
    markmapInstance.destroy();
  }

  markmapInstance = Markmap.create(svgEl, {
    autoFit: true,
    duration: 500,
    maxWidth: 300,
    paddingX: 16,
    initialExpandLevel: -1, // 展开所有
  }, root);

  // 添加工具栏 (缩放控件)
  try {
    const { Toolbar } = window.markmap;
    if (Toolbar) {
      // 移除旧的工具栏
      const oldToolbar = document.querySelector('.mm-toolbar');
      if (oldToolbar) oldToolbar.remove();

      const toolbar = Toolbar.create(markmapInstance);
      toolbar.el.classList.add('mm-toolbar');
      document.getElementById('markmapContainer').appendChild(toolbar.el);
    }
  } catch (e) {
    // 工具栏不是必须的，忽略错误
    console.log('Toolbar not available:', e.message);
  }

  // 延迟 fit 一次确保正确
  setTimeout(() => {
    if (markmapInstance) {
      markmapInstance.fit();
    }
  }, 300);
}

// ============================
// Tab 切换
// ============================

function switchTab(tab) {
  const previewPanel = document.getElementById('previewPanel');
  const markdownPanel = document.getElementById('markdownPanel');
  const tabPreview = document.getElementById('tabPreview');
  const tabMarkdown = document.getElementById('tabMarkdown');

  if (tab === 'preview') {
    previewPanel.style.display = 'block';
    markdownPanel.style.display = 'none';
    tabPreview.classList.add('active');
    tabMarkdown.classList.remove('active');

    // 重新 fit markmap
    setTimeout(() => {
      if (markmapInstance) markmapInstance.fit();
    }, 100);
  } else {
    previewPanel.style.display = 'none';
    markdownPanel.style.display = 'block';
    tabPreview.classList.remove('active');
    tabMarkdown.classList.add('active');
  }
}

// ============================
// 下载功能
// ============================

/**
 * 下载 .xmind 文件
 */
async function downloadXmind() {
  if (!currentMarkdown) return;

  try {
    const filename = currentTopic || 'mindmap';
    await XmindExport.download(currentMarkdown, filename);
  } catch (error) {
    showError('下载 .xmind 失败: ' + error.message);
  }
}

/**
 * 下载 PNG 图片
 */
async function downloadPng() {
  if (!currentMarkdown || !markmapInstance) return;

  // 确保当前在预览 tab
  switchTab('preview');

  try {
    const svgEl = document.getElementById('markmapSvg');
    const filename = currentTopic || 'mindmap';
    await PngExport.download(svgEl, filename, {
      scale: 2,
      padding: 50,
      backgroundColor: '#ffffff',
    });
  } catch (error) {
    showError('导出 PNG 失败: ' + error.message);
  }
}

// ============================
// UI 工具函数
// ============================

function setLoading(loading) {
  const btn = document.getElementById('generateBtn');
  const btnText = btn.querySelector('.btn-text');
  const btnLoading = btn.querySelector('.btn-loading');

  btn.disabled = loading;
  btnText.style.display = loading ? 'none' : 'inline-flex';
  btnLoading.style.display = loading ? 'inline-flex' : 'none';
}

function showError(message) {
  const el = document.getElementById('errorMsg');
  el.textContent = message;
  el.style.display = 'block';
}

function hideError() {
  document.getElementById('errorMsg').style.display = 'none';
}

// ============================
// 事件监听
// ============================

// Enter 键触发生成
document.getElementById('topicInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) {
    handleGenerate();
  }
});

// 窗口 resize 时重新 fit markmap
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (markmapInstance) markmapInstance.fit();
  }, 200);
});
