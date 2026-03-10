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
// 模型列表加载
// ============================

/**
 * 页面加载时获取可用模型列表
 */
async function loadModels() {
  const select = document.getElementById('modelSelect');
  try {
    const response = await fetch('/api/models');
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || '获取模型列表失败');
    }

    // 清空下拉框
    select.innerHTML = '';

    const models = data.models || [];
    const defaultModel = data.default || '';

    if (models.length === 0) {
      select.innerHTML = '<option value="">无可用模型</option>';
      return;
    }

    models.forEach((modelId) => {
      const option = document.createElement('option');
      option.value = modelId;
      option.textContent = modelId;
      if (modelId === defaultModel) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    // 如果没有匹配的默认模型，选中第一个
    if (defaultModel && !models.includes(defaultModel)) {
      select.selectedIndex = 0;
    }
  } catch (error) {
    console.error('Failed to load models:', error);
    select.innerHTML = '<option value="">加载失败，将使用默认模型</option>';
  }
}

// 页面加载时自动获取模型列表
document.addEventListener('DOMContentLoaded', loadModels);

// ============================
// 自定义提示词
// ============================

const DEFAULT_PROMPT = `你是一位专业的思维导图设计师。用户会给你一个主题，你需要围绕该主题生成一份结构清晰、层次分明的思维导图大纲。

## 输出要求

1. 使用 Markdown 标题格式（# 表示中心主题，## 表示一级分支，### 表示二级分支，以此类推）
2. 中心主题只能有一个（一个 #）
3. 一级分支 4-8 个（##），每个一级分支下有 2-5 个二级分支（###）
4. 如有必要可以有三级分支（####），但不要超过四级
5. 每个节点的文字简洁有力，一般不超过 10 个字
6. 直接输出 Markdown 内容，不要用代码块包裹，不要添加任何额外说明

## 示例输出

# 人工智能
## 机器学习
### 监督学习
### 无监督学习
### 强化学习
## 深度学习
### 卷积神经网络
### 循环神经网络
### Transformer
## 自然语言处理
### 文本分类
### 机器翻译
### 对话系统
## 计算机视觉
### 图像识别
### 目标检测
### 图像生成`;

/**
 * 展开/折叠自定义提示词区域
 */
function togglePrompt() {
  const body = document.getElementById('promptBody');
  const icon = document.getElementById('promptToggleIcon');
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'block' : 'none';
  icon.textContent = isHidden ? '▼' : '▶';
}

/**
 * 恢复默认提示词
 */
function resetPrompt() {
  const textarea = document.getElementById('customPrompt');
  textarea.value = '';
  updatePromptCharCount();
  updatePromptHint();
}

/**
 * 将默认提示词填充到文本框，方便用户参考修改
 */
function fillDefaultPrompt() {
  const textarea = document.getElementById('customPrompt');
  textarea.value = DEFAULT_PROMPT;
  updatePromptCharCount();
  updatePromptHint();
  textarea.focus();
}

/**
 * 更新提示词字符计数
 */
function updatePromptCharCount() {
  const textarea = document.getElementById('customPrompt');
  const count = document.getElementById('promptCharCount');
  count.textContent = `${textarea.value.length} / 2000`;
}

/**
 * 更新提示词状态提示
 */
function updatePromptHint() {
  const textarea = document.getElementById('customPrompt');
  const hint = document.getElementById('promptToggleHint');
  if (textarea.value.trim()) {
    hint.textContent = '（已自定义）';
    hint.style.color = 'var(--primary)';
  } else {
    hint.textContent = '（使用默认提示词）';
    hint.style.color = '';
  }
}

// 监听提示词输入
document.addEventListener('DOMContentLoaded', () => {
  const textarea = document.getElementById('customPrompt');
  textarea.addEventListener('input', () => {
    // 限制最大长度
    if (textarea.value.length > 2000) {
      textarea.value = textarea.value.slice(0, 2000);
    }
    updatePromptCharCount();
    updatePromptHint();
  });
});

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
    // 获取选中的模型
    const modelSelect = document.getElementById('modelSelect');
    const selectedModel = modelSelect.value || '';

    // 获取自定义提示词
    const promptTextarea = document.getElementById('customPrompt');
    const customPrompt = promptTextarea.value.trim() || '';

    // 调用后端 API
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        model: selectedModel,
        customPrompt: customPrompt,
      }),
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
