import express from "express";
import { z } from "zod";
import { prisma } from "../utils/database";
import { asyncHandler, createError } from "../middleware/errorHandler";
import { authenticate, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Validation schemas
const reportQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  projectId: z.string().optional(),
  taskId: z.string().optional(),
});

/**
 * @swagger
 * /api/reports/summary:
 *   get:
 *     summary: Get time tracking summary report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for the report
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for the report
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *         description: Filter by project ID
 *     responses:
 *       200:
 *         description: Summary report retrieved successfully
 */
router.get(
  "/summary",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { startDate, endDate, projectId } = reportQuerySchema.parse(
      req.query
    );

    const where: any = {
      userId: req.user!.id,
      isRunning: false,
    };

    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) {
        where.startTime.gte = new Date(startDate);
      }
      if (endDate) {
        where.startTime.lte = new Date(endDate);
      }
    }

    if (projectId) {
      where.projectId = projectId;
    }

    // Get time entries with aggregations
    const timeEntries = await prisma.timeEntry.findMany({
      where,
      select: {
        id: true,
        duration: true,
        hourlyRateSnapshot: true,
        startTime: true,
        endTime: true,
        project: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        task: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Calculate totals
    const totalDuration = timeEntries.reduce(
      (sum: number, entry: any) => sum + (entry.duration || 0),
      0
    );
    const totalEarnings = timeEntries.reduce((sum: number, entry: any) => {
      const rate = entry.hourlyRateSnapshot || 0;
      const hours = (entry.duration || 0) / 3600;
      return sum + rate * hours;
    }, 0);

    // Group by project
    const projectSummary = timeEntries.reduce((acc: any, entry: any) => {
      const projectId = entry.project?.id || "no-project";
      const projectName = entry.project?.name || "No Project";

      if (!acc[projectId]) {
        acc[projectId] = {
          projectId,
          projectName,
          color: entry.project?.color || "#6B7280",
          totalDuration: 0,
          totalEarnings: 0,
          entryCount: 0,
        };
      }

      acc[projectId].totalDuration += entry.duration || 0;
      acc[projectId].totalEarnings +=
        (entry.hourlyRateSnapshot || 0) * ((entry.duration || 0) / 3600);
      acc[projectId].entryCount += 1;

      return acc;
    }, {} as Record<string, any>);

    // Group by date
    const dailySummary = timeEntries.reduce((acc: any, entry: any) => {
      const date = entry.startTime.toISOString().split("T")[0];

      if (!acc[date]) {
        acc[date] = {
          date,
          totalDuration: 0,
          totalEarnings: 0,
          entryCount: 0,
        };
      }

      acc[date].totalDuration += entry.duration || 0;
      acc[date].totalEarnings +=
        (entry.hourlyRateSnapshot || 0) * ((entry.duration || 0) / 3600);
      acc[date].entryCount += 1;

      return acc;
    }, {} as Record<string, any>);

    res.json({
      summary: {
        totalDuration, // in seconds
        totalEarnings,
        entryCount: timeEntries.length,
        averageSessionDuration:
          timeEntries.length > 0 ? totalDuration / timeEntries.length : 0,
        projectBreakdown: Object.values(projectSummary),
        dailyBreakdown: Object.values(dailySummary).sort((a: any, b: any) =>
          a.date.localeCompare(b.date)
        ),
      },
    });
  })
);

/**
 * @swagger
 * /api/reports/detailed:
 *   get:
 *     summary: Get detailed time tracking report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *       - in: query
 *         name: taskId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Detailed report retrieved successfully
 */
router.get(
  "/detailed",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { startDate, endDate, projectId, taskId } = reportQuerySchema.parse(
      req.query
    );

    const where: any = {
      userId: req.user!.id,
      isRunning: false,
    };

    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) {
        where.startTime.gte = new Date(startDate);
      }
      if (endDate) {
        where.startTime.lte = new Date(endDate);
      }
    }

    if (projectId) {
      where.projectId = projectId;
    }

    if (taskId) {
      where.taskId = taskId;
    }

    const timeEntries = await prisma.timeEntry.findMany({
      where,
      select: {
        id: true,
        description: true,
        startTime: true,
        endTime: true,
        duration: true,
        hourlyRateSnapshot: true,
        createdAt: true,
        project: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        task: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        startTime: "desc",
      },
    });

    // Calculate earnings for each entry
    const entriesWithEarnings = timeEntries.map((entry: any) => ({
      ...entry,
      earnings:
        (entry.hourlyRateSnapshot || 0) * ((entry.duration || 0) / 3600),
    }));

    res.json({
      timeEntries: entriesWithEarnings,
      totalEntries: timeEntries.length,
    });
  })
);

/**
 * @swagger
 * /api/reports/earnings:
 *   get:
 *     summary: Get earnings report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Earnings report retrieved successfully
 */
