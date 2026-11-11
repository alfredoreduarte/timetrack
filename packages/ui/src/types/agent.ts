// Types for the AI-first API surface (timers, timesheets, billing, share
// links). Timer/AuditEvent shapes come from @timetrack/shared.
export type { Timer, TimerNote, AuditEvent, TimerStatus } from "@timetrack/shared";

export interface TimesheetLine {
  date: string;
  description: string;
  kind: "agent" | "human";
  agent: string | null;
  task: string | null;
  timerId: string | null;
  trackedSeconds: number;
  billedSeconds: number;
  rate: number;
  amount: number;
  notes: string[];
}

export interface CostLine {
  timerId: string;
  date: string;
  description: string;
  costUsd: number;
  billedUsd: number;
}

export interface BillingPolicy {
  overlapMode: "dedupe" | "sum";
  aiMultiplier: number;
  agentHourlyRate: number | null;
  includeAiCosts: boolean;
  aiCostMarkupPercent: number;
}

export interface ProjectTimesheet {
  project: { id: string; name: string; color: string } | null;
  /** Client views without amounts keep only the overlap rule. */
  policy: BillingPolicy | Pick<BillingPolicy, "overlapMode">;
  hourlyRate: number | null;
  totals: {
    trackedSeconds: number;
    wallClockSeconds: number;
    billedSeconds: number;
    agentTrackedSeconds: number;
    humanTrackedSeconds: number;
    billedAgentSeconds: number;
    billedHumanSeconds: number;
    parallelism: number;
    timeAmount: number;
    /** AI usage billed in the sheet's currency (0 when it isn't USD). */
    costsAmount: number;
    /** AI usage billed in USD, included in `amount` only when costsIncluded. */
    costsBilledUsd: number;
    costsIncluded: boolean;
    amount: number;
  };
  lines: TimesheetLine[];
  costs: CostLine[];
  disclosure: string[];
}

export interface Timesheet {
  generatedAt: string;
  limitedByPlan: { historyDays: number; requestedStartDate: string } | null;
  range: { startDate: string; endDate: string; timezone: string };
  currency: string;
  user: { name: string };
  pricingAsOf: string;
  totals: { trackedSeconds: number; wallClockSeconds: number; billedSeconds: number; amount: number };
  projects: ProjectTimesheet[];
}

export interface ShareLink {
  id: string;
  name: string | null;
  tokenPrefix: string;
  project: { id: string; name: string } | null;
  startDate: string | null;
  endDate: string | null;
  rollingDays: number | null;
  timezone: string;
  showAmounts: boolean;
  showNotes: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  createdAt: string;
}

export interface PlanLimits {
  maxRunningAgentTimers: number | null;
  historyDays: number | null;
  shareLinks: boolean;
  aiCostLines: boolean;
}

export interface BillingStatus {
  billingEnabled: boolean;
  plan: "free" | "pro";
  reason: "billing_disabled" | "grandfathered" | "subscription" | "trial" | "free";
  trialEndsAt: string | null;
  limits: PlanLimits;
  usage: { runningAgentTimers: number };
  subscription: {
    status: string;
    interval: "month" | "year" | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  canManage: boolean;
  prices: { month: { amount: number; currency: string }; year: { amount: number; currency: string } };
}

export interface PublicTimesheetView {
  link: { name: string | null; expiresAt: string | null; showAmounts: boolean };
  timesheet: Timesheet;
}
