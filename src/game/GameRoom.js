import { randomBytes } from 'crypto';
import {
  CARDS_PER_PLAYER,
  GAME_STATUS,
  MAX_PLAYERS,
  TEAM_A,
  TEAM_B,
  TOTAL_TRICKS,
} from '../constants.js';
import { Deck } from './Deck.js';
import { Player } from './Player.js';
import {
  calculateRoundResult,
  calculateTrickWinner,
  countTensInTrick,
  determineTrump,
  getPlayableCardIds,
  isValidMove,
} from './GameRules.js';

function generateRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';

  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[bytes[i] % alphabet.length];
  }

  return code;
}

function generateSessionId() {
  return randomBytes(16).toString('hex');
}

/**
 * One game room held entirely in memory.
 */
export class GameRoom {
  constructor(hostName, hostSocketId) {
    this.roomId = generateRoomCode();
    this.players = [];
    this.deck = null;
    this.trumpSuit = null;
    this.currentPlayerIndex = 0;
    this.currentTrick = [];
    this.completedTricks = [];
    this.teamScores = {
      [TEAM_A]: { tricks: 0, tens: 0 },
      [TEAM_B]: { tricks: 0, tens: 0 },
    };
    this.roundNumber = 0;
    this.gameStatus = GAME_STATUS.WAITING;
    this.dealerSeat = 0;
    this.lastTrickWinner = null;
    this.roundResult = null;
    this.chat = [];
    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();
    this.disconnectTimers = new Map();

    this.addPlayer(hostName, hostSocketId);
  }

  touch() {
    this.lastActivityAt = Date.now();
  }

  addPlayer(name, socketId) {
    if (this.players.length >= MAX_PLAYERS) {
      throw new Error('Room is full');
    }

    const trimmed = (name || '').trim();

    if (trimmed.length < 1 || trimmed.length > 20) {
      throw new Error('Player name must be 1–20 characters');
    }

    if (this.players.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new Error('That name is already taken in this room');
    }

    if (this.gameStatus !== GAME_STATUS.WAITING) {
      throw new Error('Game already in progress');
    }

    const seat = this.players.length;
    const team = seat % 2 === 0 ? TEAM_A : TEAM_B;
    const sessionId = generateSessionId();

    const player = new Player({
      id: socketId,
      name: trimmed,
      seat,
      team,
      sessionId,
    });

    this.players.push(player);
    this.touch();

    return player;
  }

  getPlayerBySocketId(socketId) {
    return this.players.find((p) => p.id === socketId) || null;
  }

  getPlayerBySessionId(sessionId) {
    return this.players.find((p) => p.sessionId === sessionId) || null;
  }

  getPlayerBySeat(seat) {
    return this.players.find((p) => p.seat === seat) || null;
  }

  isFull() {
    return this.players.length === MAX_PLAYERS;
  }

  allConnected() {
    return this.players.every((p) => p.connected);
  }

  /**
   * Deal cards, pick trump, start play. Completely replaces prior round state.
   */
  startRound() {
    if (!this.isFull()) {
      throw new Error('Need 4 players to start');
    }

    this.deck = new Deck().shuffle();
    const hands = this.deck.deal(MAX_PLAYERS, CARDS_PER_PLAYER);

    for (let i = 0; i < MAX_PLAYERS; i += 1) {
      this.players[i].resetRoundStats();
      this.players[i].addCards(hands[i]);
    }

    this.trumpSuit = determineTrump(this);
    this.currentTrick = [];
    this.completedTricks = [];
    this.teamScores = {
      [TEAM_A]: { tricks: 0, tens: 0 },
      [TEAM_B]: { tricks: 0, tens: 0 },
    };
    this.roundResult = null;
    this.lastTrickWinner = null;
    this.roundNumber += 1;

    // Player to dealer's right leads (seat after dealer)
    this.currentPlayerIndex = (this.dealerSeat + 1) % MAX_PLAYERS;
    this.gameStatus = GAME_STATUS.PLAYING;
    this.touch();

    return this;
  }

  requestNewRound() {
    if (this.gameStatus !== GAME_STATUS.ROUND_COMPLETE) {
      throw new Error('Round is not complete yet');
    }

    // Rotate dealer each round
    this.dealerSeat = (this.dealerSeat + 1) % MAX_PLAYERS;
    this.startRound();
    return this;
  }

  playCard(socketId, cardId) {
    if (this.gameStatus !== GAME_STATUS.PLAYING) {
      return { ok: false, message: 'Game is not in play' };
    }

    const player = this.getPlayerBySocketId(socketId);

    if (!player) {
      return { ok: false, message: 'You are not in this room' };
    }

    if (player.seat !== this.currentPlayerIndex) {
      return { ok: false, message: 'It is not your turn' };
    }

    const card = player.getCard(cardId);

    if (!card) {
      return { ok: false, message: 'You do not have that card' };
    }

    const validation = isValidMove(player, card, this.currentTrick, this.trumpSuit);

    if (!validation.valid) {
      return { ok: false, message: validation.message };
    }

    player.removeCard(cardId);
    this.currentTrick.push({
      seat: player.seat,
      playerId: player.id,
      playerName: player.name,
      card,
    });
    this.touch();

    const trickComplete = this.currentTrick.length === MAX_PLAYERS;

    if (!trickComplete) {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % MAX_PLAYERS;
      return {
        ok: true,
        trickComplete: false,
        played: { seat: player.seat, card },
      };
    }

    return this.resolveTrick();
  }

