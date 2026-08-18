/**
 * In-memory player representation for a room seat.
 */
export class Player {
  constructor({ id, name, seat, team, sessionId }) {
    this.id = id;
    this.name = name;
    this.seat = seat;
    this.team = team;
    this.sessionId = sessionId;
    this.hand = [];
    this.connected = true;
    this.tricksWon = 0;
    this.tensCaptured = 0;
  }

  addCards(cards) {
    this.hand = [...cards];
  }

  hasCard(cardId) {
    return this.hand.some((card) => card.id === cardId);
  }

  removeCard(cardId) {
    const index = this.hand.findIndex((card) => card.id === cardId);

    if (index === -1) {
      return null;
    }

    const [card] = this.hand.splice(index, 1);
    return card;
  }

  getCard(cardId) {
    return this.hand.find((card) => card.id === cardId) || null;
  }

  clearHand() {
    this.hand = [];
  }

  resetRoundStats() {
    this.tricksWon = 0;
    this.tensCaptured = 0;
    this.clearHand();
  }

  toPublic() {
    return {
      id: this.id,
      name: this.name,
      seat: this.seat,
      team: this.team,
      connected: this.connected,
      cardCount: this.hand.length,
      tricksWon: this.tricksWon,
      tensCaptured: this.tensCaptured,
    };
  }
}
