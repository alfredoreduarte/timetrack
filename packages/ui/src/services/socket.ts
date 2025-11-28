import { io, Socket } from "socket.io-client";
import { TimeEntry } from "../store/slices/timeEntriesSlice";
import { Project, Task } from "../store/slices/projectsSlice";

// Use same base URL as API
const API_BASE_URL =
  (import.meta as any).env.VITE_API_URL || "http://localhost:3011";

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

type EventCallback<T> = (data: T) => void;

interface SocketEventHandlers {
  // Time entry events
  onTimeEntryStarted?: EventCallback<TimeEntry>;
  onTimeEntryStopped?: EventCallback<TimeEntry>;
  onTimeEntryCreated?: EventCallback<TimeEntry>;
  onTimeEntryUpdated?: EventCallback<TimeEntry>;
  onTimeEntryDeleted?: EventCallback<{ id: string }>;
  // Project events
  onProjectCreated?: EventCallback<Project>;
  onProjectUpdated?: EventCallback<Project>;
  onProjectDeleted?: EventCallback<{ id: string }>;
  // Task events
  onTaskCreated?: EventCallback<Task>;
  onTaskUpdated?: EventCallback<Task>;
  onTaskDeleted?: EventCallback<{ id: string }>;
  // Connection events
  onConnectionStateChange?: EventCallback<ConnectionState>;
}

class SocketService {
  private socket: Socket | null = null;
  private connectionState: ConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers: SocketEventHandlers = {};

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
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
    const baseDelay = 1000;
    const delay = Math.min(
      baseDelay * Math.pow(2, this.reconnectAttempts),
      30000
    );
    return delay;
  }

  connect(token: string): void {
    if (this.socket?.connected) {
      return;
    }

    this.disconnect();
    this.setConnectionState("connecting");

    this.socket = io(API_BASE_URL, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false, // We handle reconnection manually
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on("connect", () => {
      console.log("[Socket] Connected");
      this.setConnectionState("connected");
      this.reconnectAttempts = 0;
    });

    this.socket.on("disconnect", (reason: string) => {
      console.log("[Socket] Disconnected:", reason);
      this.setConnectionState("disconnected");

      // Don't reconnect if we intentionally disconnected
      if (reason !== "io client disconnect") {
        this.scheduleReconnect();
      }
    });

    this.socket.on("connect_error", (error: Error) => {
      console.error("[Socket] Connection error:", error.message);

      // Check for auth errors - don't retry on auth failure
      if (
        error.message.includes("Authentication") ||
        error.message.includes("jwt") ||
        error.message.includes("token")
      ) {
        console.log("[Socket] Auth error, not retrying");
        this.setConnectionState("failed");
        return;
      }

      this.scheduleReconnect();
    });

    // Time entry events
    this.socket.on("time-entry-started", (data: TimeEntry) => {
      console.log("[Socket] time-entry-started", data.id);
      this.handlers.onTimeEntryStarted?.(data);
    });

    this.socket.on("time-entry-stopped", (data: TimeEntry) => {
      console.log("[Socket] time-entry-stopped", data.id);
      this.handlers.onTimeEntryStopped?.(data);
    });

    this.socket.on("time-entry-created", (data: TimeEntry) => {
      console.log("[Socket] time-entry-created", data.id);
      this.handlers.onTimeEntryCreated?.(data);
    });

    this.socket.on("time-entry-updated", (data: TimeEntry) => {
      console.log("[Socket] time-entry-updated", data.id);
      this.handlers.onTimeEntryUpdated?.(data);
    });

    this.socket.on("time-entry-deleted", (data: { id: string }) => {
      console.log("[Socket] time-entry-deleted", data.id);
      this.handlers.onTimeEntryDeleted?.(data);
    });

    // Project events
    this.socket.on("project-created", (data: Project) => {
      console.log("[Socket] project-created", data.id);
      this.handlers.onProjectCreated?.(data);
    });

    this.socket.on("project-updated", (data: Project) => {
      console.log("[Socket] project-updated", data.id);
      this.handlers.onProjectUpdated?.(data);
    });

    this.socket.on("project-deleted", (data: { id: string }) => {
      console.log("[Socket] project-deleted", data.id);
      this.handlers.onProjectDeleted?.(data);
    });

    // Task events
    this.socket.on("task-created", (data: Task) => {
      console.log("[Socket] task-created", data.id);
      this.handlers.onTaskCreated?.(data);
    });

    this.socket.on("task-updated", (data: Task) => {
      console.log("[Socket] task-updated", data.id);
      this.handlers.onTaskUpdated?.(data);
    });

    this.socket.on("task-deleted", (data: { id: string }) => {
      console.log("[Socket] task-deleted", data.id);
      this.handlers.onTaskDeleted?.(data);
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log("[Socket] Max reconnect attempts reached");
      this.setConnectionState("failed");
      return;
    }

    this.setConnectionState("reconnecting");
    const delay = this.getReconnectDelay();
    console.log(
      `[Socket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      const token = localStorage.getItem("token");
      if (token) {
        this.connect(token);
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
    this.setConnectionState("disconnected");
  }
}

// Export singleton instance
export const socketService = new SocketService();
