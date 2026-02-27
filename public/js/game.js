'use strict';

// ── 认证检查 ─────────────────────────────────────────
const token = localStorage.getItem('token');
const myUsername = localStorage.getItem('username');
if (!token || !myUsername) { window.location.href = '/'; }

// ── 初始化显示 ────────────────────────────────────────
document.getElementById('userName').textContent = myUsername;
document.getElementById('userBalance').textContent = localStorage.getItem('balance') || '0';

// ── Socket 连接 ───────────────────────────────────────
const socket = io({ auth: { token } });

let gameState = null;
let myPlayerId = null;

// ── 座位位置（9个，围绕椭圆） ─────────────────────────
// 以桌面中心为原点，百分比定位
const SEAT_POSITIONS = [
  { left: '50%',  top: '95%'  },  // 0 底部中央（我的位置）
  { left: '20%',  top: '88%'  },  // 1
  { left: '5%',   top: '65%'  },  // 2
  { left: '8%',   top: '35%'  },  // 3
  { left: '25%',  top: '10%'  },  // 4
  { left: '50%',  top: '3%'   },  // 5
  { left: '75%',  top: '10%'  },  // 6
  { left: '92%',  top: '35%'  },  // 7
  { left: '95%',  top: '65%'  },  // 8
];

// ── Socket 事件 ───────────────────────────────────────
socket.on('connect', () => {
  console.log('已连接，加入房间...');
  socket.emit('join_room', { roomId: 'main' });
});

socket.on('connect_error', (err) => {
  console.error('连接失败:', err.message);
  if (err.message === 'token 无效' || err.message === '未提供认证 token') {
    localStorage.clear();
    window.location.href = '/';
  }
});

socket.on('error', (data) => {
  showToast(data.message || '操作失败', 'error');
});

socket.on('game_state', (state) => {
  gameState = state;

  // 找到自己的玩家ID
  if (!myPlayerId) {
    const me = state.players.find(p => p.username === myUsername);
    if (me) myPlayerId = me.id;
  }

  renderGameState(state);
});

socket.on('player_action', (data) => {
  addLog(`${data.username} ${actionLabel(data.action)} ${data.amount > 0 ? data.amount : ''} | 底池: ${data.pot}`);
});

socket.on('game_over', (data) => {
  showWinOverlay(data);
  setTimeout(hideWinOverlay, 4000);
});

socket.on('new_round', (data) => {
  addLog('--- ' + data.message + ' ---');
});

// ── 渲染游戏状态 ─────────────────────────────────────
function renderGameState(state) {
  // 更新底池
  document.getElementById('potAmount').textContent = state.pot;

  // 更新状态文字
  const statusMap = { waiting: '等待开始', preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌', showdown: '摊牌' };
  document.getElementById('gameStatus').textContent = statusMap[state.state] || state.state;

  // 更新公共牌
  renderCommunityCards(state.communityCards);

  // 渲染座位
  renderSeats(state);

  // 渲染我的手牌
  renderMyCards(state);

  // 更新操作按钮
  updateActionButtons(state);

  // 更新余额
  const me = state.players.find(p => p.username === myUsername);
  if (me) {
    document.getElementById('userBalance').textContent = me.balance;
    localStorage.setItem('balance', me.balance);
  }

  // 更新日志
  updateLog(state.log);
}

function renderCommunityCards(cards) {
  const container = document.getElementById('communityCards');
  container.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    if (cards && cards[i]) {
      container.appendChild(makeCardEl(cards[i]));
    } else {
      const ph = document.createElement('div');
      ph.className = 'card-placeholder';
      container.appendChild(ph);
    }
  }
}

function makeCardEl(card) {
  const el = document.createElement('div');
  const isRed = card.suit === '♥' || card.suit === '♦';
  el.className = 'card ' + (isRed ? 'red' : 'black');

  const rank = document.createElement('div');
  rank.className = 'rank';
  rank.textContent = card.rank;

  const suit = document.createElement('div');
  suit.className = 'suit';
  suit.textContent = card.suit;

  el.appendChild(rank);
  el.appendChild(suit);
  return el;
}

function makeBackCardEl() {
  const el = document.createElement('div');
  el.className = 'card back';
  el.innerHTML = '<div style="color:#aac;font-size:1.2rem">🂠</div>';
  return el;
}

