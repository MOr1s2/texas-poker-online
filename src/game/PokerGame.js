'use strict';

const Deck = require('./Deck');
const HandEvaluator = require('./HandEvaluator');
const Bot = require('./Bot');
const db = require('../db/database');

const SMALL_BLIND = 10;
const BIG_BLIND = 20;
let botCounter = 0;

class PokerGame {
  constructor(roomId, io) {
    this.roomId = roomId;
    this.io = io;
    this.players = [];       // { id, socketId, username, balance, handCards, bet, folded, allIn, isBot }
    this.state = 'waiting';  // waiting|preflop|flop|turn|river|showdown
    this.deck = new Deck();
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.currentBet = 0;
    this.dealerIndex = 0;
    this.currentPlayerIndex = 0;
    this.lastRaiserIndex = -1;
    this.roundBets = {};     // playerId -> 本轮已投入
    this.log = [];
  }

  // ── 玩家管理 ──────────────────────────────────────────
  addPlayer(info) {
    if (this.state !== 'waiting') return { success: false, message: '游戏进行中' };
    if (this.players.length >= 9) return { success: false, message: '座位已满' };
    if (this.players.find(p => p.id === info.id)) return { success: false, message: '已在房间中' };

    this.players.push({
      id: info.id,
      socketId: info.socketId,
      username: info.username,
      balance: info.balance,
      handCards: [],
      bet: 0,
      folded: false,
      allIn: false,
      isBot: false,
      seatIndex: this.players.length
    });
    this._addLog(`${info.username} 加入了游戏`);
    return { success: true };
  }

  addBot() {
    if (this.players.length >= 9) return { success: false, message: '座位已满' };
    botCounter++;
    const botName = `Bot-${botCounter}`;
    this.players.push({
      id: `bot_${botCounter}`,
      socketId: null,
      username: botName,
      balance: 2000,
      handCards: [],
      bet: 0,
      folded: false,
      allIn: false,
      isBot: true,
      seatIndex: this.players.length
    });
    this._addLog(`${botName} 加入了游戏`);
    return { success: true };
  }

  removePlayer(playerId) {
    const idx = this.players.findIndex(p => p.id === playerId);
    if (idx === -1) return;
    const p = this.players[idx];
    // 如果游戏进行中，自动 fold
    if (this.state !== 'waiting') {
      p.folded = true;
      this._addLog(`${p.username} 离开了游戏（自动弃牌）`);
      // 检查是否轮到该玩家
      if (this._activeIndex() === idx) this._nextTurn();
    } else {
      this.players.splice(idx, 1);
      this._renumberSeats();
    }
  }

  _renumberSeats() {
    this.players.forEach((p, i) => p.seatIndex = i);
  }

  // ── 游戏流程 ──────────────────────────────────────────
  startGame() {
    const activePlayers = this.players.filter(p => p.balance > 0);
    if (activePlayers.length < 2) return { success: false, message: '至少需要2名玩家' };

    this.deck.reset().shuffle();
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.currentBet = 0;
    this.roundBets = {};
    this.log = [];

    // 重置玩家状态
    for (const p of this.players) {
      p.handCards = [];
      p.bet = 0;
      p.folded = p.balance === 0; // 没钱的自动fold
      p.allIn = false;
    }

    // 移动庄家按钮（跳过余额为0的）
    this._moveDealerButton();

    // 发手牌
    const activeP = this.players.filter(p => !p.folded);
    for (let i = 0; i < 2; i++) {
      for (const p of activeP) {
        p.handCards.push(this.deck.deal());
      }
    }

    this.state = 'preflop';
    this._addLog('--- 新一局开始 ---');

    // 强制下注：小盲+大盲
    this._postBlinds();

    this.broadcastState();
    this._scheduleNextBot();
    return { success: true };
  }

  _moveDealerButton() {
    const eligible = this.players.filter(p => p.balance > 0);
    if (eligible.length === 0) return;
    let next = (this.dealerIndex + 1) % this.players.length;
    let tries = 0;
    while (this.players[next].balance === 0 && tries < this.players.length) {
      next = (next + 1) % this.players.length;
      tries++;
    }
    this.dealerIndex = next;
  }

