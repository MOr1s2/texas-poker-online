# 🃏 Texas Poker Online

多人联机德州扑克游戏

## 安装

```bash
npm install
```

## 启动

```bash
node server.js
# 默认端口 3000，访问 http://IP:3000
```

## 功能

- 多人联机（2-9人）
- 机器人支持
- 注册/登录，初始 2000 筹码
- 每日登录领 2000 筹码
- 小盲注 10，大盲注 20

## 技术栈

- 后端：Node.js + Express + Socket.io
- 前端：原生 HTML + CSS + JavaScript
- 数据库：SQLite（better-sqlite3）
- 认证：JWT

## 游戏规则

- 标准德州扑克规则
- 小盲注：10，大盲注：20
- 支持 fold / check / call / raise / all-in
- showdown 时自动比牌决出赢家
