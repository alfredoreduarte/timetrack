import { request } from "undici";

const DEFAULT_URL = "https://app.track.alfredo.re/api";
const CLIENT_LABEL = "mcp";
// Hard ceilings to keep a misbehaving server (or one we've misconfigured the
// URL to) from blowing up the agent process or leaking the key back to the LLM.
const MAX_BODY_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 30_000;
const TOKEN_REDACT_RE = /tt_[A-Za-z0-9]+/g;

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

  private redact = (s: string) => s.replace(TOKEN_REDACT_RE, "tt_[REDACTED]");

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
      bodyTimeout: REQUEST_TIMEOUT_MS,
      headersTimeout: REQUEST_TIMEOUT_MS,
    });

    // Drain with a size cap so a hostile server can't OOM the agent.
    let text = "";
    for await (const chunk of res.body) {
      text += chunk.toString();
      if (text.length > MAX_BODY_BYTES) {
        res.body.destroy();
        throw new TimeTrackError(
          `TimeTrack ${method} ${path} returned > ${MAX_BODY_BYTES} bytes; aborting`,
          res.statusCode
        );
      }
    }

    if (res.statusCode < 200 || res.statusCode >= 300) {
      let detail = text;
      try {
        const parsed = JSON.parse(text);
        detail = parsed.error || parsed.message || text;
      } catch {
        // keep text as-is
      }
      // Strip any echoed token so we never round-trip credentials to the LLM.
      const safeDetail = this.redact(detail);
      throw new TimeTrackError(
        `TimeTrack ${method} ${path} failed (${res.statusCode}): ${safeDetail}`,
        res.statusCode,
        this.redact(text)
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
  runningTimers() {
    return this.send<{ timeEntries: Array<{ id: string; [k: string]: unknown }> }>(
      "GET",
      "/time-entries/running"
    );
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