  _postBlinds() {
    const active = this.players.filter(p => !p.folded);
    if (active.length < 2) return;

    const dealerIdx = this.players.indexOf(active[0]); // 简化：以第一活跃玩家为庄
    const sbPlayer = active[active.length >= 3 ? 1 : 0];
    const bbPlayer = active[active.length >= 3 ? 2 : 1];

    this._forceBet(sbPlayer, SMALL_BLIND);
    this._forceBet(bbPlayer, BIG_BLIND);
    this.currentBet = BIG_BLIND;
    this.lastRaiserIndex = this.players.indexOf(bbPlayer);

    this._addLog(`${sbPlayer.username} 小盲注 ${SMALL_BLIND}`);
    this._addLog(`${bbPlayer.username} 大盲注 ${BIG_BLIND}`);

    // 行动从大盲注下一位开始
    const activeNonFolded = this.players.filter(p => !p.folded && !p.allIn);
    const bbGlobalIdx = this.players.indexOf(bbPlayer);
    this.currentPlayerIndex = this._nextActiveIndex(bbGlobalIdx);
  }

  _forceBet(player, amount) {
    const actual = Math.min(amount, player.balance);
    player.balance -= actual;
    player.bet += actual;
    this.roundBets[player.id] = (this.roundBets[player.id] || 0) + actual;
    this.pot += actual;
    if (player.balance === 0) player.allIn = true;
  }

  // ── 玩家操作 ─────────────────────────────────────────
  handleAction(playerId, action, amount) {
    if (this.state === 'waiting' || this.state === 'showdown') {
      return { success: false, message: '当前不接受操作' };
    }

    const player = this.players[this.currentPlayerIndex];
    if (!player || player.id !== playerId) {
      return { success: false, message: '还没轮到你' };
    }

    const callAmount = this.currentBet - (this.roundBets[playerId] || 0);

    switch (action) {
      case 'fold':
        player.folded = true;
        this._addLog(`${player.username} 弃牌`);
        break;

      case 'check':
        if (callAmount > 0) return { success: false, message: '需要跟注，不能 check' };
        this._addLog(`${player.username} 过牌`);
        break;

      case 'call': {
        const toCall = Math.min(callAmount, player.balance);
        if (toCall <= 0) return { success: false, message: '无需跟注' };
        this._forceBet(player, toCall);
        this._addLog(`${player.username} 跟注 ${toCall}`);
        break;
      }

      case 'raise': {
        const raiseAmount = Number(amount) || 0;
        const minRaise = callAmount + BIG_BLIND;
        if (raiseAmount < minRaise && raiseAmount < player.balance) {
          return { success: false, message: `最小加注 ${minRaise}` };
        }
        const totalBet = Math.min(raiseAmount, player.balance);
        this._forceBet(player, totalBet);
        this.currentBet = this.roundBets[player.id];
        this.lastRaiserIndex = this.currentPlayerIndex;
        this._addLog(`${player.username} 加注至 ${this.currentBet}`);
        break;
      }

      default:
        return { success: false, message: '未知操作' };
    }

    // 广播操作
    this.io.to(this.roomId).emit('player_action', {
      username: player.username,
      action,
      amount: amount || 0,
      pot: this.pot
    });

    this._nextTurn();
    return { success: true };
  }

  _nextTurn() {
    // 检查只剩一人未弃牌
    const standing = this.players.filter(p => !p.folded);
    if (standing.length === 1) {
      this._endRound(standing);
      return;
    }

    // 检查本轮是否结束
    if (this._isRoundOver()) {
      this._advanceStage();
      return;
    }

    // 找下一个可以行动的玩家
    this.currentPlayerIndex = this._nextActiveIndex(this.currentPlayerIndex);
    this.broadcastState();
    this._scheduleNextBot();
  }

