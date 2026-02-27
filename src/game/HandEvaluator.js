'use strict';

/**
 * HandEvaluator - 7张牌中选最优5张
 * rank: 皇家同花顺=8, 同花顺=7, 四条=6, 葫芦=5,
 *       同花=4, 顺子=3, 三条=2, 两对=1, 一对=0, 高牌=-1
 */
class HandEvaluator {
  /**
   * @param {Array} cards - 最多7张 { suit, rank, value }
   * @returns {{ rank, value, description }}
   */
  static evaluate(cards) {
    if (!cards || cards.length < 2) return { rank: -1, value: [0], description: '高牌' };
    // 从 cards 中选出所有 C(n,5) 组合，取最优
    const combos = this._combinations(cards, Math.min(cards.length, 5) === 5 ? 5 : 5);
    let best = null;
    for (const combo of combos) {
      const result = this._evaluate5(combo);
      if (!best || this._compare(result, best) > 0) best = result;
    }
    return best;
  }

  static _combinations(arr, k) {
    const result = [];
    const combo = [];
    function helper(start) {
      if (combo.length === k) { result.push([...combo]); return; }
      for (let i = start; i < arr.length; i++) {
        combo.push(arr[i]);
        helper(i + 1);
        combo.pop();
      }
    }
    helper(0);
    return result;
  }

  static _evaluate5(cards) {
    // 按点数降序排列
    const sorted = [...cards].sort((a, b) => b.value - a.value);
    const values = sorted.map(c => c.value);
    const suits = sorted.map(c => c.suit);

    const isFlush = suits.every(s => s === suits[0]);
    const isStraight = this._isStraight(values);
    const isWheelStraight = this._isWheelStraight(values); // A-2-3-4-5

    // 计数
    const counts = {};
    for (const v of values) counts[v] = (counts[v] || 0) + 1;
    const groups = Object.entries(counts)
      .map(([v, c]) => ({ v: Number(v), c }))
      .sort((a, b) => b.c - a.c || b.v - a.v);

    const maxCount = groups[0].c;
    const secondCount = groups[1] ? groups[1].c : 0;

    // 皇家同花顺
    if (isFlush && isStraight && values[0] === 14 && values[4] === 10) {
      return { rank: 8, value: values, description: '皇家同花顺' };
    }
    // 同花顺
    if (isFlush && (isStraight || isWheelStraight)) {
      const v = isWheelStraight ? [5, 4, 3, 2, 1] : values;
      return { rank: 7, value: v, description: '同花顺' };
    }
    // 四条
    if (maxCount === 4) {
      const quad = groups[0].v;
      const kicker = groups[1].v;
      return { rank: 6, value: [quad, quad, quad, quad, kicker], description: '四条' };
    }
    // 葫芦
    if (maxCount === 3 && secondCount === 2) {
      const triple = groups[0].v;
      const pair = groups[1].v;
      return { rank: 5, value: [triple, triple, triple, pair, pair], description: '葫芦' };
    }
    // 同花
    if (isFlush) {
      return { rank: 4, value: values, description: '同花' };
    }
    // 顺子
    if (isStraight) {
      return { rank: 3, value: values, description: '顺子' };
    }
    if (isWheelStraight) {
      return { rank: 3, value: [5, 4, 3, 2, 1], description: '顺子' };
    }
    // 三条
    if (maxCount === 3) {
      const triple = groups[0].v;
      const kickers = groups.slice(1).map(g => g.v).sort((a, b) => b - a);
      return { rank: 2, value: [triple, triple, triple, ...kickers], description: '三条' };
    }
    // 两对
    if (maxCount === 2 && secondCount === 2) {
      const high = Math.max(groups[0].v, groups[1].v);
      const low = Math.min(groups[0].v, groups[1].v);
      const kicker = groups[2].v;
      return { rank: 1, value: [high, high, low, low, kicker], description: '两对' };
    }
    // 一对
    if (maxCount === 2) {
      const pair = groups[0].v;
      const kickers = groups.slice(1).map(g => g.v).sort((a, b) => b - a);
      return { rank: 0, value: [pair, pair, ...kickers], description: '一对' };
    }
    // 高牌
    return { rank: -1, value: values, description: '高牌' };
  }

  static _isStraight(values) {
    // values 已降序
    for (let i = 0; i < values.length - 1; i++) {
      if (values[i] - values[i + 1] !== 1) return false;
    }
    return true;
  }

  static _isWheelStraight(values) {
    // A-2-3-4-5 → values sorted desc: [14,5,4,3,2]
    return values[0] === 14 && values[1] === 5 && values[2] === 4 &&
           values[3] === 3 && values[4] === 2;
  }

  /**
   * 比较两个评估结果，返回正数则 a 更好
   */
  static _compare(a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    for (let i = 0; i < a.value.length; i++) {
      if (a.value[i] !== b.value[i]) return a.value[i] - b.value[i];
    }
    return 0;
  }

  static compare(a, b) {
    return this._compare(a, b);
  }
}

module.exports = HandEvaluator;
