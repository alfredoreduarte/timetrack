import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import api from "../services/api";
import type { RootState } from "../store";
import type { BillingStatus } from "../types/agent";

// One status shared by every component that shows the plan (the banner and
// the Billing page), so a refresh after checkout updates all of them. It
// belongs to one sign-in (user and token): every sign-in, even back into the
// same account, starts empty, and a response for an earlier one is dropped.
let shared: { owner: string | null; status: BillingStatus | null; error: string | null } = {
  owner: null,
  status: null,
  error: null,
};
const listeners = new Set<() => void>();
let inFlight: { owner: string; promise: Promise<void> } | null = null;
const notify = () => listeners.forEach((l) => l());

function ownedBy(owner: string | null) {
  if (shared.owner !== owner) {
    shared = { owner, status: null, error: null };
    notify();
  }
}

function refreshShared(owner: string): Promise<void> {
  if (inFlight?.owner === owner) return inFlight.promise;
  const request = { owner, promise: Promise.resolve() };
  request.promise = (async () => {
    try {
      const status = await api.billing.status();
      if (shared.owner === owner) shared = { owner, status, error: null };
    } catch (e) {
      if (shared.owner === owner) {
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
  const owner = useSelector((s: RootState) => (s.auth.user ? `${s.auth.user.id}:${s.auth.token ?? ""}` : null));
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  useEffect(() => {
    if (!owner) return;
    ownedBy(owner);
    if (fresh || !shared.status) refreshShared(owner);
  }, [owner, fresh]);
  const refresh = useCallback(() => (owner ? refreshShared(owner) : Promise.resolve()), [owner]);
  const mine = owner !== null && shared.owner === owner;
  return { status: mine ? shared.status : null, error: mine ? shared.error : null, refresh };
}

export const trialDaysLeft = (status: BillingStatus | null) => {
  if (!status?.trialEndsAt) return null;
  const ms = new Date(status.trialEndsAt).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 86400_000) : 0;
};
