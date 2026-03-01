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
  githubRepoId?: number;
  githubRepoOwner?: string;
  githubRepoName?: string;
  githubRepoFullName?: string;
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

// GitHub Integration types
export interface GitHubIntegration {
  id: string;
  githubUserId: number;
  githubUsername: string;
  avatarUrl?: string;
  scope?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  description?: string;
  html_url: string;
  private: boolean;
  open_issues_count: number;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body?: string;
  state: string;
  html_url: string;
  labels: Array<{ name: string; color: string }>;
  created_at: string;
  updated_at: string;
}
