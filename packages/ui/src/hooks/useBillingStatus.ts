import { useCallback, useEffect, useState } from "react";
import api from "../services/api";
import type { BillingStatus } from "../types/agent";

// One status shared by every component that shows the plan (the banner and
// the Billing page), so a refresh after checkout updates all of them.
let shared: { status: BillingStatus | null; error: string | null } = { status: null, error: null };
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;

async function refreshShared(): Promise<void> {
  if (!inFlight) {
    inFlight = (async () => {
      try {
        shared = { status: await api.billing.status(), error: null };
      } catch (e) {
        shared = { ...shared, error: e instanceof Error ? e.message : "Couldn't load your plan" };
      } finally {
        inFlight = null;
        listeners.forEach((l) => l());
      }
    })();
  }
  return inFlight;
}

/** Plan, trial and limits for the signed-in user (refresh after checkout). */
export function useBillingStatus() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    if (!shared.status) refreshShared();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const refresh = useCallback(() => refreshShared(), []);
  return { status: shared.status, error: shared.error, refresh };
}

export const trialDaysLeft = (status: BillingStatus | null) => {
  if (!status?.trialEndsAt) return null;
  const ms = new Date(status.trialEndsAt).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 86400_000) : 0;
};