function renderSeats(state) {
  const container = document.getElementById('seats');
  container.innerHTML = '';

  const players = state.players;
  const dealerIdx = state.dealerIndex;

  // 将我的座位放到位置0（底部）
  const meIdx = players.findIndex(p => p.username === myUsername);
  const orderedPlayers = [];
  const positions = [...SEAT_POSITIONS];

  if (meIdx !== -1) {
    // 从我的位置开始排列
    for (let i = 0; i < players.length; i++) {
      orderedPlayers.push(players[(meIdx + i) % players.length]);
    }
  } else {
    players.forEach(p => orderedPlayers.push(p));
  }

  for (let i = 0; i < orderedPlayers.length; i++) {
    const p = orderedPlayers[i];
    const pos = positions[i];
    if (!pos) continue;
    const seatEl = createSeatEl(p, pos, players.indexOf(p) === dealerIdx, state.currentPlayer === p.username);
    container.appendChild(seatEl);
  }

  // 空座位
  for (let i = orderedPlayers.length; i < 9; i++) {
    const pos = positions[i];
    if (!pos) continue;
    const emptyEl = createEmptySeat(pos);
    container.appendChild(emptyEl);
  }
}

function createSeatEl(player, pos, isDealer, isActive) {
  const seat = document.createElement('div');
  seat.className = 'seat' +
    (isActive ? ' active' : '') +
    (player.folded ? ' folded' : '') +
    (player.username === myUsername ? ' is-me' : '');
  seat.style.left = pos.left;
  seat.style.top = pos.top;

  const avatar = document.createElement('div');
  avatar.className = 'seat-avatar';
  avatar.textContent = player.isBot ? '🤖' : getAvatar(player.username);

  if (isDealer) {
    const btn = document.createElement('div');
    btn.className = 'dealer-btn';
    btn.textContent = 'D';
    avatar.appendChild(btn);
  }

  const name = document.createElement('div');
  name.className = 'seat-name';
  name.textContent = player.username + (player.isBot ? '' : '');

  const chips = document.createElement('div');
  chips.className = 'seat-chips';
  chips.textContent = '🪙 ' + player.balance;

  const bet = document.createElement('div');
  bet.className = 'seat-bet';
  if (player.bet > 0) bet.textContent = '下注: ' + player.bet;

  const status = document.createElement('div');
  status.className = 'seat-status';
  if (player.folded) status.textContent = '弃牌';
  else if (player.allIn) status.textContent = '全押';

  // 座位上的手牌
  const seatCards = document.createElement('div');
  seatCards.className = 'seat-cards';
  if (player.handCards && player.handCards.length > 0) {
    for (const c of player.handCards) {
      if (c && c.rank) {
        seatCards.appendChild(makeCardEl(c));
      } else {
        seatCards.appendChild(makeBackCardEl());
      }
    }
  } else if (!player.folded && gameState && gameState.state !== 'waiting') {
    // 游戏中其他玩家显示牌背
    for (let i = 0; i < 2; i++) seatCards.appendChild(makeBackCardEl());
  }

  seat.appendChild(avatar);
  seat.appendChild(name);
  seat.appendChild(chips);
  seat.appendChild(bet);
  seat.appendChild(status);
  seat.appendChild(seatCards);
  return seat;
}

function createEmptySeat(pos) {
  const seat = document.createElement('div');
  seat.className = 'seat empty';
  seat.style.left = pos.left;
  seat.style.top = pos.top;
  const avatar = document.createElement('div');
  avatar.className = 'seat-avatar';
  avatar.textContent = '💺';
  const name = document.createElement('div');
  name.className = 'seat-name';
  name.textContent = '空位';
  seat.appendChild(avatar);
  seat.appendChild(name);
  return seat;
}

function renderMyCards(state) {
  const me = state.players.find(p => p.username === myUsername);
  const container = document.getElementById('myHandCards');
  container.innerHTML = '';
  if (me && me.handCards && me.handCards.length > 0) {
    for (const c of me.handCards) {
      container.appendChild(makeCardEl(c));
    }
  } else {
    for (let i = 0; i < 2; i++) {
      const ph = document.createElement('div');
      ph.className = 'card-placeholder';
      container.appendChild(ph);
    }
  }
}

