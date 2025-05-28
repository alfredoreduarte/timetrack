// API endpoints
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: "/api/auth/login",
    REGISTER: "/api/auth/register",
    ME: "/api/auth/me",
    LOGOUT: "/api/auth/logout",
  },
  PROJECTS: {
    LIST: "/api/projects",
    CREATE: "/api/projects",
    UPDATE: (id: string) => `/api/projects/${id}`,
    DELETE: (id: string) => `/api/projects/${id}`,
  },
  TIME_ENTRIES: {
    LIST: "/api/time-entries",
    START: "/api/time-entries/start",
    STOP: (id: string) => `/api/time-entries/${id}/stop`,
    UPDATE: (id: string) => `/api/time-entries/${id}`,
    DELETE: (id: string) => `/api/time-entries/${id}`,
  },
} as const;

// Default values
export const DEFAULT_VALUES = {
  API_BASE_URL: "http://localhost:3000",
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
  },
  PROJECT_COLORS: [
    "#3B82F6", // blue
    "#EF4444", // red
    "#10B981", // green
    "#F59E0B", // yellow
    "#8B5CF6", // purple
    "#F97316", // orange
    "#06B6D4", // cyan
    "#84CC16", // lime
  ],
} as const;

// Status codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// Local storage keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: "timetrack_auth_token",
  USER_DATA: "timetrack_user_data",
  THEME: "timetrack_theme",
  SETTINGS: "timetrack_settings",
} as const;
