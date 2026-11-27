import type { Server } from "socket.io";

let io: Server | null = null;

export const setRealtimeServer = (server: Server | null): void => {
  io = server;
};

/** Pushes an event to every socket the user has open. No-op without a server. */
export const emitToUser = (userId: string, event: string, payload: unknown): void => {
  io?.to(`user-${userId}`).emit(event, payload);
};
