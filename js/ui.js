/**
 * UI 工具函数
 * 依赖: utils.js
 */

/** 设置生成按钮的加载状态 */
function setLoading(loading) {
  const btn = $('generateBtn');
  const btnText = btn.querySelector('.btn-text');
  const btnLoading = btn.querySelector('.btn-loading');
  const loadingText = $('btnLoadingText');

  // 流式生成中按钮可点击（用于中止），只在非流式 loading 时禁用
  btn.disabled = loading && !AppState.isStreaming;
  btnText.style.display = loading ? 'none' : 'inline-flex';
  btnLoading.style.display = loading ? 'inline-flex' : 'none';

  if (loadingText) {
    loadingText.textContent = AppState.isStreaming ? '停止' : '生成中...';
  }
}

/** 显示错误消息 */
function showError(message) {
  const el = $('errorMsg');
  el.textContent = message;
  el.style.display = 'block';
  showToast(message, 'error');
}

/** 隐藏错误消息 */
function hideError() {
  $('errorMsg').style.display = 'none';
}

/** Tab 切换 */
function switchTab(tab) {
  const previewPanel = $('previewPanel');
  const markdownPanel = $('markdownPanel');
  const tabPreview = $('tabPreview');
  const tabMarkdown = $('tabMarkdown');

  if (tab === 'preview') {
    previewPanel.style.display = 'block';
    markdownPanel.style.display = 'none';
    tabPreview.classList.add('active');
    tabMarkdown.classList.remove('active');
    setTimeout(() => {
      if (AppState.markmapInstance) AppState.markmapInstance.fit();
    }, 100);
  } else {
    previewPanel.style.display = 'none';
    markdownPanel.style.display = 'block';
    tabPreview.classList.remove('active');
    tabMarkdown.classList.add('active');
  }
}

/* ===== 全屏切换 ===== */

/** 检测是否支持原生全屏 API */
function _supportsNativeFullscreen() {
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

/** 检测当前是否处于全屏状态（原生或模拟） */
function _isFullscreen() {
  const panel = $('previewPanel');
  return !!(document.fullscreenElement || document.webkitFullscreenElement ||
    (panel && panel.classList.contains('is-fake-fullscreen')));
}

/** 进入模拟全屏 (用于 iOS 等不支持原生全屏的设备) */
function _enterFakeFullscreen(panel) {
  panel.classList.add('is-fake-fullscreen');
  document.body.classList.add('fake-fullscreen-active');
  // 记录滚动位置以便退出时恢复
  panel._savedScrollY = window.scrollY;
  window.scrollTo(0, 0);
  // push history state，让移动端返回键可退出全屏
  history.pushState({ fakeFullscreen: true }, '');
  _updateFullscreenIcon();
  // 延迟 refit markmap
  setTimeout(() => {
    if (AppState.markmapInstance) AppState.markmapInstance.fit();
  }, 150);
}

/** 退出模拟全屏 */
function _exitFakeFullscreen(panel) {
  panel.classList.remove('is-fake-fullscreen');
  document.body.classList.remove('fake-fullscreen-active');
  if (typeof panel._savedScrollY === 'number') {
    window.scrollTo(0, panel._savedScrollY);
  }
  _updateFullscreenIcon();
  setTimeout(() => {
    if (AppState.markmapInstance) AppState.markmapInstance.fit();
  }, 150);
}

/** 切换预览面板全屏（原生 + 模拟 fallback） */
function toggleFullscreen() {
  const panel = $('previewPanel');
  if (!panel) return;

  const isFake = panel.classList.contains('is-fake-fullscreen');
  const isNativeFS = document.fullscreenElement || document.webkitFullscreenElement;

  if (isNativeFS) {
    // 退出原生全屏
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) exit.call(document);
  } else if (isFake) {
    // 退出模拟全屏
    _exitFakeFullscreen(panel);
  } else if (_supportsNativeFullscreen()) {
    // 优先使用原生全屏
    const req = panel.requestFullscreen || panel.webkitRequestFullscreen;
    if (req) req.call(panel);
  } else {
    // fallback: 模拟全屏（iOS Safari 等）
    _enterFakeFullscreen(panel);
  }
}

/** 更新全屏按钮图标 */
function _updateFullscreenIcon() {
  const icon = $('fullscreenIcon');
  if (!icon) return;

  const isFS = _isFullscreen();

  if (isFS) {
    // 缩小图标（退出全屏）
    icon.innerHTML =
      '<path d="M8 3v3a2 2 0 0 1-2 2H3m18-5v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3m18 5v-3a2 2 0 0 1 2-2h3" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
  } else {
    // 放大图标（进入全屏）
    icon.innerHTML =
      '<path d="M8 3H5a2 2 0 0 0-2 2v3m18-5h-3a2 2 0 0 0-2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
  }
}

