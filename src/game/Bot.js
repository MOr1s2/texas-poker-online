'use strict';

const HandEvaluator = require('./HandEvaluator');

/**
 * Bot - 基于概率的机器人决策
 */
class Bot {
  /**
   * @param {Array}  handCards       - 手牌 [{suit,rank,value},...]
   * @param {Array}  communityCards  - 公共牌
   * @param {number} pot             - 当前底池
   * @param {number} callAmount      - 跟注需要的筹码
   * @param {number} myBalance       - 当前筹码
   * @returns {{ action: 'fold'|'check'|'call'|'raise', amount?: number }}
   */
  static decide(handCards, communityCards, pot, callAmount, myBalance) {
    const isPreflop = communityCards.length === 0;
    let strength;

    if (isPreflop) {
      strength = Bot._preflopStrength(handCards);
    } else {
      strength = Bot._postflopStrength(handCards, communityCards);
    }

    // 20% 虚张声势
    const bluffing = Math.random() < 0.2;

    const effectiveStrength = bluffing ? Math.min(1, strength + 0.3) : strength;
    const canCheck = callAmount === 0;

    if (effectiveStrength >= 0.75) {
      // 强牌：加注
      const raiseAmt = Math.min(
        Math.max(callAmount * 2, Math.floor(pot * 0.75)),
        myBalance
      );
      return { action: 'raise', amount: raiseAmt };
    } else if (effectiveStrength >= 0.45) {
      // 中等：跟注或check
      if (canCheck) return { action: 'check' };
      if (callAmount <= myBalance * 0.3) return { action: 'call' };
      return { action: 'fold' };
    } else {
      // 弱牌：check 或 fold
      if (canCheck) return { action: 'check' };
      if (callAmount <= myBalance * 0.1) return { action: 'call' };
      return { action: 'fold' };
    }
  }

  // 起手牌强度（0~1）
  static _preflopStrength(hand) {
    if (!hand || hand.length < 2) return 0.2;
    const [a, b] = hand.map(c => c.value).sort((x, y) => y - x);
    const suited = hand[0].suit === hand[1].suit;
    const paired = a === b;

    if (paired) {
      if (a >= 10) return 0.95;
      if (a >= 7) return 0.75;
      return 0.55;
    }
    if (a === 14) {
      if (b >= 10) return suited ? 0.90 : 0.85;
      if (b >= 7)  return suited ? 0.75 : 0.65;
      return suited ? 0.60 : 0.50;
    }
    if (a === 13 && b >= 10) return suited ? 0.80 : 0.70;
    if (a >= 10 && b >= 10)  return suited ? 0.78 : 0.68;
    if (a >= 10 && suited)    return 0.55;
    if (a - b <= 2 && suited) return 0.50;
    if (a - b <= 3)           return 0.35;
    return 0.20;
  }

  // flop/turn/river 胜率估算
  static _postflopStrength(hand, community) {
    const all = [...hand, ...community];
    const result = HandEvaluator.evaluate(all);
    // rank: 8=皇家同花顺 ... -1=高牌
    const rankMap = { 8: 1.0, 7: 0.95, 6: 0.90, 5: 0.80, 4: 0.70, 3: 0.60, 2: 0.50, 1: 0.40, 0: 0.30, '-1': 0.15 };
    return rankMap[result.rank] || 0.15;
  }
}

module.exports = Bot;
