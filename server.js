'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');
const authRouter = require('./src/routes/auth');
const PokerGame = require('./src/game/PokerGame');
const db = require('./src/db/database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const JWT_SECRET = process.env.JWT_SECRET || 'texas-poker-secret-2024';
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', authRouter);

// ── 房间管理 ──────────────────────────────────────────────
// rooms: Map<roomId, PokerGame>
const rooms = new Map();
const DEFAULT_ROOM = 'main';

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new PokerGame(roomId, io));
  }
  return rooms.get(roomId);
}

// ── Socket.io 中间件：JWT 认证 ────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) return next(new Error('未提供认证 token'));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.user = payload; // { id, username }
    next();
  } catch (e) {
    next(new Error('token 无效'));
  }
});

// ── Socket 事件处理 ───────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] 用户 ${socket.user.username}(${socket.id}) 已连接`);

  // 加入房间
  socket.on('join_room', ({ roomId = DEFAULT_ROOM } = {}) => {
    const game = getOrCreateRoom(roomId);
    const userInfo = db.findUserById(socket.user.id);
    if (!userInfo) return socket.emit('error', { message: '用户不存在' });

    const joined = game.addPlayer({
      id: socket.user.id,
      socketId: socket.id,
      username: socket.user.username,
      balance: userInfo.balance
    });

    if (!joined.success) {
      return socket.emit('error', { message: joined.message });
    }

    socket.join(roomId);
    socket.roomId = roomId;
    console.log(`[Room] ${socket.user.username} 加入房间 ${roomId}`);
    game.broadcastState();
  });

  // 添加机器人
  socket.on('add_bot', ({ roomId = DEFAULT_ROOM } = {}) => {
    const game = getOrCreateRoom(roomId);
    if (game.state !== 'waiting') {
      return socket.emit('error', { message: '游戏进行中，无法添加机器人' });
    }
    const result = game.addBot();
    if (!result.success) return socket.emit('error', { message: result.message });
    game.broadcastState();
  });

  // 开始游戏
  socket.on('start_game', ({ roomId = DEFAULT_ROOM } = {}) => {
    const game = getOrCreateRoom(roomId);
    if (game.state !== 'waiting') {
      return socket.emit('error', { message: '游戏已在进行中' });
    }
    const result = game.startGame();
    if (!result.success) return socket.emit('error', { message: result.message });
  });

  // 玩家操作
  socket.on('game_action', ({ roomId = DEFAULT_ROOM, action, amount } = {}) => {
    const game = rooms.get(roomId);
    if (!game) return socket.emit('error', { message: '房间不存在' });

    const result = game.handleAction(socket.user.id, action, amount);
    if (!result.success) return socket.emit('error', { message: result.message });
  });

  // 离开房间
  socket.on('leave_room', ({ roomId = DEFAULT_ROOM } = {}) => {
    handleLeave(socket, roomId);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] 用户 ${socket.user.username}(${socket.id}) 断开连接`);
    if (socket.roomId) handleLeave(socket, socket.roomId);
  });
});

function handleLeave(socket, roomId) {
  const game = rooms.get(roomId);
  if (!game) return;
  game.removePlayer(socket.user.id);
  socket.leave(roomId);
  socket.roomId = null;
  game.broadcastState();
  if (game.players.length === 0) {
    rooms.delete(roomId);
    console.log(`[Room] 房间 ${roomId} 已销毁（无玩家）`);
  }
}

server.listen(PORT, () => {
  console.log(`🃏 Texas Poker Online 运行中: http://0.0.0.0:${PORT}`);
});
