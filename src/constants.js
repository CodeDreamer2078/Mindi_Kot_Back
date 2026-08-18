export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];

export const RANKS = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
];

export const RANK_VALUES = {
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export const SUIT_SYMBOLS = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

export const MAX_PLAYERS = 4;
export const CARDS_PER_PLAYER = 13;
export const TOTAL_TRICKS = 13;
export const TEAM_A = 0;
export const TEAM_B = 1;

export const GAME_STATUS = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  TRICK_PAUSE: 'trick_pause',
  ROUND_COMPLETE: 'round_complete',
};

export const EVENTS = {
  // Client → Server
  CREATE_ROOM: 'CREATE_ROOM',
  JOIN_ROOM: 'JOIN_ROOM',
  START_GAME: 'START_GAME',
  PLAY_CARD: 'PLAY_CARD',
  REQUEST_NEW_ROUND: 'REQUEST_NEW_ROUND',
  LEAVE_ROOM: 'LEAVE_ROOM',
  SEND_CHAT: 'SEND_CHAT',
  RECONNECT: 'RECONNECT',

  // Server → Client
  ROOM_CREATED: 'ROOM_CREATED',
  PLAYER_JOINED: 'PLAYER_JOINED',
  PLAYER_LEFT: 'PLAYER_LEFT',
  GAME_STARTED: 'GAME_STARTED',
  GAME_STATE: 'GAME_STATE',
  CARD_PLAYED: 'CARD_PLAYED',
  TRICK_COMPLETED: 'TRICK_COMPLETED',
  ROUND_COMPLETED: 'ROUND_COMPLETED',
  GAME_RESET: 'GAME_RESET',
  INVALID_MOVE: 'INVALID_MOVE',
  GAME_ERROR: 'GAME_ERROR',
  CHAT_MESSAGE: 'CHAT_MESSAGE',
  PLAYER_DISCONNECTED: 'PLAYER_DISCONNECTED',
  PLAYER_RECONNECTED: 'PLAYER_RECONNECTED',
};

export const DEFAULT_RECONNECT_TIMEOUT_MS = 60_000;
export const DEFAULT_ROOM_INACTIVE_MS = 30 * 60 * 1000;
