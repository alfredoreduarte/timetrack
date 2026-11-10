// User types
export interface User {
  id: string;
  email: string;
  name: string;
  defaultHourlyRate?: number;
  createdAt: string;
  updatedAt: string;
  idleTimeoutSeconds?: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

// Project types
export interface Project {
  id: string;
  name: string;
  description?: string;
  color?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  color?: string;
}

// Time Entry types
export interface TimeEntry {
  id: string;
  description?: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  projectId?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  isRunning?: boolean;
  hourlyRateSnapshot?: number | null;
  createdVia?: string;
  isAiGenerated?: boolean;
  /** The pausable timer this entry is a segment of (null for pre-timer entries). */
  timerId?: string | null;
  /** manual | paused | idle | stopped | session_end | import */
  stopReason?: string | null;
}

// Timers: a pausable unit of work (typically one AI agent session) made of
// TimeEntry segments. A running timer has exactly one running segment.
export type TimerStatus = "running" | "paused" | "stopped";
export type TimerPauseReason = "manual" | "idle";

export interface Timer {
  id: string;
  status: TimerStatus;
  description: string | null;
  sessionKey: string | null;
  agent: string | null;
  createdVia: string;
  isAiGenerated: boolean;
  cwd: string | null;
  gitRemote: string | null;
  gitBranch: string | null;
  idleTimeoutSeconds: number | null;
  lastActivityAt: string;
  pauseReason: TimerPauseReason | null;
  startedAt: string;
  stoppedAt: string | null;
  costUsd: number | null;
  projectId: string | null;
  taskId: string | null;
  project: { id: string; name: string; color: string } | null;
  task: { id: string; name: string } | null;
  currentEntry: TimeEntry | null;
  segmentCount: number;
  noteCount: number;
  trackedSeconds: number;
  createdAt: string;
  updatedAt: string;
}

export interface TimerNote {
  id: string;
  body: string;
  via: string | null;
  createdAt: string;
}

export interface TimerActionResult {
  timer: Timer;
  entry: TimeEntry | null;
  changed: boolean;
  created?: boolean;
}

export interface AuditEvent {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorType: "user" | "api_key" | "system";
  actorLabel: string | null;
  via: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  createdAt: string;
}

export interface StartTimerRequest {
  description?: string;
  projectId?: string;
}

export interface StopTimerRequest {
  endTime: string;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Error types
export interface ApiError {
  message: string;
  code?: string;
  statusCode?: number;
}

