import express from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../utils/database";
import { asyncHandler, createError } from "../middleware/errorHandler";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";
import { encrypt, decrypt } from "../utils/encryption";
import { GitHubService } from "../utils/github";
import { logger } from "../utils/logger";

const router = express.Router();

// In-memory OAuth state store (state -> { userId, expiresAt })
const oauthStateStore = new Map<
  string,
  { userId: string; expiresAt: number }
>();

// Clean expired states periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of oauthStateStore) {
    if (value.expiresAt < now) {
      oauthStateStore.delete(key);
    }
  }
}, 60_000);

// Helper to get GitHub service for the authenticated user
async function getGitHubService(userId: string): Promise<GitHubService> {
  const integration = await prisma.gitHubIntegration.findUnique({
    where: { userId },
  });
  if (!integration) {
    throw createError("GitHub not connected", 400);
  }
  const token = decrypt(integration.accessToken);
  return new GitHubService(token);
}

// Standard select for task responses
const taskSelect = {
  id: true,
  name: true,
  description: true,
  isCompleted: true,
  hourlyRate: true,
  createdAt: true,
  updatedAt: true,
  githubIssueNumber: true,
  githubIssueUrl: true,
  githubLabels: true,
  githubIssueState: true,
  project: {
    select: {
      id: true,
      name: true,
      color: true,
    },
  },
} as const;

// ─── OAuth Flow ────────────────────────────────────────────────

// GET /github/auth-url — Returns the GitHub OAuth authorization URL
router.get(
  "/auth-url",
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      throw createError("GitHub OAuth not configured", 500);
    }

    const state = crypto.randomBytes(20).toString("hex");
    oauthStateStore.set(state, {
      userId: req.user!.id,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    });

    const redirectUri =
      process.env.GITHUB_CALLBACK_URL ||
      "http://localhost:3011/github/callback";

    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "repo");
    url.searchParams.set("state", state);

    res.json({ url: url.toString() });
  })
);

// GET /github/callback — OAuth callback from GitHub
router.get(
  "/callback",
  asyncHandler(async (req, res) => {
    const { code, state } = req.query;

    if (!code || !state || typeof code !== "string" || typeof state !== "string") {
      throw createError("Invalid callback parameters", 400);
    }

    const stored = oauthStateStore.get(state);
    if (!stored || stored.expiresAt < Date.now()) {
      oauthStateStore.delete(state as string);
      throw createError("Invalid or expired state", 400);
    }

    const userId = stored.userId;
    oauthStateStore.delete(state);

    // Exchange code for access token
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri:
            process.env.GITHUB_CALLBACK_URL ||
            "http://localhost:3011/github/callback",
        }),
      }
    );

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (tokenData.error || !tokenData.access_token) {
      logger.error("GitHub OAuth error", tokenData);
      throw createError(
        tokenData.error_description || "Failed to get access token",
        400
      );
    }

    // Get GitHub user info
    const github = new GitHubService(tokenData.access_token);
    const githubUser = await github.getAuthenticatedUser();

    // Store integration (encrypt token)
    const encryptedToken = encrypt(tokenData.access_token);

    await prisma.gitHubIntegration.upsert({
      where: { userId },
      create: {
        userId,
        githubUserId: githubUser.id,
        githubUsername: githubUser.login,
        accessToken: encryptedToken,
        scope: tokenData.scope || null,
        avatarUrl: githubUser.avatar_url,
      },
      update: {
        githubUserId: githubUser.id,
        githubUsername: githubUser.login,
        accessToken: encryptedToken,
        scope: tokenData.scope || null,
        avatarUrl: githubUser.avatar_url,
      },
    });

    logger.info(`GitHub connected for user ${userId} as ${githubUser.login}`);

    // Redirect to UI settings page
    const appUrl = process.env.APPLICATION_URL || "http://localhost:3010";
    res.redirect(`${appUrl}/settings?github=connected`);
  })
);

// GET /github/status — Check GitHub connection status
router.get(
  "/status",
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const integration = await prisma.gitHubIntegration.findUnique({
      where: { userId: req.user!.id },
      select: {
        githubUsername: true,
        avatarUrl: true,
      },
    });

    if (!integration) {
      res.json({ connected: false });
      return;
    }

    res.json({
      connected: true,
      username: integration.githubUsername,
      avatarUrl: integration.avatarUrl,
    });
  })
);

