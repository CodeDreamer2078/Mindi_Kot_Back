import { EVENTS, GAME_STATUS } from '../constants.js';

const TRICK_DISPLAY_MS = 1600;

/**
 * Wire Socket.IO events to the in-memory GameManager.
 * Game logic stays in GameRoom / GameRules — this layer only transports state.
 */
export function registerSocketHandlers(io, gameManager) {
  io.on('connection', (socket) => {
    socket.on(EVENTS.CREATE_ROOM, (payload = {}, ack) => {
      try {
        const name = payload.playerName || payload.name;
        const room = gameManager.createRoom(name, socket.id);
        socket.join(room.roomId);

        const state = room.getStateForPlayer(socket.id);
        const response = {
          roomId: room.roomId,
          sessionId: state.sessionId,
          state,
        };

        socket.emit(EVENTS.ROOM_CREATED, response);
        safeAck(ack, { ok: true, ...response });
      } catch (error) {
        emitError(socket, error.message);
        safeAck(ack, { ok: false, message: error.message });
      }
    });

    socket.on(EVENTS.JOIN_ROOM, (payload = {}, ack) => {
      try {
        const name = payload.playerName || payload.name;
        const roomId = (payload.roomId || payload.roomCode || '').toUpperCase();
        const { room } = gameManager.joinRoom(roomId, name, socket.id);
        socket.join(room.roomId);

        broadcastStates(io, room, EVENTS.PLAYER_JOINED);

        if (room.isFull()) {
          room.startRound();
          broadcastStates(io, room, EVENTS.GAME_STARTED);
        }

        const state = room.getStateForPlayer(socket.id);
        safeAck(ack, {
          ok: true,
          roomId: room.roomId,
          sessionId: state.sessionId,
          state,
        });
      } catch (error) {
        emitError(socket, error.message);
        safeAck(ack, { ok: false, message: error.message });
      }
    });

    socket.on(EVENTS.RECONNECT, (payload = {}, ack) => {
      try {
        const { sessionId, roomId } = payload;
        const room = gameManager.getRoom(roomId);

        if (!room) {
          throw new Error('Room no longer exists');
        }

        const player = room.reconnect(sessionId, socket.id);

        if (!player) {
          throw new Error('Session not found — cannot reconnect');
        }

        gameManager.clearDisconnectTimer(room, sessionId);
        gameManager.bindSocket(socket.id, room.roomId);
        socket.join(room.roomId);

        io.to(room.roomId).emit(EVENTS.PLAYER_RECONNECTED, {
          seat: player.seat,
          name: player.name,
        });

        broadcastStates(io, room, EVENTS.GAME_STATE);

        const state = room.getStateForPlayer(socket.id);
        safeAck(ack, { ok: true, state, sessionId: player.sessionId });
      } catch (error) {
        emitError(socket, error.message);
        safeAck(ack, { ok: false, message: error.message });
      }
    });

    socket.on(EVENTS.PLAY_CARD, (payload = {}, ack) => {
      try {
        const room = gameManager.getRoomBySocket(socket.id);

        if (!room) {
          throw new Error('You are not in a room');
        }

        const result = room.playCard(socket.id, payload.cardId);

        if (!result.ok) {
          socket.emit(EVENTS.INVALID_MOVE, { message: result.message });
          safeAck(ack, { ok: false, message: result.message });
          return;
        }

        broadcastStates(io, room, EVENTS.CARD_PLAYED);

        if (result.trickComplete) {
          io.to(room.roomId).emit(EVENTS.TRICK_COMPLETED, {
            completedTrick: result.completedTrick,
            lastTrickWinner: result.lastTrickWinner,
            roundComplete: result.roundComplete,
            roundResult: result.roundResult,
          });

          if (result.roundComplete) {
            broadcastStates(io, room, EVENTS.ROUND_COMPLETED);
          } else {
            setTimeout(() => {
              const liveRoom = gameManager.getRoom(room.roomId);

              if (!liveRoom) {
                return;
              }

              liveRoom.resumeAfterTrick();
              broadcastStates(io, liveRoom, EVENTS.GAME_STATE);
            }, TRICK_DISPLAY_MS);
          }
        }

        safeAck(ack, { ok: true });
      } catch (error) {
        emitError(socket, error.message);
        safeAck(ack, { ok: false, message: error.message });
      }
    });

    socket.on(EVENTS.REQUEST_NEW_ROUND, (_payload, ack) => {
      try {
        const room = gameManager.getRoomBySocket(socket.id);

        if (!room) {
          throw new Error('You are not in a room');
        }

        room.requestNewRound();
        broadcastStates(io, room, EVENTS.GAME_RESET);
        broadcastStates(io, room, EVENTS.GAME_STARTED);
        safeAck(ack, { ok: true });
      } catch (error) {
        emitError(socket, error.message);
        safeAck(ack, { ok: false, message: error.message });
      }
    });

    socket.on(EVENTS.START_GAME, (_payload, ack) => {
      try {
        const room = gameManager.getRoomBySocket(socket.id);

        if (!room) {
          throw new Error('You are not in a room');
        }

        if (!room.isFull()) {
          throw new Error('Need 4 players to start');
        }

        if (room.gameStatus !== GAME_STATUS.WAITING) {
          throw new Error('Game already started');
        }

        room.startRound();
        broadcastStates(io, room, EVENTS.GAME_STARTED);
        safeAck(ack, { ok: true });
      } catch (error) {
        emitError(socket, error.message);
        safeAck(ack, { ok: false, message: error.message });
      }
    });

    socket.on(EVENTS.SEND_CHAT, (payload = {}, ack) => {
      try {
        const room = gameManager.getRoomBySocket(socket.id);

        if (!room) {
          throw new Error('You are not in a room');
        }

        const message = room.addChatMessage(socket.id, payload.text);
        io.to(room.roomId).emit(EVENTS.CHAT_MESSAGE, message);
        safeAck(ack, { ok: true, message });
      } catch (error) {
        emitError(socket, error.message);
        safeAck(ack, { ok: false, message: error.message });
      }
    });

    socket.on(EVENTS.LEAVE_ROOM, (_payload, ack) => {
      handleLeave(io, gameManager, socket, false);
      safeAck(ack, { ok: true });
    });

    socket.on('disconnect', () => {
      handleDisconnect(io, gameManager, socket);
    });
  });
}

