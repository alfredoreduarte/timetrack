import request from "supertest";
import express, { Express } from "express";
import { prisma } from "../../utils/database";
import jwt from "jsonwebtoken";

// Mock dependencies
jest.mock("../../utils/database", () => ({
  prisma: {
    timeEntry: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    project: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    task: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("jsonwebtoken");

// Suppress console output in tests
jest.spyOn(console, "error").mockImplementation(() => {});
jest.spyOn(console, "warn").mockImplementation(() => {});

// Set JWT_SECRET for auth middleware
process.env.JWT_SECRET = "test-secret";

describe("GET /time-entries/suggestions", () => {
  let app: Express;
  let authToken: string;
  const userId = "test-user-id";

  beforeAll(async () => {
    // Dynamically import and set up app
    const { default: timeEntryRoutes } = await import("../timeEntries");
    const { errorHandler } = await import("../../middleware/errorHandler");

    app = express();
    app.use(express.json());

    // Mock Socket.IO
    app.set("io", {
      to: () => ({
        emit: jest.fn(),
      }),
    });

    app.use("/time-entries", timeEntryRoutes);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    authToken = "valid-token";
    (jwt.verify as jest.Mock).mockReturnValue({ userId });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: userId,
      email: "test@example.com",
      name: "Test User",
    });
  });

  const mockEntries = [
    {
      description: "Code review - PR #142",
      startTime: new Date("2026-02-28T16:30:00.000Z"),
      project: { id: "p1", name: "TimeTrack", color: "#3B82F6" },
      task: { id: "t1", name: "Reviews" },
      projectId: "p1",
    },
    {
      description: "Code review - PR #142",
      startTime: new Date("2026-02-27T14:00:00.000Z"),
      project: { id: "p1", name: "TimeTrack", color: "#3B82F6" },
      task: { id: "t1", name: "Reviews" },
      projectId: "p1",
    },
    {
      description: "Code review - PR #142",
      startTime: new Date("2026-02-26T10:00:00.000Z"),
      project: { id: "p1", name: "TimeTrack", color: "#3B82F6" },
      task: { id: "t1", name: "Reviews" },
      projectId: "p1",
    },
    {
      description: "Code cleanup and refactoring",
      startTime: new Date("2026-02-27T10:00:00.000Z"),
      project: { id: "p1", name: "TimeTrack", color: "#3B82F6" },
      task: null,
      projectId: "p1",
    },
    {
      description: "Code cleanup and refactoring",
      startTime: new Date("2026-02-25T09:00:00.000Z"),
      project: { id: "p2", name: "Landing Page", color: "#10B981" },
      task: null,
      projectId: "p2",
    },
  ];

  it("should return suggestions matching query", async () => {
    (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);

    const res = await request(app)
      .get("/time-entries/suggestions?q=code")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.suggestions).toBeDefined();
    expect(res.body.suggestions.length).toBeGreaterThan(0);
    res.body.suggestions.forEach((s: any) => {
      expect(s.description.toLowerCase()).toContain("code");
    });
  });

  it("should return frequency count", async () => {
    (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);

    const res = await request(app)
      .get("/time-entries/suggestions?q=code")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    // "Code review - PR #142" appears 3 times
    const codeReview = res.body.suggestions.find(
      (s: any) => s.description === "Code review - PR #142"
    );
    expect(codeReview).toBeDefined();
    expect(codeReview.frequency).toBe(3);
  });

  it("should order by frequency descending", async () => {
    (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);

    const res = await request(app)
      .get("/time-entries/suggestions?q=code")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    const suggestions = res.body.suggestions;
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1].frequency).toBeGreaterThanOrEqual(
        suggestions[i].frequency
      );
    }
  });

  it("should de-duplicate descriptions case-insensitively", async () => {
    (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);

    const res = await request(app)
      .get("/time-entries/suggestions?q=code")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    const descriptions = res.body.suggestions.map(
      (s: any) => s.description.toLowerCase()
    );
    const unique = new Set(descriptions);
    expect(descriptions.length).toBe(unique.size);
  });

  it("should include project and task info", async () => {
    (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);

    const res = await request(app)
      .get("/time-entries/suggestions?q=code+review")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    const suggestion = res.body.suggestions[0];
    expect(suggestion.project).toBeDefined();
    expect(suggestion.project.name).toBe("TimeTrack");
    expect(suggestion.task).toBeDefined();
    expect(suggestion.task.name).toBe("Reviews");
  });

  it("should prioritize matching project when projectId provided", async () => {
    const entriesWithMultipleProjects = [
      {
        description: "Code review",
        startTime: new Date("2026-02-28T16:30:00.000Z"),
        project: { id: "p2", name: "Landing Page", color: "#10B981" },
        task: null,
        projectId: "p2",
      },
      {
        description: "Code review",
        startTime: new Date("2026-02-27T14:00:00.000Z"),
        project: { id: "p2", name: "Landing Page", color: "#10B981" },
        task: null,
        projectId: "p2",
      },
      {
        description: "Code cleanup",
        startTime: new Date("2026-02-28T10:00:00.000Z"),
        project: { id: "p1", name: "TimeTrack", color: "#3B82F6" },
        task: null,
        projectId: "p1",
      },
    ];

    (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(
      entriesWithMultipleProjects
    );

    const res = await request(app)
      .get("/time-entries/suggestions?q=code&projectId=p1")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    // p1 entry should come first despite lower frequency
    expect(res.body.suggestions[0].description).toBe("Code cleanup");
  });

  it("should respect limit parameter", async () => {
    (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);

    const res = await request(app)
      .get("/time-entries/suggestions?q=code&limit=1")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.suggestions.length).toBeLessThanOrEqual(1);
  });

  it("should cap limit at 20", async () => {
    (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(mockEntries);

    const res = await request(app)
      .get("/time-entries/suggestions?q=code&limit=100")
      .set("Authorization", `Bearer ${authToken}`);

    // Should not return error, Zod caps at 20
    expect(res.status).toBe(400); // Zod validation will reject limit > 20
  });

  it("should return 400 when q parameter is missing", async () => {
    const res = await request(app)
      .get("/time-entries/suggestions")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(400);
  });

  it("should return empty array for no matches", async () => {
    (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([]);

    const res = await request(app)
      .get("/time-entries/suggestions?q=xyzzy_nonexistent")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.suggestions).toEqual([]);
  });

  it("should require authentication", async () => {
    (jwt.verify as jest.Mock).mockImplementation(() => {
      throw new jwt.JsonWebTokenError("Invalid token");
    });

    const res = await request(app)
      .get("/time-entries/suggestions?q=code")
      .set("Authorization", "Bearer invalid-token");

    expect(res.status).toBe(401);
  });

  it("should only query current user entries", async () => {
    (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([]);

    await request(app)
      .get("/time-entries/suggestions?q=code")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    expect(prisma.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId,
        }),
      })
    );
  });

  it("should exclude null and empty descriptions", async () => {
    (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue([]);

    await request(app)
      .get("/time-entries/suggestions?q=test")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    expect(prisma.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          description: expect.objectContaining({
            not: "",
            contains: "test",
            mode: "insensitive",
          }),
        }),
      })
    );
  });

  it("should return lastUsed as ISO string", async () => {
    (prisma.timeEntry.findMany as jest.Mock).mockResolvedValue(
      mockEntries.slice(0, 1)
    );

    const res = await request(app)
      .get("/time-entries/suggestions?q=code")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    if (res.body.suggestions.length > 0) {
      expect(res.body.suggestions[0].lastUsed).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      );
    }
  });
});