  resolveTrick() {
    const leadSuit = this.currentTrick[0].card.suit;
    const winnerPlay = calculateTrickWinner(
      this.currentTrick,
      leadSuit,
      this.trumpSuit
    );
    const winner = this.getPlayerBySeat(winnerPlay.seat);
    const tens = countTensInTrick(this.currentTrick);

    winner.tricksWon += 1;
    winner.tensCaptured += tens;
    this.teamScores[winner.team].tricks += 1;
    this.teamScores[winner.team].tens += tens;

    const completed = {
      trickNumber: this.completedTricks.length + 1,
      plays: [...this.currentTrick],
      winnerSeat: winner.seat,
      winnerName: winner.name,
      winnerTeam: winner.team,
      tens,
    };

    this.completedTricks.push(completed);
    this.lastTrickWinner = {
      seat: winner.seat,
      name: winner.name,
      team: winner.team,
    };
    this.currentPlayerIndex = winner.seat;
    this.gameStatus = GAME_STATUS.TRICK_PAUSE;

    const roundComplete = this.completedTricks.length >= TOTAL_TRICKS;

    if (roundComplete) {
      this.roundResult = calculateRoundResult(this.teamScores);
      this.gameStatus = GAME_STATUS.ROUND_COMPLETE;
    }

    const trickSnapshot = [...this.currentTrick];
    this.currentTrick = [];

    return {
      ok: true,
      trickComplete: true,
      roundComplete,
      completedTrick: {
        ...completed,
        plays: trickSnapshot,
      },
      lastTrickWinner: this.lastTrickWinner,
      roundResult: this.roundResult,
    };
  }

  /**
   * After UI shows trick winner briefly, resume play for the next trick.
   */
  resumeAfterTrick() {
    if (this.gameStatus === GAME_STATUS.TRICK_PAUSE) {
      this.gameStatus = GAME_STATUS.PLAYING;
      this.touch();
    }
  }

  markDisconnected(socketId) {
    const player = this.getPlayerBySocketId(socketId);

    if (!player) {
      return null;
    }

    player.connected = false;
    this.touch();
    return player;
  }

  reconnect(sessionId, newSocketId) {
    const player = this.getPlayerBySessionId(sessionId);

    if (!player) {
      return null;
    }

    player.id = newSocketId;
    player.connected = true;
    this.touch();
    return player;
  }

  removePlayer(socketId) {
    const index = this.players.findIndex((p) => p.id === socketId);

    if (index === -1) {
      return null;
    }

    const [removed] = this.players.splice(index, 1);

    // If still waiting, re-seat remaining players
    if (this.gameStatus === GAME_STATUS.WAITING) {
      this.players.forEach((player, seat) => {
        player.seat = seat;
        player.team = seat % 2 === 0 ? TEAM_A : TEAM_B;
      });
    }

    this.touch();
    return removed;
  }

  addChatMessage(socketId, text) {
    const player = this.getPlayerBySocketId(socketId);

    if (!player) {
      throw new Error('You are not in this room');
    }

    const trimmed = (text || '').trim().slice(0, 200);

    if (!trimmed) {
      throw new Error('Message cannot be empty');
    }

    const message = {
      id: randomBytes(8).toString('hex'),
      playerName: player.name,
      seat: player.seat,
      text: trimmed,
      timestamp: Date.now(),
    };

    this.chat.push(message);

    // Keep chat short in memory
    if (this.chat.length > 100) {
      this.chat.shift();
    }

    this.touch();
    return message;
  }

  /**
   * Personalized view: each client only gets their own hand.
   */
  getStateForPlayer(socketId) {
    const viewer = this.getPlayerBySocketId(socketId);
    const playableCardIds =
      viewer &&
      this.gameStatus === GAME_STATUS.PLAYING &&
      viewer.seat === this.currentPlayerIndex
        ? getPlayableCardIds(viewer, this.currentTrick)
        : [];

    return {
      roomId: this.roomId,
      gameStatus: this.gameStatus,
      roundNumber: this.roundNumber,
      trumpSuit: this.trumpSuit,
      currentPlayerIndex: this.currentPlayerIndex,
      currentTrick: this.currentTrick,
      completedTricksCount: this.completedTricks.length,
      teamScores: this.teamScores,
      lastTrickWinner: this.lastTrickWinner,
      roundResult: this.roundResult,
      dealerSeat: this.dealerSeat,
      players: this.players.map((p) => p.toPublic()),
      yourSeat: viewer ? viewer.seat : null,
      yourTeam: viewer ? viewer.team : null,
      yourHand: viewer ? viewer.hand : [],
      playableCardIds,
      sessionId: viewer ? viewer.sessionId : null,
      chat: this.chat.slice(-40),
    };
  }
}

export { generateRoomCode };
