import { request } from "undici";

const DEFAULT_URL = "https://timetrack.alfredo.re";
const CLIENT_LABEL = "mcp";

export interface TimeTrackClientOptions {
  baseUrl?: string;
  apiKey?: string;
}

export class TimeTrackError extends Error {
  constructor(message: string, public status: number, public body?: string) {
    super(message);
    this.name = "TimeTrackError";
  }
}

export class TimeTrackClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(opts: TimeTrackClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.TIMETRACK_API_URL ?? DEFAULT_URL).replace(/\/$/, "");
    const apiKey = opts.apiKey ?? process.env.TIMETRACK_API_KEY;
    if (!apiKey) {
      throw new Error(
        "TIMETRACK_API_KEY is required. Mint one in Settings → API Keys and set TIMETRACK_API_KEY in your environment."
      );
    }
    this.apiKey = apiKey;
  }

  private async send<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<T> {
    const res = await request(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "X-Client": CLIENT_LABEL,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await res.body.text();
    if (res.statusCode < 200 || res.statusCode >= 300) {
      let detail = text;
      try {
        const parsed = JSON.parse(text);
        detail = parsed.error || parsed.message || text;
      } catch {
        // keep text as-is
      }
      throw new TimeTrackError(
        `TimeTrack ${method} ${path} failed (${res.statusCode}): ${detail}`,
        res.statusCode,
        text
      );
    }
    return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
  }

  // Timer
  startTimer(input: { description?: string; projectId?: string; taskId?: string }) {
    return this.send<{ message: string; timeEntry: unknown }>(
      "POST",
      "/time-entries/start",
      input
    );
  }
  stopTimer(id: string, endTime?: string) {
    return this.send<{ message: string; timeEntry: unknown }>(
      "POST",
      `/time-entries/${id}/stop`,
      endTime ? { endTime } : {}
    );
  }
  currentTimer() {
    return this.send<{ timeEntry: unknown | null }>("GET", "/time-entries/current");
  }
  recentEntries(limit = 10) {
    return this.send<{ timeEntries: unknown[] }>(
      "GET",
      `/time-entries?limit=${limit}`
    );
  }

  // Projects
  listProjects() {
    return this.send<{ projects: unknown[] }>("GET", "/projects");
  }
  createProject(input: { name: string; description?: string; color?: string; hourlyRate?: number }) {
    return this.send<{ message: string; project: unknown }>("POST", "/projects", input);
  }

  // Tasks
  listTasks(projectId?: string) {
    const q = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    return this.send<{ tasks: unknown[] }>("GET", `/tasks${q}`);
  }
  createTask(input: {
    name: string;
    projectId: string;
    description?: string;
    hourlyRate?: number;
  }) {
    return this.send<{ message: string; task: unknown }>("POST", "/tasks", input);
  }
  updateTask(
    id: string,
    input: { name?: string; description?: string; hourlyRate?: number; isCompleted?: boolean }
  ) {
    return this.send<{ message: string; task: unknown }>("PUT", `/tasks/${id}`, input);
  }

  // User
  whoami() {
    return this.send<{ user: unknown }>("GET", "/auth/me");
  }
}