// DELETE /github/disconnect — Disconnect GitHub
router.delete(
  "/disconnect",
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const integration = await prisma.gitHubIntegration.findUnique({
      where: { userId },
    });

    if (!integration) {
      throw createError("GitHub not connected", 400);
    }

    // Clean up webhooks on linked projects (best-effort)
    try {
      const token = decrypt(integration.accessToken);
      const github = new GitHubService(token);
      const linkedProjects = await prisma.project.findMany({
        where: { userId, githubWebhookId: { not: null } },
      });

      for (const project of linkedProjects) {
        if (
          project.githubWebhookId &&
          project.githubRepoOwner &&
          project.githubRepoName
        ) {
          await github
            .deleteWebhook(
              project.githubRepoOwner,
              project.githubRepoName,
              project.githubWebhookId
            )
            .catch(() => {});
        }
      }
    } catch {
      // Best-effort cleanup
    }

    // Clear GitHub fields on linked projects
    await prisma.project.updateMany({
      where: { userId },
      data: {
        githubRepoId: null,
        githubRepoOwner: null,
        githubRepoName: null,
        githubRepoFullName: null,
        githubWebhookId: null,
        githubWebhookSecret: null,
      },
    });

    // Delete integration
    await prisma.gitHubIntegration.delete({ where: { userId } });

    logger.info(`GitHub disconnected for user ${userId}`);
    res.json({ message: "GitHub disconnected" });
  })
);

// ─── Repository Linking ────────────────────────────────────────

// GET /github/repos — List user's GitHub repos
router.get(
  "/repos",
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const github = await getGitHubService(req.user!.id);
    const page = parseInt(req.query.page as string) || 1;
    const repos = await github.listRepos(page);

    res.json({
      repos: repos.map((repo) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        owner: repo.owner.login,
        description: repo.description,
        html_url: repo.html_url,
        private: repo.private,
        open_issues_count: repo.open_issues_count,
      })),
    });
  })
);

const linkRepoSchema = z.object({
  repoId: z.number(),
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
});

// POST /github/projects/:projectId/link-repo — Link a repo to a project
router.post(
  "/projects/:projectId/link-repo",
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { projectId } = req.params;
    const { repoId, owner, name, fullName } = linkRepoSchema.parse(req.body);

    // Verify project belongs to user
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.user!.id },
    });
    if (!project) {
      throw createError("Project not found", 404);
    }

    const github = await getGitHubService(req.user!.id);

    // Create webhook
    const webhookSecret = crypto.randomBytes(20).toString("hex");
    const callbackUrl =
      process.env.GITHUB_WEBHOOK_URL ||
      `${process.env.APPLICATION_URL || "http://localhost:3011"}/webhooks/github`;

    let webhookId: number | null = null;
    try {
      const webhook = await github.createWebhook(
        owner,
        name,
        callbackUrl,
        webhookSecret
      );
      webhookId = webhook.id;
    } catch (err) {
      logger.warn("Could not create webhook (may need public URL)", err);
      // Continue without webhook — user can still manually sync
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        githubRepoId: repoId,
        githubRepoOwner: owner,
        githubRepoName: name,
        githubRepoFullName: fullName,
        githubWebhookId: webhookId,
        githubWebhookSecret: webhookSecret,
      },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        hourlyRate: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        githubRepoId: true,
        githubRepoOwner: true,
        githubRepoName: true,
        githubRepoFullName: true,
      },
    });

    const io = req.app.get("io");
    io.to(`user-${req.user!.id}`).emit("project-updated", updated);

    res.json({
      message: "Repository linked successfully",
      project: updated,
      webhookCreated: webhookId !== null,
    });
  })
);

