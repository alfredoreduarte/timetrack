import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "test@example.com";
  const password = "123456";
  const hashedPassword = await bcrypt.hash(password, 12);

  // Create test user
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Test User",
      password: hashedPassword,
      defaultHourlyRate: 75,
      idleTimeoutSeconds: 600,
    },
  });

  // Create projects
  const webRedesign = await prisma.project.upsert({
    where: { id: "seed-project-web" },
    update: {},
    create: {
      id: "seed-project-web",
      name: "Website Redesign",
      description: "Complete overhaul of the marketing site",
      color: "#3B82F6",
      hourlyRate: 100,
      userId: user.id,
      isActive: true,
    },
  });

  const mobileApp = await prisma.project.upsert({
    where: { id: "seed-project-mobile" },
    update: {},
    create: {
      id: "seed-project-mobile",
      name: "Mobile App",
      description: "iOS and Android native app development",
      color: "#10B981",
      hourlyRate: 120,
      userId: user.id,
      isActive: true,
    },
  });

  const internal = await prisma.project.upsert({
    where: { id: "seed-project-internal" },
    update: {},
    create: {
      id: "seed-project-internal",
      name: "Internal Tools",
      description: "Admin dashboards, scripts, and automation",
      color: "#F59E0B",
      userId: user.id,
      isActive: true,
    },
  });

  // Create tasks for Website Redesign
  const taskDesign = await prisma.task.upsert({
    where: { id: "seed-task-design" },
    update: {},
    create: {
      id: "seed-task-design",
      name: "UI Design",
      description: "Figma mockups and design system",
      projectId: webRedesign.id,
      userId: user.id,
      hourlyRate: 110,
    },
  });

  const taskFrontend = await prisma.task.upsert({
    where: { id: "seed-task-frontend" },
    update: {},
    create: {
      id: "seed-task-frontend",
      name: "Frontend Development",
      description: "React components and pages",
      projectId: webRedesign.id,
      userId: user.id,
    },
  });

  await prisma.task.upsert({
    where: { id: "seed-task-copywriting" },
    update: {},
    create: {
      id: "seed-task-copywriting",
      name: "Copywriting",
      description: "Page copy and microcopy",
      projectId: webRedesign.id,
      userId: user.id,
      isCompleted: true,
    },
  });

  // Create tasks for Mobile App
  await prisma.task.upsert({
    where: { id: "seed-task-ios" },
    update: {},
    create: {
      id: "seed-task-ios",
      name: "iOS Development",
      projectId: mobileApp.id,
      userId: user.id,
    },
  });

  await prisma.task.upsert({
    where: { id: "seed-task-api-integration" },
    update: {},
    create: {
      id: "seed-task-api-integration",
      name: "API Integration",
      projectId: mobileApp.id,
      userId: user.id,
    },
  });

  // Create tasks for Internal Tools
  await prisma.task.upsert({
    where: { id: "seed-task-admin" },
    update: {},
    create: {
      id: "seed-task-admin",
      name: "Admin Dashboard",
      projectId: internal.id,
      userId: user.id,
    },
  });

  // Delete existing seed time entries then recreate (idempotent on re-run)
  await prisma.timeEntry.deleteMany({
    where: { id: { startsWith: "seed-entry-" } },
  });

  // Create past time entries (last 7 days)
  const now = new Date();
  const entries = [
    { id: "seed-entry-00", daysAgo: 0, startHour: 9,  hours: 2.5, project: webRedesign, task: taskDesign, desc: "Homepage hero section design" },
    { id: "seed-entry-01", daysAgo: 0, startHour: 12, hours: 1.0, project: mobileApp, task: null, desc: "Sprint planning" },
    { id: "seed-entry-02", daysAgo: 1, startHour: 9,  hours: 4.0, project: webRedesign, task: taskFrontend, desc: "Implement navigation component" },
    { id: "seed-entry-03", daysAgo: 1, startHour: 14, hours: 1.5, project: internal, task: null, desc: "Deploy script improvements" },
    { id: "seed-entry-04", daysAgo: 2, startHour: 10, hours: 3.0, project: mobileApp, task: null, desc: "Authentication flow" },
    { id: "seed-entry-05", daysAgo: 2, startHour: 14, hours: 2.0, project: webRedesign, task: taskDesign, desc: "About page wireframes" },
    { id: "seed-entry-06", daysAgo: 3, startHour: 9,  hours: 5.0, project: webRedesign, task: taskFrontend, desc: "Dashboard layout and responsive grid" },
    { id: "seed-entry-07", daysAgo: 4, startHour: 10, hours: 3.5, project: mobileApp, task: null, desc: "Timer screen UI" },
    { id: "seed-entry-08", daysAgo: 4, startHour: 14, hours: 1.0, project: internal, task: null, desc: "CI pipeline fixes" },
    { id: "seed-entry-09", daysAgo: 5, startHour: 9,  hours: 4.0, project: webRedesign, task: taskFrontend, desc: "Form components and validation" },
    { id: "seed-entry-10", daysAgo: 6, startHour: 11, hours: 2.0, project: mobileApp, task: null, desc: "Project list screen" },
    { id: "seed-entry-11", daysAgo: 6, startHour: 9,  hours: 3.0, project: webRedesign, task: taskDesign, desc: "Design system tokens" },
  ];

  for (const entry of entries) {
    const startTime = new Date(now);
    startTime.setDate(startTime.getDate() - entry.daysAgo);
    startTime.setHours(entry.startHour, 0, 0, 0);

    const durationSec = Math.floor(entry.hours * 3600);
    const endTime = new Date(startTime.getTime() + durationSec * 1000);

    const rate = entry.task?.hourlyRate ?? entry.project.hourlyRate ?? user.defaultHourlyRate ?? 0;

    await prisma.timeEntry.create({
      data: {
        id: entry.id,
        description: entry.desc,
        startTime,
        endTime,
        duration: durationSec,
        isRunning: false,
        hourlyRateSnapshot: rate,
        userId: user.id,
        projectId: entry.project.id,
        taskId: entry.task?.id ?? null,
      },
    });
  }

  console.log(`Seeded: test@example.com / 123456`);
  console.log(`  3 projects, 6 tasks, ${entries.length} time entries`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