function updateActionButtons(state) {
  const me = state.players.find(p => p.username === myUsername);
  const isMyTurn = me && state.currentPlayer === myUsername && state.state !== 'waiting' && state.state !== 'showdown';

  const btnFold = document.getElementById('btnFold');
  const btnCheck = document.getElementById('btnCheck');
  const btnCall = document.getElementById('btnCall');
  const btnRaise = document.getElementById('btnRaise');
  const callInfo = document.getElementById('callInfo');

  btnFold.disabled = !isMyTurn;
  btnCheck.disabled = !isMyTurn;
  btnCall.disabled = !isMyTurn;
  btnRaise.disabled = !isMyTurn;

  if (isMyTurn && me) {
    const callAmt = state.callAmount || 0;
    if (callAmt > 0) {
      callInfo.textContent = `需要跟注: ${callAmt} 筹码`;
      btnCheck.disabled = true;
      btnCall.textContent = `跟注 ${callAmt}`;
    } else {
      callInfo.textContent = '可以过牌';
      btnCall.disabled = true;
      btnCall.textContent = '跟注';
    }
    // 预设加注金额
    const minRaise = callAmt + 20;
    if (!document.getElementById('raiseAmount').value) {
      document.getElementById('raiseAmount').value = Math.min(minRaise * 2, me.balance);
    }
  } else {
    callInfo.textContent = isMyTurn ? '' : (state.currentPlayer ? `等待 ${state.currentPlayer} 行动` : '');
    btnCall.textContent = '跟注';
  }

  // 开始游戏按钮
  const btnStart = document.getElementById('btnStart');
  btnStart.style.display = state.state === 'waiting' ? 'block' : 'none';
}

// ── 操作函数 ─────────────────────────────────────────
function doAction(action) {
  if (!gameState) return;
  const amount = action === 'raise' ? Number(document.getElementById('raiseAmount').value) : undefined;
  socket.emit('game_action', { roomId: 'main', action, amount });
  document.getElementById('raiseAmount').value = '';
}

function startGame() {
  socket.emit('start_game', { roomId: 'main' });
}

function addBot() {
  socket.emit('add_bot', { roomId: 'main' });
}

function logout() {
  localStorage.clear();
  window.location.href = '/';
}

// ── 胜利弹窗 ─────────────────────────────────────────
function showWinOverlay(data) {
  const overlay = document.getElementById('winOverlay');
  document.getElementById('winText').textContent = `🏆 ${data.winner} 赢得 ${data.amount} 筹码！`;
  document.getElementById('winSub').textContent = data.handDesc || '';
  overlay.style.display = 'flex';
}

function hideWinOverlay() {
  document.getElementById('winOverlay').style.display = 'none';
}

document.getElementById('winOverlay').addEventListener('click', hideWinOverlay);

// ── 日志 ─────────────────────────────────────────────
let lastLogLen = 0;
function updateLog(logs) {
  if (!logs) return;
  const container = document.getElementById('logContent');
  if (logs.length === lastLogLen) return;
  lastLogLen = logs.length;
  container.innerHTML = '';
  for (const line of logs) {
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.textContent = line;
    container.appendChild(div);
  }
  container.scrollTop = container.scrollHeight;
}

function addLog(text) {
  const container = document.getElementById('logContent');
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// ── 工具函数 ─────────────────────────────────────────
function getAvatar(username) {
  const avatars = ['😀', '😎', '🤩', '😜', '🥸', '🧐', '🤠', '😏', '🥳'];
  let hash = 0;
  for (const c of username) hash += c.charCodeAt(0);
  return avatars[hash % avatars.length];
}

function actionLabel(action) {
  const map = { fold: '弃牌', check: '过牌', call: '跟注', raise: '加注' };
  return map[action] || action;
}

function showToast(msg, type = 'info') {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.style.cssText = `
    position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
    background:${type === 'error' ? '#4a0d0d' : '#0d3d0d'};
    border:1px solid ${type === 'error' ? '#8e2a2a' : '#c9a227'};
    color:${type === 'error' ? '#ff8888' : '#ffd700'};
    padding:10px 24px; border-radius:8px; z-index:999;
    font-size:0.9rem; box-shadow:0 4px 16px rgba(0,0,0,.5);
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
