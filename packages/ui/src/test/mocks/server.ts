import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

/**
 * Handlers match on the path only, whatever the origin or prefix. The client's
 * base URL is VITE_API_URL when Vite injects it, else "/api" on the page
 * origin — and under Vitest it ends up as http://localhost:3000/api, because
 * api.ts reads the variable through a cast that Vitest doesn't replace. Use
 * this for per-test overrides too: `server.use(http.get(apiPath("/tasks"), …))`.
 */
export const apiPath = (path: string) => `*${path}`;

// Mock data
const mockProjects = [
  {
    id: "project-1",
    name: "Test Project 1",
    description: "A test project",
    isActive: true,
    hourlyRate: 50,
    userId: "user-1",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "project-2",
    name: "Test Project 2",
    description: "Another test project",
    isActive: true,
    hourlyRate: 75,
    userId: "user-1",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
];

const mockTasks = [
  {
    id: "task-1",
    name: "Test Task 1",
    description: "A test task",
    projectId: "project-1",
    hourlyRate: 60,
    isActive: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "task-2",
    name: "Test Task 2",
    description: "Another test task",
    projectId: "project-1",
    hourlyRate: 55,
    isActive: true,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
];

const zeroEarnings = () => ({
  currentTimer: { earnings: 0, duration: 0, isRunning: false, hourlyRate: 0 },
  today: { earnings: 0, duration: 0 },
  thisWeek: { earnings: 0, duration: 0 },
});

let mockCurrentEntry: any = null;
let mockTimeEntries: any[] = [];
let mockTimers: any[] = [];
let mockEarnings = zeroEarnings();
let startTimerCalls: any[] = [];

const isRunning = (entry: any) => entry && entry.startTime && !entry.endTime;

/** Running entries, most recently started first (like GET /time-entries/running). */
const runningEntries = () => {
  const list = mockTimeEntries.filter(isRunning);
  if (isRunning(mockCurrentEntry) && !list.some((e) => e.id === mockCurrentEntry.id)) {
    list.unshift(mockCurrentEntry);
  }
  return list;
};

// Define request handlers
export const handlers = [
  // Auth endpoints
  http.post(apiPath("/auth/login"), () => {
    return HttpResponse.json({
      token: "mock-jwt-token",
      user: {
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
      },
    });
  }),

  http.get(apiPath("/users/dashboard-earnings"), () => {
    return HttpResponse.json({ earnings: mockEarnings });
  }),

  // Projects and tasks
  http.get(apiPath("/projects"), () => {
    return HttpResponse.json({ projects: mockProjects });
  }),

  http.get(apiPath("/tasks"), ({ request }) => {
    const projectId = new URL(request.url).searchParams.get("projectId");
    const tasks = projectId
      ? mockTasks.filter((task) => task.projectId === projectId)
      : mockTasks;
    return HttpResponse.json({ tasks });
  }),

  http.get(apiPath("/favorites"), () => {
    return HttpResponse.json({ favorites: [] });
  }),

  // Time entries
  http.get(apiPath("/time-entries"), () => {
    const total = mockTimeEntries.length;
    return HttpResponse.json({
      entries: mockTimeEntries,
      pagination: { page: 1, limit: 50, total, pages: total ? 1 : 0 },
    });
  }),

  // Legacy single-timer endpoint: most recently started running entry.
  http.get(apiPath("/time-entries/current"), () => {
    return HttpResponse.json({ timeEntry: runningEntries()[0] ?? null });
  }),

  http.get(apiPath("/time-entries/running"), () => {
    return HttpResponse.json({ timeEntries: runningEntries() });
  }),

  // Projects and tasks are optional: the API allows unassigned timers.
  http.post(apiPath("/time-entries/start"), async ({ request }) => {
    const body = (await request.json()) as any;
    startTimerCalls.push(body);

    const now = new Date().toISOString();
    const newEntry = {
      id: `entry-${startTimerCalls.length}-${Date.now()}`,
      description: body.description ?? null,
      startTime: now,
      endTime: null,
      duration: 0,
      isRunning: true,
      projectId: body.projectId ?? null,
      taskId: body.taskId ?? null,
      userId: "user-1",
      createdAt: now,
      updatedAt: now,
    };

    mockCurrentEntry = newEntry;
    mockTimeEntries.unshift(newEntry);

    return HttpResponse.json(
      { message: "Time entry started successfully", timeEntry: newEntry },
      { status: 201 }
    );
  }),

  http.post(apiPath("/time-entries/:id/stop"), ({ params }) => {
    const entryId = params.id;
    const index = mockTimeEntries.findIndex((e) => e.id === entryId);
    const entry =
      index >= 0
        ? mockTimeEntries[index]
        : mockCurrentEntry?.id === entryId
          ? mockCurrentEntry
          : null;

    if (!entry) {
      return HttpResponse.json(
        { error: "Time entry not found" },
        { status: 404 }
      );
    }
    if (!isRunning(entry)) {
      return HttpResponse.json(
        { error: "Time entry is not running" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const updatedEntry = {
      ...entry,
      endTime: now,
      duration: 3600, // 1 hour for testing
      isRunning: false,
      updatedAt: now,
    };

    if (index >= 0) mockTimeEntries[index] = updatedEntry;
    if (mockCurrentEntry?.id === entryId) mockCurrentEntry = null;

    return HttpResponse.json({
      message: "Time entry stopped successfully",
      timeEntry: updatedEntry,
    });
  }),

  // Timers board (GET /timers?status=active → running + paused)
  http.get(apiPath("/timers"), ({ request }) => {
    const status = new URL(request.url).searchParams.get("status") || "active";
    const timers = mockTimers.filter((t) =>
      status === "all"
        ? true
        : status === "active"
          ? t.status === "running" || t.status === "paused"
          : t.status === status
    );
    return HttpResponse.json({ timers });
  }),

  http.post(apiPath("/timers/:id/:action"), ({ params }) => {
    const nextStatus: Record<string, string> = {
      pause: "paused",
      resume: "running",
      stop: "stopped",
    };
    const status = nextStatus[params.action as string];
    const index = mockTimers.findIndex((t) => t.id === params.id);
    if (!status || index < 0) {
      return HttpResponse.json({ error: "Timer not found" }, { status: 404 });
    }
    const now = new Date().toISOString();
    mockTimers[index] = {
      ...mockTimers[index],
      status,
      pauseReason: status === "paused" ? "manual" : null,
      stoppedAt: status === "stopped" ? now : null,
      updatedAt: now,
    };
    return HttpResponse.json({ timer: mockTimers[index] });
  }),
];

// Create the server
export const server = setupServer(...handlers);

// Helper functions for tests
export const resetMockData = () => {
  mockCurrentEntry = null;
  mockTimeEntries = [];
  mockTimers = [];
  mockEarnings = zeroEarnings();
  startTimerCalls = [];
};

export const setMockCurrentEntry = (entry: any) => {
  mockCurrentEntry = entry;
};

export const setMockTimeEntries = (entries: any[]) => {
  mockTimeEntries = [...entries];
};

export const setMockTimers = (timers: any[]) => {
  mockTimers = [...timers];
};

export const setMockEarnings = (
  earnings: Partial<ReturnType<typeof zeroEarnings>>
) => {
  mockEarnings = { ...zeroEarnings(), ...earnings };
};

/** Request bodies sent to POST /time-entries/start, oldest first. */
export const getStartTimerCalls = () => startTimerCalls;

// Helper to create a mock running timer that started X seconds ago
export const setMockRunningTimer = (secondsAgo: number = 300) => {
  const startTime = new Date(Date.now() - secondsAgo * 1000).toISOString();
  mockCurrentEntry = {
    id: `entry-${Date.now()}`,
    description: "Mock running timer",
    startTime: startTime,
    endTime: null,
    duration: 0,
    projectId: "project-1",
    taskId: null,
    userId: "user-1",
    createdAt: startTime,
    updatedAt: startTime,
  };
};

/** A Timer as GET /timers returns it (see Timer in @timetrack/shared). */
export const makeMockTimer = (overrides: Record<string, any> = {}) => {
  const now = new Date().toISOString();
  return {
    id: "timer-1",
    status: "running",
    description: "Mock timer",
    sessionKey: null,
    agent: null,
    createdVia: "web",
    isAiGenerated: false,
    cwd: null,
    gitRemote: null,
    gitBranch: null,
    idleTimeoutSeconds: null,
    lastActivityAt: now,
    pauseReason: null,
    startedAt: now,
    stoppedAt: null,
    costUsd: null,
    projectId: "project-1",
    taskId: null,
    project: { id: "project-1", name: "Test Project 1", color: "#3B82F6" },
    task: null,
    currentEntry: null,
    segmentCount: 1,
    noteCount: 0,
    trackedSeconds: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

export const getMockProjects = () => mockProjects;
export const getMockTasks = () => mockTasks;
