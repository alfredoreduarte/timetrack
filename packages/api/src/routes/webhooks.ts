import express from "express";
import crypto from "crypto";
import { prisma } from "../utils/database";
import { logger } from "../utils/logger";

const router = express.Router();

// Webhook route uses raw body for signature verification
router.use(express.raw({ type: "application/json", limit: "1mb" }));

function verifySignature(
  payload: Buffer,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const expected = `sha256=${hmac.digest("hex")}`;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// Task select for socket emissions (matches task route pattern)
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

router.post("/github", async (req, res) => {
  try {
    const signature = req.headers["x-hub-signature-256"] as string;
    const event = req.headers["x-github-event"] as string;

    if (!signature || !event) {
      res.status(400).json({ error: "Missing webhook headers" });
      return;
    }

    const payload = req.body as Buffer;
    const body = JSON.parse(payload.toString());

    const repoId = body.repository?.id;
    if (!repoId) {
      res.status(400).json({ error: "No repository in payload" });
      return;
    }

    // Find the project linked to this repo
    const project = await prisma.project.findFirst({
      where: { githubRepoId: repoId },
    });

    if (!project || !project.githubWebhookSecret) {
      // Not our repo or no secret — ignore silently
      res.status(200).json({ message: "ignored" });
      return;
    }

    // Verify signature
    if (!verifySignature(payload, signature, project.githubWebhookSecret)) {
      logger.warn(`Invalid webhook signature for repo ${repoId}`);
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    // Handle issues events
    if (event === "issues") {
      await handleIssueEvent(body, project, req);
    }

    res.status(200).json({ message: "ok" });
  } catch (err) {
    logger.error("Webhook processing error", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

async function handleIssueEvent(
  body: any,
  project: { id: string; userId: string },
  req: express.Request
) {
  const { action, issue } = body;
  const io = req.app.get("io");

  const labelsJson = JSON.stringify(
    issue.labels?.map((l: any) => l.name) || []
  );

  switch (action) {
    case "opened": {
      // Check if task already exists (idempotency)
      const existing = await prisma.task.findUnique({
        where: {
          projectId_githubIssueNumber: {
            projectId: project.id,
            githubIssueNumber: issue.number,
          },
        },
      });
      if (existing) break;

      const task = await prisma.task.create({
        data: {
          name: issue.title.substring(0, 255),
          description: (issue.body || "").substring(0, 2000),
          projectId: project.id,
          userId: project.userId,
          githubIssueId: issue.id,
          githubIssueNumber: issue.number,
          githubIssueUrl: issue.html_url,
          githubLabels: labelsJson,
          githubIssueState: issue.state,
          isCompleted: false,
        },
        select: taskSelect,
      });
      io.to(`user-${project.userId}`).emit("task-created", task);
      break;
    }

    case "closed": {
      const task = await prisma.task.findUnique({
        where: {
          projectId_githubIssueNumber: {
            projectId: project.id,
            githubIssueNumber: issue.number,
          },
        },
      });
      if (!task) break;

      const updated = await prisma.task.update({
        where: { id: task.id },
        data: { isCompleted: true, githubIssueState: "closed" },
        select: taskSelect,
      });
      io.to(`user-${project.userId}`).emit("task-updated", updated);
      break;
    }

    case "reopened": {
      const task = await prisma.task.findUnique({
        where: {
          projectId_githubIssueNumber: {
            projectId: project.id,
            githubIssueNumber: issue.number,
          },
        },
      });
      if (!task) break;

      const updated = await prisma.task.update({
        where: { id: task.id },
        data: { isCompleted: false, githubIssueState: "open" },
        select: taskSelect,
      });
      io.to(`user-${project.userId}`).emit("task-updated", updated);
      break;
    }

    case "edited": {
      const task = await prisma.task.findUnique({
        where: {
          projectId_githubIssueNumber: {
            projectId: project.id,
            githubIssueNumber: issue.number,
          },
        },
      });
      if (!task) break;

      const updated = await prisma.task.update({
        where: { id: task.id },
        data: {
          name: issue.title.substring(0, 255),
          description: (issue.body || "").substring(0, 2000),
        },
        select: taskSelect,
      });
      io.to(`user-${project.userId}`).emit("task-updated", updated);
      break;
    }

    case "labeled":
    case "unlabeled": {
      const task = await prisma.task.findUnique({
        where: {
          projectId_githubIssueNumber: {
            projectId: project.id,
            githubIssueNumber: issue.number,
          },
        },
      });
      if (!task) break;

      const updated = await prisma.task.update({
        where: { id: task.id },
        data: { githubLabels: labelsJson },
        select: taskSelect,
      });
      io.to(`user-${project.userId}`).emit("task-updated", updated);
      break;
    }
  }
}

export default router;