  _isRoundOver() {
    const canAct = this.players.filter(p => !p.folded && !p.allIn);
    if (canAct.length === 0) return true;

    // 所有可行动玩家都已下注到 currentBet
    for (const p of canAct) {
      if ((this.roundBets[p.id] || 0) < this.currentBet) return false;
    }

    // preflop：大盲注玩家还有权利加注（如果没人加注过）
    if (this.state === 'preflop') {
      const bbRoundBet = this.roundBets;
      // 如果 lastRaiserIndex 是大盲注位置，说明没人再加注，让大盲注行动一次
      // 简化：如果 currentPlayerIndex 还在大盲注位置就允许行动
    }

    return true;
  }

  _nextActiveIndex(fromIndex) {
    let idx = (fromIndex + 1) % this.players.length;
    let tries = 0;
    while ((this.players[idx].folded || this.players[idx].allIn) && tries < this.players.length) {
      idx = (idx + 1) % this.players.length;
      tries++;
    }
    return idx;
  }

  _activeIndex() {
    return this.currentPlayerIndex;
  }

  _advanceStage() {
    const stages = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    const idx = stages.indexOf(this.state);
    if (idx === -1 || idx >= stages.length - 1) {
      this._doShowdown();
      return;
    }
    this.state = stages[idx + 1];
    // 重置本轮下注
    this.roundBets = {};
    this.currentBet = 0;
    for (const p of this.players) {
      if (!p.folded) p.bet = 0;
    }

    if (this.state === 'flop') {
      for (let i = 0; i < 3; i++) this.communityCards.push(this.deck.deal());
      this._addLog(`翻牌: ${this._cardsStr(this.communityCards)}`);
    } else if (this.state === 'turn') {
      this.communityCards.push(this.deck.deal());
      this._addLog(`转牌: ${this._cardsStr([this.communityCards[3]])}`);
    } else if (this.state === 'river') {
      this.communityCards.push(this.deck.deal());
      this._addLog(`河牌: ${this._cardsStr([this.communityCards[4]])}`);
    } else if (this.state === 'showdown') {
      this._doShowdown();
      return;
    }

    // 从庄家左手第一个活跃玩家开始
    this.currentPlayerIndex = this._nextActiveIndex(this.dealerIndex);
    this.lastRaiserIndex = -1;
    this.broadcastState();
    this._scheduleNextBot();
  }

  _doShowdown() {
    this.state = 'showdown';
    const standing = this.players.filter(p => !p.folded);

    if (standing.length === 1) {
      this._endRound(standing);
      return;
    }

    // 评估手牌
    const results = standing.map(p => ({
      player: p,
      eval: HandEvaluator.evaluate([...p.handCards, ...this.communityCards])
    }));

    results.sort((a, b) => HandEvaluator.compare(b.eval, a.eval));
    const winner = results[0].player;
    winner.balance += this.pot;

    this._addLog(`--- Showdown ---`);
    for (const r of results) {
      this._addLog(`${r.player.username}: ${r.eval.description} (${this._cardsStr(r.player.handCards)})`);
    }
    this._addLog(`🏆 ${winner.username} 赢得底池 ${this.pot}`);

    // 保存余额到数据库
    for (const p of this.players) {
      if (!p.isBot) {
        try { db.updateBalance(p.id, p.balance); } catch (e) {}
      }
    }

    const winData = {
      winner: winner.username,
      amount: this.pot,
      handDesc: results[0].eval.description,
      players: results.map(r => ({
        username: r.player.username,
        handCards: r.player.handCards,
        handDesc: r.eval.description
      }))
    };

    this.io.to(this.roomId).emit('game_over', winData);
    this.pot = 0;

    // 移除余额为0的玩家，3秒后自动开始下一局
    setTimeout(() => {
      this._cleanupBrokePlayers();
      const eligible = this.players.filter(p => p.balance > 0);
      if (eligible.length >= 2) {
        this.state = 'waiting';
        this.io.to(this.roomId).emit('new_round', { message: '准备开始新一局...' });
        setTimeout(() => this.startGame(), 2000);
      } else {
        this.state = 'waiting';
        this.broadcastState();
      }
    }, 5000);
  }

