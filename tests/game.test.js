import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Deck } from '../src/game/Deck.js';
import { GameManager } from '../src/game/GameManager.js';
import { GameRoom } from '../src/game/GameRoom.js';
import {
  calculateRoundResult,
  calculateTrickWinner,
  getCardValue,
  isValidMove,
} from '../src/game/GameRules.js';
import { Player } from '../src/game/Player.js';
import { TEAM_A, TEAM_B } from '../src/constants.js';

describe('Deck', () => {
  it('creates exactly 52 cards', () => {
    const deck = new Deck();
    assert.equal(deck.size(), 52);
  });

  it('has unique card ids', () => {
    const deck = new Deck();
    const ids = new Set(deck.cards.map((c) => c.id));
    assert.equal(ids.size, 52);
  });

  it('shuffles without losing cards', () => {
    const deck = new Deck();
    const before = deck.cards.map((c) => c.id).sort();
    deck.shuffle();
    const after = deck.cards.map((c) => c.id).sort();
    assert.deepEqual(after, before);
  });

  it('deals 13 cards to each of 4 players', () => {
    const deck = new Deck().shuffle();
    const hands = deck.deal(4, 13);
    assert.equal(hands.length, 4);
    hands.forEach((hand) => assert.equal(hand.length, 13));
    assert.equal(deck.size(), 0);
  });
});

describe('Card ranking', () => {
  it('orders ranks correctly', () => {
    assert.ok(getCardValue({ rank: 'A' }) > getCardValue({ rank: 'K' }));
    assert.ok(getCardValue({ rank: 'K' }) > getCardValue({ rank: 'Q' }));
    assert.ok(getCardValue({ rank: '10' }) > getCardValue({ rank: '9' }));
    assert.ok(getCardValue({ rank: '3' }) > getCardValue({ rank: '2' }));
  });
});

describe('Follow-suit validation', () => {
  it('allows any card on lead', () => {
    const player = new Player({
      id: '1',
      name: 'A',
      seat: 0,
      team: 0,
      sessionId: 's1',
    });
    player.addCards([
      { id: 'spades-A', suit: 'spades', rank: 'A' },
      { id: 'hearts-2', suit: 'hearts', rank: '2' },
    ]);

    const result = isValidMove(
      player,
      { id: 'spades-A', suit: 'spades', rank: 'A' },
      [],
      'clubs'
    );
    assert.equal(result.valid, true);
  });

  it('requires follow suit when player has lead suit', () => {
    const player = new Player({
      id: '1',
      name: 'A',
      seat: 0,
      team: 0,
      sessionId: 's1',
    });
    player.addCards([
      { id: 'hearts-2', suit: 'hearts', rank: '2' },
      { id: 'spades-A', suit: 'spades', rank: 'A' },
    ]);

    const trick = [
      {
        seat: 1,
        card: { id: 'hearts-10', suit: 'hearts', rank: '10' },
      },
    ];

    const invalid = isValidMove(
      player,
      { id: 'spades-A', suit: 'spades', rank: 'A' },
      trick,
      'clubs'
    );
    assert.equal(invalid.valid, false);

    const valid = isValidMove(
      player,
      { id: 'hearts-2', suit: 'hearts', rank: '2' },
      trick,
      'clubs'
    );
    assert.equal(valid.valid, true);
  });

  it('allows any suit when player cannot follow', () => {
    const player = new Player({
      id: '1',
      name: 'A',
      seat: 0,
      team: 0,
      sessionId: 's1',
    });
    player.addCards([{ id: 'spades-2', suit: 'spades', rank: '2' }]);

    const trick = [
      {
        seat: 1,
        card: { id: 'hearts-10', suit: 'hearts', rank: '10' },
      },
    ];

    const result = isValidMove(
      player,
      { id: 'spades-2', suit: 'spades', rank: '2' },
      trick,
      'spades'
    );
    assert.equal(result.valid, true);
  });

  it('rejects cards not in hand', () => {
    const player = new Player({
      id: '1',
      name: 'A',
      seat: 0,
      team: 0,
      sessionId: 's1',
    });
    player.addCards([{ id: 'spades-2', suit: 'spades', rank: '2' }]);

    const result = isValidMove(
      player,
      { id: 'hearts-A', suit: 'hearts', rank: 'A' },
      [],
      'clubs'
    );
    assert.equal(result.valid, false);
  });
});

