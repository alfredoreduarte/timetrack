import { io, Socket } from "socket.io-client";
import { API_URL } from "../utils/constants";
import { TimeEntry, Project, Task } from "./api";

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

type EventCallback<T> = (data: T) => void;

interface SocketEventHandlers {
  onTimeEntryStarted?: EventCallback<TimeEntry>;
  onTimeEntryStopped?: EventCallback<TimeEntry>;
  onTimeEntryCreated?: EventCallback<TimeEntry>;
  onTimeEntryUpdated?: EventCallback<TimeEntry>;
  onTimeEntryDeleted?: EventCallback<{ id: string }>;
  onProjectCreated?: EventCallback<Project>;
  onProjectUpdated?: EventCallback<Project>;
  onProjectDeleted?: EventCallback<{ id: string }>;
  onTaskCreated?: EventCallback<Task>;
  onTaskUpdated?: EventCallback<Task>;
  onTaskDeleted?: EventCallback<{ id: string }>;
  onConnectionStateChange?: EventCallback<ConnectionState>;
}

class SocketService {
  private socket: Socket | null = null;
  private connectionState: ConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers: SocketEventHandlers = {};
  private currentToken: string | null = null;

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  setHandlers(handlers: SocketEventHandlers): void {
    this.handlers = handlers;
  }

  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.handlers.onConnectionStateChange?.(state);
  }

  private getReconnectDelay(): number {
    const baseDelay = 1000;
    return Math.min(baseDelay * Math.pow(2, this.reconnectAttempts), 30000);
  }

  connect(token: string): void {
    if (this.socket?.connected) {
      return;
    }

    this.currentToken = token;
    this.disconnect();
    this.setConnectionState("connecting");

    this.socket = io(API_URL, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on("connect", () => {
      this.setConnectionState("connected");
      this.reconnectAttempts = 0;
    });

    this.socket.on("disconnect", (reason: string) => {
      this.setConnectionState("disconnected");
      if (reason !== "io client disconnect") {
        this.scheduleReconnect();
      }
    });

    this.socket.on("connect_error", (error: Error) => {
      if (
        error.message.includes("Authentication") ||
        error.message.includes("jwt") ||
        error.message.includes("token")
      ) {
        this.setConnectionState("failed");
        return;
      }
      this.scheduleReconnect();
    });

    // Time entry events
    this.socket.on("time-entry-started", (data: TimeEntry) => {
      this.handlers.onTimeEntryStarted?.(data);
    });

    this.socket.on("time-entry-stopped", (data: TimeEntry) => {
      this.handlers.onTimeEntryStopped?.(data);
    });

    this.socket.on("time-entry-created", (data: TimeEntry) => {
      this.handlers.onTimeEntryCreated?.(data);
    });

    this.socket.on("time-entry-updated", (data: TimeEntry) => {
      this.handlers.onTimeEntryUpdated?.(data);
    });

    this.socket.on("time-entry-deleted", (data: { id: string }) => {
      this.handlers.onTimeEntryDeleted?.(data);
    });

    // Project events
    this.socket.on("project-created", (data: Project) => {
      this.handlers.onProjectCreated?.(data);
    });

    this.socket.on("project-updated", (data: Project) => {
      this.handlers.onProjectUpdated?.(data);
    });

    this.socket.on("project-deleted", (data: { id: string }) => {
      this.handlers.onProjectDeleted?.(data);
    });

    // Task events
    this.socket.on("task-created", (data: Task) => {
      this.handlers.onTaskCreated?.(data);
    });

    this.socket.on("task-updated", (data: Task) => {
      this.handlers.onTaskUpdated?.(data);
    });

    this.socket.on("task-deleted", (data: { id: string }) => {
      this.handlers.onTaskDeleted?.(data);
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setConnectionState("failed");
      return;
    }

    this.setConnectionState("reconnecting");
    const delay = this.getReconnectDelay();

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      if (this.currentToken) {
        this.connect(this.currentToken);
      } else {
        this.setConnectionState("failed");
      }
    }, delay);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.reconnectAttempts = 0;
    this.currentToken = null;
    this.setConnectionState("disconnected");
  }
}

export const socketService = new SocketService();
