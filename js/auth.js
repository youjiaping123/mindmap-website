/**
 * 邮箱验证码登录
 * 依赖: state.js, utils.js, ui.js
 */

const LOGIN_CODE_RESEND_SECONDS = 60;

let _authStep = 'email';          // 'email' | 'code'
let _authEmail = '';
let _authPendingAction = null;    // 登录成功后继续执行的操作
let _authResendTimer = null;

/** 从服务端拉取登录状态 */
async function refreshAuthState() {
  try {
    const response = await fetch('/api/auth/me');
    if (response.ok) {
      const data = await response.json();
      AppState.authEnabled = !!data.authEnabled;
      AppState.user = data.user || null;
    }
  } catch {}
  renderAuthButton();
}

function renderAuthButton() {
  const btn = $('authBtn');
  if (!btn) return;
  btn.style.display = AppState.authEnabled ? 'inline-flex' : 'none';
  $('authBtnLabel').textContent = AppState.user ? AppState.user.email.split('@')[0] : '登录';
  btn.title = AppState.user ? `已登录：${AppState.user.email}` : '登录';
}

/** 需要登录时打开登录弹窗并返回 false，登录成功后执行 onLogin */
function ensureLoggedIn(onLogin) {
  if (!AppState.authEnabled || AppState.user) return true;
  openAuthModal(onLogin);
  return false;
}

/** 解析接口错误信息；接口要求登录时（会话过期等）打开登录弹窗 */
async function readApiError(response, fallback, onLogin) {
  let data = {};
  try { data = await response.json(); } catch {}
  if (data.code === 'LOGIN_REQUIRED') {
    AppState.user = null;
    renderAuthButton();
    openAuthModal(onLogin);
  }
  return data.error || fallback;
}

/** 根据响应头更新今日剩余额度 */
function updateQuotaFromResponse(response) {
  const remaining = Number.parseInt(response.headers.get('X-Quota-Remaining') || '', 10);
  if (AppState.user && Number.isFinite(remaining)) {
    AppState.user.usedToday = AppState.user.dailyQuota - remaining;
  }
}

/* ===== 弹窗 ===== */

function onAuthButtonClick() {
  if (AppState.user) {
    _showAuthView('account');
  } else {
    openAuthModal();
  }
}

function openAuthModal(onLogin = null) {
  _authPendingAction = onLogin;
  _setAuthStep('email');
  _showAuthView('login');
  setTimeout(() => $('authEmailInput')?.focus(), 50);
}

function closeAuthModal() {
  $('authModal').style.display = 'none';
  _authPendingAction = null;
  _clearResendTimer();
}

function _showAuthView(view) {
  $('authModal').style.display = 'flex';
  $('authLoginView').style.display = view === 'login' ? 'block' : 'none';
  $('authAccountView').style.display = view === 'account' ? 'block' : 'none';
  if (view === 'account' && AppState.user) {
    const { email, usedToday, dailyQuota } = AppState.user;
    $('authAccountEmail').textContent = email;
    $('authAccountUsage').textContent = `今日已用 ${usedToday} / ${dailyQuota} 次，北京时间零点重置`;
  }
}

function _setAuthStep(step) {
  _authStep = step;
  _setAuthError('');
  const isCode = step === 'code';
  $('authEmailInput').style.display = isCode ? 'none' : 'block';
  $('authCodeInput').style.display = isCode ? 'block' : 'none';
  $('authResendBtn').style.display = isCode ? 'inline' : 'none';
  $('authPrimaryBtn').textContent = isCode ? '登录' : '发送验证码';
  $('authSecondaryBtn').textContent = isCode ? '更换邮箱' : '取消';
  $('authHint').textContent = isCode
    ? `验证码已发送至 ${_authEmail}，10 分钟内有效`
    : '输入邮箱，我们会发送一个 6 位验证码，首次登录自动注册';
  if (isCode) {
    $('authCodeInput').value = '';
    setTimeout(() => $('authCodeInput').focus(), 50);
  } else {
    _clearResendTimer();
  }
}

function _setAuthError(message) {
  const el = $('authError');
  el.textContent = message;
  el.style.display = message ? 'block' : 'none';
}

function _setAuthBusy(busy) {
  $('authPrimaryBtn').disabled = busy;
  $('authSecondaryBtn').disabled = busy;
}

async function _authPost(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || '请求失败，请重试');
  return data;
}

function handleAuthPrimary() {
  if (_authStep === 'email') {
    _sendLoginCode();
  } else {
    _verifyLoginCode();
  }
}

function handleAuthSecondary() {
  if (_authStep === 'code') {
    _setAuthStep('email');
  } else {
    closeAuthModal();
  }
}

async function _sendLoginCode() {
  const email = $('authEmailInput').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    _setAuthError('请输入有效的邮箱地址');
    return;
  }

  _setAuthBusy(true);
  _setAuthError('');
  try {
    await _authPost('/api/auth/send-code', { email });
    _authEmail = email;
    _setAuthStep('code');
    _startResendTimer();
  } catch (error) {
    _setAuthError(error.message);
  } finally {
    _setAuthBusy(false);
  }
}

async function resendLoginCode() {
  if (_authResendTimer) return;
  $('authEmailInput').value = _authEmail;
  _setAuthBusy(true);
  try {
    await _authPost('/api/auth/send-code', { email: _authEmail });
    _setAuthError('');
    showToast('验证码已重新发送', 'success');
    _startResendTimer();
  } catch (error) {
    _setAuthError(error.message);
  } finally {
    _setAuthBusy(false);
  }
}

async function _verifyLoginCode() {
  const code = $('authCodeInput').value.trim();
  if (!/^\d{6}$/.test(code)) {
    _setAuthError('请输入 6 位数字验证码');
    return;
  }

  _setAuthBusy(true);
  _setAuthError('');
  try {
    const data = await _authPost('/api/auth/verify', { email: _authEmail, code });
    AppState.user = data.user;
    renderAuthButton();
    const pending = _authPendingAction;
    closeAuthModal();
    showToast('登录成功', 'success');
    if (typeof pending === 'function') pending();
  } catch (error) {
    _setAuthError(error.message);
  } finally {
    _setAuthBusy(false);
  }
}

async function handleLogout() {
  try {
    await _authPost('/api/auth/logout');
  } catch {}
  AppState.user = null;
  renderAuthButton();
  closeAuthModal();
  showToast('已退出登录', 'info');
}

function _startResendTimer() {
  _clearResendTimer();
  let left = LOGIN_CODE_RESEND_SECONDS;
  const btn = $('authResendBtn');
  btn.disabled = true;
  btn.textContent = `重新发送（${left}s）`;
  _authResendTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      _clearResendTimer();
      return;
    }
    btn.textContent = `重新发送（${left}s）`;
  }, 1000);
}

function _clearResendTimer() {
  if (_authResendTimer) clearInterval(_authResendTimer);
  _authResendTimer = null;
  const btn = $('authResendBtn');
  if (btn) {
    btn.disabled = false;
    btn.textContent = '重新发送';
  }
}

function bindAuthInputs() {
  const onEnter = (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      handleAuthPrimary();
    }
  };
  $('authEmailInput')?.addEventListener('keydown', onEnter);
  $('authCodeInput')?.addEventListener('keydown', onEnter);
}
