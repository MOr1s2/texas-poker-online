'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'texas-poker-secret-2024';
const JWT_EXPIRES = '7d';

// POST /api/register
router.post('/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
  }
  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ success: false, message: '用户名长度 2-20 位' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: '密码至少 6 位' });
  }

  const existing = db.findUser(username);
  if (existing) {
    return res.status(409).json({ success: false, message: '用户名已存在' });
  }

  const hash = await bcrypt.hash(password, 10);
  try {
    const result = db.createUser(username, hash);
    const token = jwt.sign({ id: result.lastInsertRowid, username }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    return res.json({ success: true, token, username, balance: 2000, message: '注册成功，初始筹码 2000' });
  } catch (e) {
    return res.status(500).json({ success: false, message: '注册失败: ' + e.message });
  }
});

// POST /api/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
  }

  const user = db.findUser(username);
  if (!user) return res.status(401).json({ success: false, message: '用户名或密码错误' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ success: false, message: '用户名或密码错误' });

  // 每日奖励
  const daily = db.claimDailyBonus(user.id);
  const updated = db.findUserById(user.id);

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  return res.json({
    success: true,
    token,
    username: user.username,
    balance: updated.balance,
    dailyBonus: daily
  });
});

// GET /api/me
router.get('/me', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '未认证' });
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.findUserById(payload.id);
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
    return res.json({
      success: true,
      id: user.id,
      username: user.username,
      balance: user.balance,
      created_at: user.created_at
    });
  } catch (e) {
    return res.status(401).json({ success: false, message: 'token 无效' });
  }
});

module.exports = router;
