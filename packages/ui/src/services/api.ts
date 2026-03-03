import axios, { AxiosInstance, AxiosResponse } from "axios";
import { User } from "../store/slices/authSlice";
import { Project, Task } from "../store/slices/projectsSlice";
import { TimeEntry } from "../store/slices/timeEntriesSlice";

// In production the UI is served by nginx which reverse-proxies /api/ to the
// API container, so no absolute URL is needed. VITE_API_URL is only required
// for local dev where the UI and API run on different ports.
const API_BASE_URL =
  (import.meta as any).env.VITE_API_URL || "/api";

// Rate limit tracking — shared across all requests
let rateLimitedUntil = 0;

// Maximum client-side backoff to prevent extended lockouts from large Retry-After values
const MAX_BACKOFF_MS = 60_000; // 60 seconds

// Endpoints exempt from client-side rate limit blocking (must remain functional)
const RATE_LIMIT_EXEMPT_PATHS = ["/auth/login", "/auth/register", "/auth/me", "/health"];

/** Check if the client is currently backing off from a 429 */
function isRateLimited(): boolean {
  return Date.now() < rateLimitedUntil;
}

class APIClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Request interceptor to add auth token and block when rate-limited
    this.client.interceptors.request.use(
      (config) => {
        // Block non-critical requests while rate-limited to avoid wasting quota
        if (isRateLimited()) {
          const url = config.url || "";
          const isExempt = RATE_LIMIT_EXEMPT_PATHS.some((path) => url.includes(path));
          if (!isExempt) {
            const waitSec = Math.ceil((rateLimitedUntil - Date.now()) / 1000);
            return Promise.reject(
              new Error(`Rate limited — retry in ${waitSec}s`)
            );
          }
        }

        const token = localStorage.getItem("token");
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        // Handle rate limiting (429)
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers?.["retry-after"];
          // Use Retry-After header if present, otherwise default to 60s
          const parsed = retryAfter ? Number(retryAfter) : NaN;
          const waitMs = Math.min(
            !isNaN(parsed) ? parsed * 1000 : MAX_BACKOFF_MS,
            MAX_BACKOFF_MS
          );
          rateLimitedUntil = Date.now() + waitMs;
          console.warn(
            `[API] Rate limited. Backing off for ${Math.ceil(waitMs / 1000)}s`
          );
          return Promise.reject(error);
        }

        if (error.response?.status === 401) {
          localStorage.removeItem("token");
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }
    );
  }

  // Generic request method
  private async request<T>(
    method: string,
    url: string,
    data?: any
  ): Promise<T> {
    const response: AxiosResponse<T> = await this.client.request({
      method,
      url,
      data,
    });
    return response.data;
  }

  // Auth API
  auth = {
    getCaptcha: async () => {
      return this.request<{ captchaId: string; captchaSvg: string }>(
        "GET",
        "/auth/captcha"
      );
    },

    login: async (credentials: { email: string; password: string }) => {
      return this.request<{ user: User; token: string }>(
        "POST",
        "/auth/login",
        credentials
      );
    },

    register: async (userData: {
      email: string;
      password: string;
      name: string;
      captchaId: string;
      captchaValue: string;
    }) => {
      return this.request<{ user: User; token: string }>(
        "POST",
        "/auth/register",
        userData
      );
    },

    getCurrentUser: async () => {
      const response = await this.request<{ user: User }>("GET", "/auth/me");
      return response.user;
    },

    requestPasswordReset: async (email: string) => {
      return this.request<{ message: string }>(
        "POST",
        "/auth/request-password-reset",
        { email }
      );
    },

    resetPassword: async (token: string, password: string) => {
      return this.request<{ message: string; user: User; token: string }>(
        "POST",
        "/auth/reset-password",
        { token, password }
      );
    },

    updateProfile: async (profileData: {
      name?: string;
      email?: string;
      defaultHourlyRate?: number;
      idleTimeoutSeconds?: number;
    }) => {
      const response = await this.request<{ message: string; user: User }>(
        "PUT",
        "/users/profile",
        profileData
      );
      return response.user;
    },

    getDashboardEarnings: async () => {
      // Use shared timezone utility
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const queryParams = new URLSearchParams();
      queryParams.append("timezone", userTimezone);

      return this.request<{
        earnings: {
          currentTimer: {
            earnings: number;
            duration: number;
            isRunning: boolean;
            hourlyRate: number;
          };
          today: {
            earnings: number;
            duration: number;
          };
          thisWeek: {
            earnings: number;
            duration: number;
          };
        };
      }>("GET", `/users/dashboard-earnings?${queryParams.toString()}`);
    },

    logout: async () => {
      return this.request<void>("POST", "/auth/logout");
    },
  };

  // Projects API
  projects = {
    getProjects: async () => {
      const response = await this.request<{ projects: Project[] }>(
        "GET",
        "/projects"
      );
      return response.projects;
    },

    getProject: async (id: string) => {
      const response = await this.request<{ project: Project }>(
        "GET",
        `/projects/${id}`
      );
      return response.project;
    },

    createProject: async (projectData: {
      name: string;
      description?: string;
      color?: string;
      hourlyRate?: number;
    }) => {
      const response = await this.request<{
        message: string;
        project: Project;
      }>("POST", "/projects", projectData);
      return response.project;
    },

    updateProject: async (id: string, projectData: Partial<Project>) => {
      const response = await this.request<{
        message: string;
        project: Project;
      }>("PUT", `/projects/${id}`, projectData);
      return response.project;
    },

    deleteProject: async (id: string) => {
      return this.request<void>("DELETE", `/projects/${id}`);
    },
  };

  // Tasks API (updated to match your API structure)
  tasks = {
    getTasks: async (projectId?: string, isCompleted?: boolean) => {
      const params = new URLSearchParams();
      if (projectId) params.append("projectId", projectId);
      if (isCompleted !== undefined)
        params.append("isCompleted", isCompleted.toString());

      const queryString = params.toString();
      const url = `/tasks${queryString ? `?${queryString}` : ""}`;
      const response = await this.request<{ tasks: Task[] }>("GET", url);
      return response.tasks;
    },

    getTask: async (id: string) => {
      const response = await this.request<{ task: Task }>(
        "GET",
        `/tasks/${id}`
      );
      return response.task;
    },

    createTask: async (taskData: {
      name: string;
      description?: string;
      projectId: string;
      hourlyRate?: number;
    }) => {
      const response = await this.request<{
        message: string;
        task: Task;
      }>("POST", "/tasks", taskData);
      return response.task;
    },

    updateTask: async (id: string, taskData: Partial<Task>) => {
      const response = await this.request<{
        message: string;
        task: Task;
      }>("PUT", `/tasks/${id}`, taskData);
      return response.task;
    },

    deleteTask: async (id: string) => {
      return this.request<{ message: string }>("DELETE", `/tasks/${id}`);
    },
  };

  // Time Entries API
  timeEntries = {
    getTimeEntries: async (
      params: {
        startDate?: string;
        endDate?: string;
        projectId?: string;
        page?: number;
        limit?: number;
      } = {}
    ) => {
      const queryParams = new URLSearchParams();
      if (params.startDate) queryParams.append("startDate", params.startDate);
      if (params.endDate) queryParams.append("endDate", params.endDate);
      if (params.projectId) queryParams.append("projectId", params.projectId);
      if (params.page) queryParams.append("page", params.page.toString());
      if (params.limit) queryParams.append("limit", params.limit.toString());

      const url = `/time-entries${
        queryParams.toString() ? `?${queryParams.toString()}` : ""
      }`;
      return this.request<{
        entries: TimeEntry[];
        pagination: {
          page: number;
          limit: number;
          total: number;
          pages: number;
        };
      }>("GET", url);
    },

    getTimeEntry: async (id: string) => {
      return this.request<TimeEntry>("GET", `/time-entries/${id}`);
    },

    getCurrentEntry: async () => {
      return this.request<TimeEntry | null>("GET", "/time-entries/current");
    },

    createTimeEntry: async (entryData: {
      description?: string;
      startTime: string;
      endTime: string;
      projectId?: string;
      taskId?: string;
    }) => {
      return this.request<TimeEntry>("POST", "/time-entries", entryData);
    },

    updateTimeEntry: async (
      id: string,
      entryData: {
        description?: string;
        startTime?: string;
        endTime?: string;
        hours?: number;
        projectId?: string | null;
        taskId?: string | null;
      }
    ) => {
      return this.request<TimeEntry>("PUT", `/time-entries/${id}`, entryData);
    },

    deleteTimeEntry: async (id: string) => {
      return this.request<void>("DELETE", `/time-entries/${id}`);
    },

    startTimer: async (data: {
      projectId?: string;
      taskId?: string;
      description?: string;
    }) => {
      const response = await this.request<{
        message: string;
        timeEntry: TimeEntry;
      }>("POST", "/time-entries/start", data);
      return response.timeEntry;
    },

    stopTimer: async (id: string) => {
      const response = await this.request<{
        message: string;
        timeEntry: TimeEntry;
      }>("POST", `/time-entries/${id}/stop`);
      return response.timeEntry;
    },
  };

  // Reports API
  reports = {
    getSummaryReport: async (params: {
      startDate: string;
      endDate: string;
      projectId?: string;
      timezone?: string;
    }) => {
      const queryParams = new URLSearchParams();
      queryParams.append("startDate", params.startDate);
      queryParams.append("endDate", params.endDate);
      if (params.projectId) queryParams.append("projectId", params.projectId);
      if (params.timezone) queryParams.append("timezone", params.timezone);

      const url = `/reports/summary?${queryParams.toString()}`;
      return this.request<{
        summary: {
          totalDuration: number;
          totalEarnings: number;
          entryCount: number;
          averageSessionDuration: number;
          projectBreakdown: Array<{
            projectId: string;
            projectName: string;
            color: string;
            totalDuration: number;
            totalEarnings: number;
            entryCount: number;
          }>;
          dailyBreakdown: Array<{
            date: string;
            totalDuration: number;
            totalEarnings: number;
            entryCount: number;
          }>;
        };
      }>("GET", url);
    },

    getDetailedReport: async (params: {
      startDate: string;
      endDate: string;
      projectId?: string;
      taskId?: string;
      timezone?: string;
    }) => {
      const queryParams = new URLSearchParams();
      queryParams.append("startDate", params.startDate);
      queryParams.append("endDate", params.endDate);
      if (params.projectId) queryParams.append("projectId", params.projectId);
      if (params.taskId) queryParams.append("taskId", params.taskId);
      if (params.timezone) queryParams.append("timezone", params.timezone);

      const url = `/reports/detailed?${queryParams.toString()}`;
      return this.request<{
        timeEntries: Array<{
          id: string;
          description: string | null;
          startTime: string;
          endTime: string;
          duration: number;
          hourlyRateSnapshot: number | null;
          earnings: number;
          project: {
            id: string;
            name: string;
            color: string;
          } | null;
          task: {
            id: string;
            name: string;
          } | null;
        }>;
        totalEntries: number;
      }>("GET", url);
    },
  };

  // Health check
  health = {
    check: async () => {
      const response: AxiosResponse<{
        status: string;
        timestamp: string;
        uptime: number;
      }> = await this.client.request({
        method: "GET",
        url: "/health",
      });
      return response.data;
    },
  };
}

// Create and export API client instance
const apiClient = new APIClient();

export const authAPI = apiClient.auth;
export const projectsAPI = apiClient.projects;
export const tasksAPI = apiClient.tasks;
export const timeEntriesAPI = apiClient.timeEntries;
export const reportsAPI = apiClient.reports;
export const healthAPI = apiClient.health;

export default apiClient;
