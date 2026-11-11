import { useCallback, useEffect, useState } from "react";
import api from "../services/api";
import type { BillingStatus } from "../types/agent";

/** Plan, trial and limits for the signed-in user (refetch after checkout). */
export function useBillingStatus() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setStatus(await api.billing.status());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your plan");
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { status, error, refresh };
}

export const trialDaysLeft = (status: BillingStatus | null) => {
  if (!status?.trialEndsAt) return null;
  const ms = new Date(status.trialEndsAt).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 86400_000) : 0;
};
