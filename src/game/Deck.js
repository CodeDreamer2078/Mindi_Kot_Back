import { SUITS, RANKS } from '../constants.js';

/**
 * Creates a standard 52-card deck and supports Fisher-Yates shuffle + dealing.
 */
export class Deck {
  constructor() {
    this.cards = Deck.createDeck();
  }

  static createDeck() {
    const cards = [];

    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({
          id: `${suit}-${rank}`,
          suit,
          rank,
        });
      }
    }

    return cards;
  }

  /**
   * Fisher-Yates shuffle (in-place).
   */
  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }

    return this;
  }

  deal(playerCount, cardsPerPlayer) {
    const expected = playerCount * cardsPerPlayer;

    if (this.cards.length < expected) {
      throw new Error('Not enough cards to deal');
    }

    const hands = Array.from({ length: playerCount }, () => []);

    for (let i = 0; i < expected; i += 1) {
      hands[i % playerCount].push(this.cards[i]);
    }

    this.cards = this.cards.slice(expected);
    return hands;
  }

  size() {
    return this.cards.length;
  }

  reset() {
    this.cards = Deck.createDeck();
    return this;
  }
}