function handleLeave(io, gameManager, socket) {
  const result = gameManager.leaveRoom(socket.id);

  if (!result) {
    return;
  }

  socket.leave(result.room?.roomId);

  if (result.roomDeleted || !result.room) {
    return;
  }

  io.to(result.room.roomId).emit(EVENTS.PLAYER_LEFT, {
    name: result.removed?.name,
    seat: result.removed?.seat,
  });

  // If game was in progress and someone left permanently, end the room
  if (result.room.gameStatus !== GAME_STATUS.WAITING) {
    io.to(result.room.roomId).emit(EVENTS.GAME_ERROR, {
      message: `${result.removed?.name || 'A player'} left. Room closed.`,
    });
    gameManager.deleteRoom(result.room.roomId);
    return;
  }

  broadcastStates(io, result.room, EVENTS.GAME_STATE);
}

function handleDisconnect(io, gameManager, socket) {
  const room = gameManager.getRoomBySocket(socket.id);

  if (!room) {
    return;
  }

  const player = room.markDisconnected(socket.id);

  if (!player) {
    return;
  }

  gameManager.unbindSocket(socket.id);

  io.to(room.roomId).emit(EVENTS.PLAYER_DISCONNECTED, {
    seat: player.seat,
    name: player.name,
    message: `${player.name} disconnected. Waiting for reconnection...`,
  });

  broadcastStates(io, room, EVENTS.GAME_STATE);

  gameManager.scheduleDisconnectRemoval(room, player, (liveRoom, timedOutPlayer) => {
    // Still disconnected after timeout — remove and possibly close room
    const stillThere = liveRoom.getPlayerBySessionId(timedOutPlayer.sessionId);

    if (!stillThere || stillThere.connected) {
      return;
    }

    const seat = stillThere.seat;
    const name = stillThere.name;
    liveRoom.players = liveRoom.players.filter(
      (p) => p.sessionId !== timedOutPlayer.sessionId
    );

    io.to(liveRoom.roomId).emit(EVENTS.PLAYER_LEFT, { seat, name });
    io.to(liveRoom.roomId).emit(EVENTS.GAME_ERROR, {
      message: `${name} did not reconnect. Room closed.`,
    });
    gameManager.deleteRoom(liveRoom.roomId);
  });
}

function broadcastStates(io, room, eventName) {
  for (const player of room.players) {
    if (!player.connected) {
      continue;
    }

    const state = room.getStateForPlayer(player.id);
    io.to(player.id).emit(eventName, state);
    // Always also send GAME_STATE so clients stay in sync
    if (eventName !== EVENTS.GAME_STATE) {
      io.to(player.id).emit(EVENTS.GAME_STATE, state);
    }
  }
}

function emitError(socket, message) {
  socket.emit(EVENTS.GAME_ERROR, { message });
}

function safeAck(ack, payload) {
  if (typeof ack === 'function') {
    ack(payload);
  }
}
