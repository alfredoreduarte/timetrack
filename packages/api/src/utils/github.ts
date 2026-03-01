import { logger } from "./logger";

interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  description: string | null;
  html_url: string;
  private: boolean;
  open_issues_count: number;
}

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  labels: Array<{ name: string; color: string }>;
  pull_request?: unknown;
  created_at: string;
  updated_at: string;
}

interface GitHubWebhook {
  id: number;
  active: boolean;
  events: string[];
  config: { url: string };
}

export class GitHubService {
  private accessToken: string;
  private baseUrl = "https://api.github.com";

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.headers as Record<string, string>),
      },
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error(`GitHub API error: ${response.status} ${error}`);
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  async getAuthenticatedUser(): Promise<GitHubUser> {
    return this.request<GitHubUser>("/user");
  }

  async listRepos(page = 1, perPage = 100): Promise<GitHubRepo[]> {
    return this.request<GitHubRepo[]>(
      `/user/repos?sort=updated&per_page=${perPage}&page=${page}&type=all`
    );
  }

  async listIssues(
    owner: string,
    repo: string,
    state = "open",
    page = 1,
    perPage = 100
  ): Promise<GitHubIssue[]> {
    const issues = await this.request<GitHubIssue[]>(
      `/repos/${owner}/${repo}/issues?state=${state}&per_page=${perPage}&page=${page}&sort=created&direction=desc`
    );
    // Filter out pull requests (GitHub returns PRs in the issues endpoint)
    return issues.filter((issue) => !issue.pull_request);
  }

  async getIssue(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<GitHubIssue> {
    return this.request<GitHubIssue>(
      `/repos/${owner}/${repo}/issues/${issueNumber}`
    );
  }

  async createWebhook(
    owner: string,
    repo: string,
    callbackUrl: string,
    secret: string
  ): Promise<GitHubWebhook> {
    return this.request<GitHubWebhook>(`/repos/${owner}/${repo}/hooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "web",
        active: true,
        events: ["issues"],
        config: {
          url: callbackUrl,
          content_type: "json",
          secret,
          insecure_ssl: "0",
        },
      }),
    });
  }

  async deleteWebhook(
    owner: string,
    repo: string,
    hookId: number
  ): Promise<void> {
    await fetch(`${this.baseUrl}/repos/${owner}/${repo}/hooks/${hookId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  }
}