router.get(
  "/earnings",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { startDate, endDate, projectId } = reportQuerySchema.parse(
      req.query
    );

    const where: any = {
      userId: req.user!.id,
      isRunning: false,
      hourlyRateSnapshot: {
        not: null,
      },
    };

    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) {
        where.startTime.gte = new Date(startDate);
      }
      if (endDate) {
        where.startTime.lte = new Date(endDate);
      }
    }

    if (projectId) {
      where.projectId = projectId;
    }

    const timeEntries = await prisma.timeEntry.findMany({
      where,
      select: {
        duration: true,
        hourlyRateSnapshot: true,
        startTime: true,
        project: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
    });

    // Calculate total earnings
    const totalEarnings = timeEntries.reduce((sum: number, entry: any) => {
      const rate = entry.hourlyRateSnapshot || 0;
      const hours = (entry.duration || 0) / 3600;
      return sum + rate * hours;
    }, 0);

    const totalHours = timeEntries.reduce(
      (sum: number, entry: any) => sum + (entry.duration || 0) / 3600,
      0
    );

    // Group by project for earnings breakdown
    const projectEarnings = timeEntries.reduce((acc: any, entry: any) => {
      const projectId = entry.project?.id || "no-project";
      const projectName = entry.project?.name || "No Project";

      if (!acc[projectId]) {
        acc[projectId] = {
          projectId,
          projectName,
          color: entry.project?.color || "#6B7280",
          totalEarnings: 0,
          totalHours: 0,
          averageRate: 0,
        };
      }

      const rate = entry.hourlyRateSnapshot || 0;
      const hours = (entry.duration || 0) / 3600;

      acc[projectId].totalEarnings += rate * hours;
      acc[projectId].totalHours += hours;

      return acc;
    }, {} as Record<string, any>);

    // Calculate average rates
    Object.values(projectEarnings).forEach((project: any) => {
      project.averageRate =
        project.totalHours > 0 ? project.totalEarnings / project.totalHours : 0;
    });

    // Group by month for trend analysis
    const monthlyEarnings = timeEntries.reduce((acc: any, entry: any) => {
      const month = entry.startTime.toISOString().substring(0, 7); // YYYY-MM

      if (!acc[month]) {
        acc[month] = {
          month,
          totalEarnings: 0,
          totalHours: 0,
        };
      }

      const rate = entry.hourlyRateSnapshot || 0;
      const hours = (entry.duration || 0) / 3600;

      acc[month].totalEarnings += rate * hours;
      acc[month].totalHours += hours;

      return acc;
    }, {} as Record<string, any>);

    res.json({
      earnings: {
        totalEarnings,
        totalHours,
        averageHourlyRate: totalHours > 0 ? totalEarnings / totalHours : 0,
        projectBreakdown: Object.values(projectEarnings),
        monthlyTrend: Object.values(monthlyEarnings).sort((a: any, b: any) =>
          a.month.localeCompare(b.month)
        ),
      },
    });
  })
);

/**
 * @swagger
 * /api/reports/export:
 *   get:
 *     summary: Export time tracking data as CSV
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: CSV data
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 */
router.get(
  "/export",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { startDate, endDate, projectId } = reportQuerySchema.parse(
      req.query
    );

    const where: any = {
      userId: req.user!.id,
      isRunning: false,
    };

    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) {
        where.startTime.gte = new Date(startDate);
      }
      if (endDate) {
        where.startTime.lte = new Date(endDate);
      }
    }

    if (projectId) {
      where.projectId = projectId;
    }

    const timeEntries = await prisma.timeEntry.findMany({
      where,
      select: {
        description: true,
        startTime: true,
        endTime: true,
        duration: true,
        hourlyRateSnapshot: true,
        project: {
          select: {
            name: true,
          },
        },
        task: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        startTime: "asc",
      },
    });

    // Generate CSV
    const csvHeaders = [
      "Date",
      "Start Time",
      "End Time",
      "Duration (hours)",
      "Description",
      "Project",
      "Task",
      "Hourly Rate",
      "Earnings",
    ];

    const csvRows = timeEntries.map((entry: any) => {
      const duration = (entry.duration || 0) / 3600;
      const earnings = (entry.hourlyRateSnapshot || 0) * duration;

      return [
        entry.startTime.toISOString().split("T")[0],
        entry.startTime.toISOString().split("T")[1].split(".")[0],
        entry.endTime?.toISOString().split("T")[1].split(".")[0] || "",
        duration.toFixed(2),
        entry.description || "",
        entry.project?.name || "",
        entry.task?.name || "",
        entry.hourlyRateSnapshot?.toFixed(2) || "0.00",
        earnings.toFixed(2),
      ];
    });

    const csvContent = [csvHeaders, ...csvRows]
      .map((row: any) => row.map((field: any) => `"${field}"`).join(","))
      .join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="timetrack-export.csv"'
    );
    res.send(csvContent);
  })
);

export default router;