/* ===== 主题切换 ===== */

/** 获取保存的主题或系统偏好 */
function getSavedTheme() {
  const saved = localStorage.getItem('mindmap_theme');
  if (saved) return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 应用主题 */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('mindmap_theme', theme);
  const icon = $('themeIcon');
  if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

/** 切换主题 */
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';

  document.documentElement.classList.add('theme-transitioning');
  applyTheme(next);

  setTimeout(() => {
    document.documentElement.classList.remove('theme-transitioning');
  }, 600);

  // 更新粒子颜色以匹配新主题（无需重建粒子）
  if (_particleHandlers && _particleHandlers.updateColor) {
    _particleHandlers.updateColor();
  }
}

/* ===== Toast 通知系统 ===== */

/** 显示 Toast 通知 */
function showToast(message, type = 'info', duration = 3000) {
  const container = $('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'} ${escapeHtml(message)}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ===== 粒子背景 ===== */
let _particleHandlers = null;
let _particlePaused = false;

/** 暂停/恢复粒子动画（heroSection 隐藏时节省资源） */
function setParticlePaused(paused) {
  if (_particlePaused === paused) return;
  _particlePaused = paused;
  if (!paused && !window._particleAnimId && typeof _particleDrawFn === 'function') {
    window._particleAnimId = requestAnimationFrame(_particleDrawFn);
  }
}

let _particleDrawFn = null;

/** 初始化粒子背景 */
function initParticles() {
  const canvas = $('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let particles = [];
  let mouseX = -1000, mouseY = -1000;
  // 缓存主题颜色，避免每帧读取 DOM attribute
  let cachedColor = document.documentElement.getAttribute('data-theme') === 'dark'
    ? '129, 140, 248' : '99, 102, 241';
  const CONNECTION_DIST_SQ = 130 * 130; // 预计算平方距离阈值
  const MOUSE_DIST = 120;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createParticles() {
    const count = Math.min(Math.floor((canvas.width * canvas.height) / 18000), 80);
    particles = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.4 + 0.1,
      });
    }
  }

  /** 更新缓存颜色（仅主题切换时调用） */
  function updateColor() {
    const theme = document.documentElement.getAttribute('data-theme');
    cachedColor = theme === 'dark' ? '129, 140, 248' : '99, 102, 241';
  }

  function draw() {
    if (_particlePaused) {
      window._particleAnimId = null;
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const color = cachedColor;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // 鼠标交互 - 斥力
      const dx = p.x - mouseX;
      const dy = p.y - mouseY;
      const distSq = dx * dx + dy * dy;
      if (distSq < MOUSE_DIST * MOUSE_DIST && distSq > 0) {
        const dist = Math.sqrt(distSq);
        const force = (MOUSE_DIST - dist) / MOUSE_DIST * 0.8;
        p.vx += (dx / dist) * force;
        p.vy += (dy / dist) * force;
      }

      // 速度衰减
      p.vx *= 0.99;
      p.vy *= 0.99;

      p.x += p.vx;
      p.y += p.vy;

      // 边界反弹
      if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      p.x = Math.max(0, Math.min(canvas.width, p.x));
      p.y = Math.max(0, Math.min(canvas.height, p.y));

      // 绘制粒子
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color}, ${p.opacity})`;
      ctx.fill();

      // 绘制连线（用平方距离避免 sqrt）
      for (let j = i + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const cdx = p.x - p2.x;
        const cdy = p.y - p2.y;
        const cDistSq = cdx * cdx + cdy * cdy;
        if (cDistSq < CONNECTION_DIST_SQ) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(${color}, ${(1 - Math.sqrt(cDistSq) / 130) * 0.12})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    window._particleAnimId = requestAnimationFrame(draw);
  }

  // 清理旧动画和旧监听，确保可重复初始化而不叠加
  if (window._particleAnimId) {
    cancelAnimationFrame(window._particleAnimId);
    window._particleAnimId = null;
  }
  if (_particleHandlers) {
    window.removeEventListener('resize', _particleHandlers.resize);
    document.removeEventListener('mousemove', _particleHandlers.mousemove);
    document.removeEventListener('mouseleave', _particleHandlers.mouseleave);
    _particleHandlers = null;
  }

  resize();
  createParticles();
  _particleDrawFn = draw;
  draw();

  const onResize = () => {
    resize();
    createParticles();
  };

  const onMouseMove = (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  };

  const onMouseLeave = () => {
    mouseX = -1000;
    mouseY = -1000;
  };

  window.addEventListener('resize', onResize);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseleave', onMouseLeave);

  _particleHandlers = {
    resize: onResize,
    mousemove: onMouseMove,
    mouseleave: onMouseLeave,
    updateColor,
  };
}