  _endRound(standing) {
    const winner = standing[0];
    winner.balance += this.pot;
    this._addLog(`🏆 ${winner.username} 赢得底池 ${this.pot}（其他玩家弃牌）`);

    if (!winner.isBot) {
      try { db.updateBalance(winner.id, winner.balance); } catch (e) {}
    }

    this.io.to(this.roomId).emit('game_over', {
      winner: winner.username,
      amount: this.pot,
      handDesc: '其他玩家弃牌'
    });
    this.pot = 0;

    setTimeout(() => {
      this._cleanupBrokePlayers();
      const eligible = this.players.filter(p => p.balance > 0);
      if (eligible.length >= 2) {
        this.state = 'waiting';
        this.io.to(this.roomId).emit('new_round', { message: '准备开始新一局...' });
        setTimeout(() => this.startGame(), 2000);
      } else {
        this.state = 'waiting';
        this.broadcastState();
      }
    }, 3000);
  }

  _cleanupBrokePlayers() {
    this.players = this.players.filter(p => p.balance > 0 || !p.isBot);
    this._renumberSeats();
  }

  // ── 机器人自动决策 ────────────────────────────────────
  _scheduleNextBot() {
    const player = this.players[this.currentPlayerIndex];
    if (!player || !player.isBot || player.folded || player.allIn) return;

    setTimeout(() => {
      if (this.state === 'waiting' || this.state === 'showdown') return;
      const cur = this.players[this.currentPlayerIndex];
      if (!cur || !cur.isBot) return;

      const callAmount = this.currentBet - (this.roundBets[cur.id] || 0);
      const decision = Bot.decide(
        cur.handCards,
        this.communityCards,
        this.pot,
        callAmount,
        cur.balance
      );

      this.handleAction(cur.id, decision.action, decision.amount);
    }, 800 + Math.random() * 700);
  }

  // ── 广播状态 ─────────────────────────────────────────
  broadcastState() {
    const currentPlayer = this.players[this.currentPlayerIndex];

    // 对每个玩家发送定制状态（隐藏其他人手牌）
    for (const p of this.players) {
      if (!p.socketId) continue; // bot 无 socket
      const state = this._buildState(p.id);
      this.io.to(p.socketId).emit('game_state', state);
    }

    // 同时广播公共状态（不含手牌）给旁观者/同房间其他连接
    const publicState = this._buildState(null);
    this.io.to(this.roomId).emit('game_state', publicState);
  }

  _buildState(forPlayerId) {
    const currentPlayer = this.players[this.currentPlayerIndex];
    return {
      state: this.state,
      roomId: this.roomId,
      pot: this.pot,
      currentBet: this.currentBet,
      communityCards: this.communityCards,
      currentPlayer: currentPlayer ? currentPlayer.username : null,
      dealerIndex: this.dealerIndex,
      players: this.players.map(p => ({
        id: p.id,
        username: p.username,
        balance: p.balance,
        bet: p.bet,
        folded: p.folded,
        allIn: p.allIn,
        isBot: p.isBot,
        seatIndex: p.seatIndex,
        handCards: p.id === forPlayerId ? p.handCards :
                   (this.state === 'showdown' && !p.folded ? p.handCards : []),
        isCurrentPlayer: currentPlayer && p.id === currentPlayer.id
      })),
      log: this.log.slice(-30),
      callAmount: forPlayerId ?
        Math.max(0, this.currentBet - (this.roundBets[forPlayerId] || 0)) : 0
    };
  }

  // ── 工具 ─────────────────────────────────────────────
  _addLog(msg) {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    this.log.push(`[${time}] ${msg}`);
    if (this.log.length > 200) this.log.shift();
  }

  _cardsStr(cards) {
    return cards.map(c => `${c.suit}${c.rank}`).join(' ');
  }
}

module.exports = PokerGame;