// DELETE /github/projects/:projectId/unlink-repo — Unlink repo from project
router.delete(
  "/projects/:projectId/unlink-repo",
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { projectId } = req.params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.user!.id },
    });
    if (!project) {
      throw createError("Project not found", 404);
    }

    // Delete webhook (best-effort)
    if (
      project.githubWebhookId &&
      project.githubRepoOwner &&
      project.githubRepoName
    ) {
      try {
        const github = await getGitHubService(req.user!.id);
        await github.deleteWebhook(
          project.githubRepoOwner,
          project.githubRepoName,
          project.githubWebhookId
        );
      } catch {
        // Best-effort
      }
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        githubRepoId: null,
        githubRepoOwner: null,
        githubRepoName: null,
        githubRepoFullName: null,
        githubWebhookId: null,
        githubWebhookSecret: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        color: true,
        hourlyRate: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        githubRepoId: true,
        githubRepoOwner: true,
        githubRepoName: true,
        githubRepoFullName: true,
      },
    });

    const io = req.app.get("io");
    io.to(`user-${req.user!.id}`).emit("project-updated", updated);

    res.json({ message: "Repository unlinked" });
  })
);

// ─── Issue Sync ────────────────────────────────────────────────

// POST /github/projects/:projectId/sync-issues — Bulk sync issues as tasks
router.post(
  "/projects/:projectId/sync-issues",
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { projectId } = req.params;

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.user!.id },
    });
    if (!project || !project.githubRepoOwner || !project.githubRepoName) {
      throw createError("Project not linked to a GitHub repository", 400);
    }

    const github = await getGitHubService(req.user!.id);
    const io = req.app.get("io");
    let imported = 0;
    let updated = 0;

    // Fetch issues (up to 200, open + closed)
    for (const state of ["open", "closed"] as const) {
      let page = 1;
      const maxPages = 2; // 200 issues max per state

      while (page <= maxPages) {
        const issues = await github.listIssues(
          project.githubRepoOwner!,
          project.githubRepoName!,
          state,
          page
        );

        if (issues.length === 0) break;

        for (const issue of issues) {
          const taskData = {
            name: issue.title.substring(0, 255),
            description: (issue.body || "").substring(0, 2000),
            isCompleted: issue.state === "closed",
            githubIssueId: issue.id,
            githubIssueNumber: issue.number,
            githubIssueUrl: issue.html_url,
            githubLabels: JSON.stringify(
              issue.labels?.map((l) => l.name) || []
            ),
            githubIssueState: issue.state,
          };

          const existing = await prisma.task.findUnique({
            where: {
              projectId_githubIssueNumber: {
                projectId,
                githubIssueNumber: issue.number,
              },
            },
          });

          if (existing) {
            const task = await prisma.task.update({
              where: { id: existing.id },
              data: taskData,
              select: taskSelect,
            });
            io.to(`user-${req.user!.id}`).emit("task-updated", task);
            updated++;
          } else {
            const task = await prisma.task.create({
              data: {
                ...taskData,
                projectId,
                userId: req.user!.id,
              },
              select: taskSelect,
            });
            io.to(`user-${req.user!.id}`).emit("task-created", task);
            imported++;
          }
        }

        if (issues.length < 100) break;
        page++;
      }
    }

    logger.info(
      `Issue sync for project ${projectId}: ${imported} imported, ${updated} updated`
    );

    res.json({ imported, updated });
  })
);

// POST /github/projects/:projectId/import-issue — Import a single issue
router.post(
  "/projects/:projectId/import-issue",
  authenticate,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { projectId } = req.params;
    const { issueNumber } = z
      .object({ issueNumber: z.number() })
      .parse(req.body);

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.user!.id },
    });
    if (!project || !project.githubRepoOwner || !project.githubRepoName) {
      throw createError("Project not linked to a GitHub repository", 400);
    }

    const github = await getGitHubService(req.user!.id);
    const issue = await github.getIssue(
      project.githubRepoOwner,
      project.githubRepoName,
      issueNumber
    );

    const taskData = {
      name: issue.title.substring(0, 255),
      description: (issue.body || "").substring(0, 2000),
      isCompleted: issue.state === "closed",
      githubIssueId: issue.id,
      githubIssueNumber: issue.number,
      githubIssueUrl: issue.html_url,
      githubLabels: JSON.stringify(issue.labels?.map((l) => l.name) || []),
      githubIssueState: issue.state,
    };

    const task = await prisma.task.upsert({
      where: {
        projectId_githubIssueNumber: {
          projectId,
          githubIssueNumber: issueNumber,
        },
      },
      create: {
        ...taskData,
        projectId,
        userId: req.user!.id,
      },
      update: taskData,
      select: taskSelect,
    });

    const io = req.app.get("io");
    io.to(`user-${req.user!.id}`).emit("task-created", task);

    res.json({ task });
  })
);

export default router;
