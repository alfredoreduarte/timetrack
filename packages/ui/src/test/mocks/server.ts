import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

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

let mockCurrentEntry: any = null;
let mockTimeEntries: any[] = [];

// Define request handlers
export const handlers = [
  // Auth endpoints
  http.post("http://localhost:3011/auth/login", () => {
    return HttpResponse.json({
      token: "mock-jwt-token",
      user: {
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
      },
    });
  }),

  // Projects endpoints - Fixed to match API service expectations
  http.get("http://localhost:3011/projects", () => {
    return HttpResponse.json({ projects: mockProjects });
  }),

  http.get("http://localhost:3011/projects/:id/tasks", ({ params }) => {
    const projectId = params.id;
    const projectTasks = mockTasks.filter(
      (task) => task.projectId === projectId
    );
    return HttpResponse.json(projectTasks);
  }),

  // Tasks endpoints - Fixed to match API service expectations
  http.get("http://localhost:3011/tasks", ({ request }) => {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");

    if (projectId) {
      const projectTasks = mockTasks.filter(
        (task) => task.projectId === projectId
      );
      return HttpResponse.json(projectTasks);
    }

    return HttpResponse.json(mockTasks);
  }),

  // Time entries endpoints
  http.get("http://localhost:3011/time-entries/current", () => {
    // Return 200 with { timeEntry: null } instead of 404 when no current entry
    if (mockCurrentEntry === undefined || mockCurrentEntry === null) {
      return HttpResponse.json({ timeEntry: null });
    }

    if (
      mockCurrentEntry &&
      mockCurrentEntry.startTime &&
      !mockCurrentEntry.endTime
    ) {
      // Calculate duration for running timer
      const startTime = new Date(mockCurrentEntry.startTime).getTime();
      const now = new Date().getTime();
      const calculatedDuration = Math.floor((now - startTime) / 1000);

      return HttpResponse.json({
        timeEntry: {
          ...mockCurrentEntry,
          duration: calculatedDuration,
        },
      });
    }
    return HttpResponse.json({ timeEntry: mockCurrentEntry });
  }),

  http.post("http://localhost:3011/time-entries/start", async ({ request }) => {
    const body = (await request.json()) as any;

    // Simulate error if no projectId provided
    if (!body.projectId) {
      return HttpResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    const newEntry = {
      id: `entry-${Date.now()}`,
      description: body.description || "",
      startTime: new Date().toISOString(),
      endTime: null,
      duration: 0,
      projectId: body.projectId,
      taskId: body.taskId || null,
      userId: "user-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockCurrentEntry = newEntry;
    mockTimeEntries.unshift(newEntry);

    return HttpResponse.json(newEntry);
  }),

  http.post(
    "http://localhost:3011/time-entries/:id/stop",
    async ({ params }) => {
      const entryId = params.id;
      const entry = mockTimeEntries.find((e) => e.id === entryId);

      if (!entry) {
        return HttpResponse.json(
          { error: "Time entry not found" },
          { status: 404 }
        );
      }

      const updatedEntry = {
        ...entry,
        endTime: new Date().toISOString(),
        duration: 3600, // 1 hour for testing
        updatedAt: new Date().toISOString(),
      };

      const index = mockTimeEntries.findIndex((e) => e.id === entryId);
      mockTimeEntries[index] = updatedEntry;
      mockCurrentEntry = null;

      return HttpResponse.json(updatedEntry);
    }
  ),
];

// Create the server
export const server = setupServer(...handlers);

// Helper functions for tests
export const resetMockData = () => {
  mockCurrentEntry = null;
  mockTimeEntries = [];
};

export const setMockCurrentEntry = (entry: any) => {
  mockCurrentEntry = entry;
};

// Helper to create a mock running timer that started X seconds ago
export const setMockRunningTimer = (secondsAgo: number = 300) => {
  const startTime = new Date(Date.now() - secondsAgo * 1000).toISOString();
  mockCurrentEntry = {
    id: `entry-${Date.now()}`,
    description: "Mock running timer",
    startTime: startTime,
    endTime: null,
    duration: 0, // Will be calculated by getCurrentEntry
    projectId: "project-1",
    taskId: null,
    userId: "user-1",
    createdAt: startTime,
    updatedAt: startTime,
  };
};

export const getMockProjects = () => mockProjects;
export const getMockTasks = () => mockTasks;
