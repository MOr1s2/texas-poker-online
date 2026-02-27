'use strict';

class Deck {
  constructor() {
    this.cards = [];
    this.reset();
  }

  reset() {
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    this.cards = [];
    for (const suit of suits) {
      for (const rank of ranks) {
        this.cards.push({ suit, rank, value: this._rankValue(rank) });
      }
    }
  }

  _rankValue(rank) {
    const map = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
                  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
    return map[rank];
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
    return this;
  }

  deal() {
    if (this.cards.length === 0) throw new Error('牌组已空');
    return this.cards.pop();
  }

  remaining() {
    return this.cards.length;
  }
}

module.exports = Deck;
