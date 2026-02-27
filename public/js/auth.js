'use strict';

function switchTab(tab) {
  document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('registerForm').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('tabRegister').classList.toggle('active', tab === 'register');
  document.getElementById('dailyNotice').style.display = 'none';
}

function togglePw(id, btn) {
  const input = document.getElementById(id);
  if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; }
  else { input.type = 'password'; btn.textContent = '👁'; }
}

function showMsg(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = 'message ' + type;
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!data.success) {
      showMsg('loginMsg', data.message || '登录失败', 'error');
      return;
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem('username', data.username);
    localStorage.setItem('balance', data.balance);

    if (data.dailyBonus && data.dailyBonus.claimed) {
      const notice = document.getElementById('dailyNotice');
      notice.textContent = `🎁 每日登录奖励 +${data.dailyBonus.bonus} 筹码！当前余额 ${data.balance}`;
      notice.style.display = 'block';
      setTimeout(() => { window.location.href = '/game.html'; }, 1500);
    } else {
      window.location.href = '/game.html';
    }
  } catch (err) {
    showMsg('loginMsg', '网络错误，请重试', 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value;
  const password2 = document.getElementById('regPassword2').value;

  if (password !== password2) {
    showMsg('registerMsg', '两次密码不一致', 'error');
    return;
  }

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!data.success) {
      showMsg('registerMsg', data.message || '注册失败', 'error');
      return;
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem('username', data.username);
    localStorage.setItem('balance', 2000);

    showMsg('registerMsg', `注册成功！初始筹码 2000，正在跳转...`, 'success');
    setTimeout(() => { window.location.href = '/game.html'; }, 1200);
  } catch (err) {
    showMsg('registerMsg', '网络错误，请重试', 'error');
  }
}

// 已登录则跳转
if (localStorage.getItem('token') && window.location.pathname === '/') {
  // 验证 token
  fetch('/api/me', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })
    .then(r => r.json())
    .then(d => { if (d.success) window.location.href = '/game.html'; })
    .catch(() => {});
}
