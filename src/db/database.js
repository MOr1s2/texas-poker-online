'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/poker.db');

// 确保目录存在
const fs = require('fs');
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);

// 初始化表结构
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT    NOT NULL UNIQUE,
    password_hash   TEXT    NOT NULL,
    balance         INTEGER NOT NULL DEFAULT 2000,
    last_daily_bonus TEXT   DEFAULT NULL,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

// ── 用户操作 ─────────────────────────────────────────

function createUser(username, passwordHash) {
  const stmt = db.prepare(`
    INSERT INTO users (username, password_hash, balance)
    VALUES (?, ?, 2000)
  `);
  return stmt.run(username, passwordHash);
}

function findUser(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function findUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function updateBalance(userId, newBalance) {
  db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(newBalance, userId);
}

/**
 * 每日奖励：同天只能领一次
 * @returns {{ claimed: boolean, bonus: number }}
 */
function claimDailyBonus(userId) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const user = findUserById(userId);
  if (!user) return { claimed: false, bonus: 0 };

  if (user.last_daily_bonus === today) {
    return { claimed: false, bonus: 0 };
  }

  const bonus = 2000;
  db.prepare(`
    UPDATE users SET balance = balance + ?, last_daily_bonus = ? WHERE id = ?
  `).run(bonus, today, userId);

  return { claimed: true, bonus };
}

module.exports = { createUser, findUser, findUserById, updateBalance, claimDailyBonus };
