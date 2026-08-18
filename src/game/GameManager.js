import {
  DEFAULT_RECONNECT_TIMEOUT_MS,
  DEFAULT_ROOM_INACTIVE_MS,
} from '../constants.js';
import { GameRoom } from './GameRoom.js';

/**
 * In-memory registry of all active rooms.
 * No database — rooms live only while the Node process is running.
 */
export class GameManager {
  constructor({
    reconnectTimeoutMs = DEFAULT_RECONNECT_TIMEOUT_MS,
    roomInactiveMs = DEFAULT_ROOM_INACTIVE_MS,
  } = {}) {
    this.rooms = new Map();
    this.socketToRoom = new Map();
    this.reconnectTimeoutMs = reconnectTimeoutMs;
    this.roomInactiveMs = roomInactiveMs;
    this.cleanupInterval = null;
  }

  startCleanupLoop(intervalMs = 60_000) {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupAbandonedRooms();
    }, intervalMs);

    // Allow process to exit in tests without dangling handles
    if (typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  stopCleanupLoop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  createRoom(playerName, socketId) {
    const room = new GameRoom(playerName, socketId);
    this.rooms.set(room.roomId, room);
    this.socketToRoom.set(socketId, room.roomId);
    return room;
  }

  getRoom(roomId) {
    if (!roomId) {
      return null;
    }

    return this.rooms.get(roomId.toUpperCase()) || null;
  }

  getRoomBySocket(socketId) {
    const roomId = this.socketToRoom.get(socketId);
    return roomId ? this.getRoom(roomId) : null;
  }

  joinRoom(roomId, playerName, socketId) {
    const room = this.getRoom(roomId);

    if (!room) {
      throw new Error('Room not found');
    }

    if (room.isFull()) {
      throw new Error('Room is full (max 4 players)');
    }

    const player = room.addPlayer(playerName, socketId);
    this.socketToRoom.set(socketId, room.roomId);
    return { room, player };
  }

  leaveRoom(socketId) {
    const room = this.getRoomBySocket(socketId);

    if (!room) {
      return null;
    }

    const removed = room.removePlayer(socketId);
    this.socketToRoom.delete(socketId);

    if (room.disconnectTimers.has(socketId)) {
      clearTimeout(room.disconnectTimers.get(socketId));
      room.disconnectTimers.delete(socketId);
    }

    if (room.players.length === 0) {
      this.deleteRoom(room.roomId);
      return { room: null, removed, roomDeleted: true };
    }

    return { room, removed, roomDeleted: false };
  }

  bindSocket(socketId, roomId) {
    this.socketToRoom.set(socketId, roomId);
  }

  unbindSocket(socketId) {
    this.socketToRoom.delete(socketId);
  }

  deleteRoom(roomId) {
    const room = this.getRoom(roomId);

    if (!room) {
      return false;
    }

    for (const player of room.players) {
      this.socketToRoom.delete(player.id);
    }

    for (const timer of room.disconnectTimers.values()) {
      clearTimeout(timer);
    }

    room.disconnectTimers.clear();
    this.rooms.delete(room.roomId);
    return true;
  }

  scheduleDisconnectRemoval(room, player, onTimeout) {
    if (room.disconnectTimers.has(player.sessionId)) {
      clearTimeout(room.disconnectTimers.get(player.sessionId));
    }

    const timer = setTimeout(() => {
      room.disconnectTimers.delete(player.sessionId);
      onTimeout(room, player);
    }, this.reconnectTimeoutMs);

    room.disconnectTimers.set(player.sessionId, timer);
  }

  clearDisconnectTimer(room, sessionId) {
    if (room.disconnectTimers.has(sessionId)) {
      clearTimeout(room.disconnectTimers.get(sessionId));
      room.disconnectTimers.delete(sessionId);
    }
  }

  cleanupAbandonedRooms() {
    const now = Date.now();

    for (const [roomId, room] of this.rooms.entries()) {
      const inactive = now - room.lastActivityAt > this.roomInactiveMs;
      const allGone = room.players.every((p) => !p.connected);

      if (inactive || (allGone && room.players.length === 0)) {
        this.deleteRoom(roomId);
      } else if (inactive && allGone) {
        this.deleteRoom(roomId);
      }
    }
  }

  roomCount() {
    return this.rooms.size;
  }
}
