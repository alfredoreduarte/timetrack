import type { Middleware } from "@reduxjs/toolkit";
import { logout } from "./slices/authSlice";

type ThunkMeta = { meta?: { requestId?: string; requestStatus?: string } };

/**
 * Drops the answer to a request that was sent before the last sign-out.
 * Signing out resets the store (see reducers.ts), but a request already in
 * flight still answers with the previous account's data, and its
 * fulfilled/rejected action would land in the fresh store.
 */
export const sessionGuard: Middleware = () => {
  let session = 0;
  const startedIn = new Map<string, number>();
  return (next) => (action) => {
    if (logout.match(action)) session++;
    const meta = (action as ThunkMeta).meta;
    if (meta?.requestId && meta.requestStatus) {
      if (meta.requestStatus === "pending") {
        startedIn.set(meta.requestId, session);
      } else {
        const started = startedIn.get(meta.requestId);
        startedIn.delete(meta.requestId);
        if (started !== undefined && started !== session) return action;
      }
    }
    return next(action);
  };
};