describe('Trick winner', () => {
  it('highest lead suit wins when no trump', () => {
    const trick = [
      { seat: 0, card: { suit: 'hearts', rank: 'K' } },
      { seat: 1, card: { suit: 'hearts', rank: 'A' } },
      { seat: 2, card: { suit: 'hearts', rank: '7' } },
      { seat: 3, card: { suit: 'clubs', rank: '2' } },
    ];
    const winner = calculateTrickWinner(trick, 'hearts', 'spades');
    assert.equal(winner.seat, 1);
  });

  it('lowest trump beats high non-trump', () => {
    const trick = [
      { seat: 0, card: { suit: 'hearts', rank: 'K' } },
      { seat: 1, card: { suit: 'hearts', rank: 'A' } },
      { seat: 2, card: { suit: 'hearts', rank: '7' } },
      { seat: 3, card: { suit: 'spades', rank: '2' } },
    ];
    const winner = calculateTrickWinner(trick, 'hearts', 'spades');
    assert.equal(winner.seat, 3);
  });

  it('highest trump wins among multiple trumps', () => {
    const trick = [
      { seat: 0, card: { suit: 'hearts', rank: 'K' } },
      { seat: 1, card: { suit: 'spades', rank: '5' } },
      { seat: 2, card: { suit: 'spades', rank: 'Q' } },
      { seat: 3, card: { suit: 'clubs', rank: 'A' } },
    ];
    const winner = calculateTrickWinner(trick, 'hearts', 'spades');
    assert.equal(winner.seat, 2);
  });
});

describe('Round scoring', () => {
  it('awards win for 3+ tens', () => {
    const result = calculateRoundResult({
      [TEAM_A]: { tricks: 5, tens: 3 },
      [TEAM_B]: { tricks: 8, tens: 1 },
    });
    assert.equal(result.winningTeam, TEAM_A);
    assert.equal(result.resultType, 'tens');
  });

  it('uses tricks when tens are 2-2', () => {
    const result = calculateRoundResult({
      [TEAM_A]: { tricks: 7, tens: 2 },
      [TEAM_B]: { tricks: 6, tens: 2 },
    });
    assert.equal(result.winningTeam, TEAM_A);
    assert.equal(result.resultType, 'tricks');
  });

  it('detects mendikot', () => {
    const result = calculateRoundResult({
      [TEAM_A]: { tricks: 10, tens: 4 },
      [TEAM_B]: { tricks: 3, tens: 0 },
    });
    assert.equal(result.resultType, 'mendikot');
  });

  it('detects whitewash', () => {
    const result = calculateRoundResult({
      [TEAM_A]: { tricks: 13, tens: 4 },
      [TEAM_B]: { tricks: 0, tens: 0 },
    });
    assert.equal(result.resultType, 'whitewash');
  });
});

