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

  // 重新初始化粒子以匹配新主题
  if (typeof initParticles === 'function') initParticles();
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

/** 初始化粒子背景 */
function initParticles() {
  const canvas = $('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let particles = [];
  let animationId;
  let mouseX = -1000, mouseY = -1000;

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

  function getColor() {
    const theme = document.documentElement.getAttribute('data-theme');
    return theme === 'dark' ? '129, 140, 248' : '99, 102, 241';
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const color = getColor();

    particles.forEach((p, i) => {
      // 鼠标交互 - 斥力
      const dx = p.x - mouseX;
      const dy = p.y - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 120) {
        const force = (120 - dist) / 120 * 0.8;
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

      // 绘制连线
      for (let j = i + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const d = Math.sqrt((p.x - p2.x) ** 2 + (p.y - p2.y) ** 2);
        if (d < 130) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(${color}, ${(1 - d / 130) * 0.12})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    });

    animationId = requestAnimationFrame(draw);
  }

  // 清理旧的动画
  if (window._particleAnimId) cancelAnimationFrame(window._particleAnimId);

  resize();
  createParticles();
  draw();
  window._particleAnimId = animationId;

  window.addEventListener('resize', () => {
    resize();
    createParticles();
  });

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  document.addEventListener('mouseleave', () => {
    mouseX = -1000;
    mouseY = -1000;
  });
}
