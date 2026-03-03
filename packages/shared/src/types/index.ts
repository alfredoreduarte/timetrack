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