describe('GameRoom & GameManager', () => {
  it('creates room and joins up to 4 players', () => {
    const manager = new GameManager();
    const room = manager.createRoom('Host', 'sock1');
    assert.ok(room.roomId.length === 6);

    manager.joinRoom(room.roomId, 'P2', 'sock2');
    manager.joinRoom(room.roomId, 'P3', 'sock3');
    manager.joinRoom(room.roomId, 'P4', 'sock4');
    assert.equal(room.players.length, 4);
  });

  it('rejects 5th player', () => {
    const manager = new GameManager();
    const room = manager.createRoom('Host', 'sock1');
    manager.joinRoom(room.roomId, 'P2', 'sock2');
    manager.joinRoom(room.roomId, 'P3', 'sock3');
    manager.joinRoom(room.roomId, 'P4', 'sock4');

    assert.throws(
      () => manager.joinRoom(room.roomId, 'P5', 'sock5'),
      /full/i
    );
  });

  it('rejects invalid room code', () => {
    const manager = new GameManager();
    assert.throws(() => manager.joinRoom('ZZZZZZ', 'P1', 'sock1'), /not found/i);
  });

  it('deals private hands and starts round', () => {
    const room = new GameRoom('Host', 'sock1');
    room.addPlayer('P2', 'sock2');
    room.addPlayer('P3', 'sock3');
    room.addPlayer('P4', 'sock4');
    room.startRound();

    assert.equal(room.gameStatus, 'playing');
    assert.ok(room.trumpSuit);
    room.players.forEach((p) => assert.equal(p.hand.length, 13));

    const state0 = room.getStateForPlayer('sock1');
    const state1 = room.getStateForPlayer('sock2');
    assert.equal(state0.yourHand.length, 13);
    assert.equal(state1.yourHand.length, 13);
    // Hands must differ (extremely unlikely identical after shuffle)
    assert.notDeepEqual(
      state0.yourHand.map((c) => c.id).sort(),
      state1.yourHand.map((c) => c.id).sort()
    );
    // Public player data must not include hands
    assert.equal(state0.players[1].hand, undefined);
  });

  it('rejects playing out of turn', () => {
    const room = new GameRoom('Host', 'sock1');
    room.addPlayer('P2', 'sock2');
    room.addPlayer('P3', 'sock3');
    room.addPlayer('P4', 'sock4');
    room.startRound();

    const notTurn = room.players.find((p) => p.seat !== room.currentPlayerIndex);
    const result = room.playCard(notTurn.id, notTurn.hand[0].id);
    assert.equal(result.ok, false);
    assert.match(result.message, /not your turn/i);
  });

  it('resets round state on play again', () => {
    const room = new GameRoom('Host', 'sock1');
    room.addPlayer('P2', 'sock2');
    room.addPlayer('P3', 'sock3');
    room.addPlayer('P4', 'sock4');
    room.startRound();

    const firstTrump = room.trumpSuit;
    const firstHands = room.players.map((p) => p.hand.map((c) => c.id).sort());

    // Force round complete path
    room.gameStatus = 'round_complete';
    room.teamScores = {
      [TEAM_A]: { tricks: 8, tens: 3 },
      [TEAM_B]: { tricks: 5, tens: 1 },
    };
    room.roundResult = calculateRoundResult(room.teamScores);
    room.requestNewRound();

    assert.equal(room.roundNumber, 2);
    assert.equal(room.completedTricks.length, 0);
    assert.equal(room.currentTrick.length, 0);
    assert.equal(room.teamScores[TEAM_A].tricks, 0);
    assert.equal(room.teamScores[TEAM_A].tens, 0);
    room.players.forEach((p) => assert.equal(p.hand.length, 13));

    const secondHands = room.players.map((p) => p.hand.map((c) => c.id).sort());
    // New deal should differ from previous (shuffle)
    assert.notDeepEqual(firstHands, secondHands);
    assert.ok(room.trumpSuit);
    // Trump may coincidentally match; just ensure round reset happened
    void firstTrump;
  });

  it('cleans up empty rooms', () => {
    const manager = new GameManager({ roomInactiveMs: 0 });
    const room = manager.createRoom('Host', 'sock1');
    const id = room.roomId;
    manager.leaveRoom('sock1');
    assert.equal(manager.getRoom(id), null);
  });

  it('supports disconnect and reconnect', () => {
    const room = new GameRoom('Host', 'sock1');
    room.addPlayer('P2', 'sock2');
    const sessionId = room.players[0].sessionId;

    room.markDisconnected('sock1');
    assert.equal(room.players[0].connected, false);

    const restored = room.reconnect(sessionId, 'sock1-new');
    assert.ok(restored);
    assert.equal(restored.id, 'sock1-new');
    assert.equal(restored.connected, true);
  });

  it('assigns opposite seats to the same team', () => {
    const room = new GameRoom('Host', 'sock1');
    room.addPlayer('P2', 'sock2');
    room.addPlayer('P3', 'sock3');
    room.addPlayer('P4', 'sock4');

    assert.equal(room.players[0].team, TEAM_A);
    assert.equal(room.players[1].team, TEAM_B);
    assert.equal(room.players[2].team, TEAM_A);
    assert.equal(room.players[3].team, TEAM_B);
  });
});
