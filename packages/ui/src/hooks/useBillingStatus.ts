import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import api from "../services/api";
import type { RootState } from "../store";
import type { BillingStatus } from "../types/agent";

// One status shared by every component that shows the plan (the banner and
// the Billing page), so a refresh after checkout updates all of them. It
// belongs to one signed-in user: signing in as someone else in the same tab
// starts empty, and a response for the previous user is dropped.
let shared: { userId: string | null; status: BillingStatus | null; error: string | null } = {
  userId: null,
  status: null,
  error: null,
};
const listeners = new Set<() => void>();
let inFlight: { userId: string; promise: Promise<void> } | null = null;
const notify = () => listeners.forEach((l) => l());

function ownedBy(userId: string | null) {
  if (shared.userId !== userId) {
    shared = { userId, status: null, error: null };
    notify();
  }
}

function refreshShared(userId: string): Promise<void> {
  if (inFlight?.userId === userId) return inFlight.promise;
  const request = { userId, promise: Promise.resolve() };
  request.promise = (async () => {
    try {
      const status = await api.billing.status();
      if (shared.userId === userId) shared = { userId, status, error: null };
    } catch (e) {
      if (shared.userId === userId) {
        shared = { ...shared, error: e instanceof Error ? e.message : "Couldn't load your plan" };
      }
    } finally {
      if (inFlight === request) inFlight = null;
      notify();
    }
  })();
  inFlight = request;
  return request.promise;
}

/**
 * Plan, trial and limits for the signed-in user. `fresh` refetches on mount
 * (the Billing page), showing the last known status meanwhile.
 */
export function useBillingStatus({ fresh = false }: { fresh?: boolean } = {}) {
  const userId = useSelector((s: RootState) => s.auth.user?.id ?? null);
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  useEffect(() => {
    ownedBy(userId); // signed out: forget the last user's plan
    if (userId && (fresh || !shared.status)) refreshShared(userId);
  }, [userId, fresh]);
  const refresh = useCallback(() => (userId ? refreshShared(userId) : Promise.resolve()), [userId]);
  const mine = userId !== null && shared.userId === userId;
  return { status: mine ? shared.status : null, error: mine ? shared.error : null, refresh };
}

export const trialDaysLeft = (status: BillingStatus | null) => {
  if (!status?.trialEndsAt) return null;
  const ms = new Date(status.trialEndsAt).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 86400_000) : 0;
};
