import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import api from "../../services/api";
import type { Timer } from "../../types/agent";

/**
 * Active timers (running + paused) — one per agent session or task. The
 * server pushes full Timer views over the socket (timer-started/-paused/
 * -resumed/-stopped/-updated), so the board stays live without polling.
 */
/** A timer plus the client time it arrived, so live elapsed time is skew-free. */
export type BoardTimer = Timer & { receivedAt: number };

interface TimersState {
  items: BoardTimer[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /** Timer ids with an action in flight (disables their buttons). */
  busy: string[];
}

const initialState: TimersState = { items: [], loading: false, loaded: false, error: null, busy: [] };

const message = (e: unknown) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
  (e instanceof Error ? e.message : "Something went wrong");

const stamp = (t: Timer): BoardTimer => ({ ...t, receivedAt: Date.now() });

export const fetchActiveTimers = createAsyncThunk("timers/fetchActive", async (_, { rejectWithValue }) => {
  try {
    return (await api.timers.list("active")).map(stamp);
  } catch (e) {
    return rejectWithValue(message(e));
  }
});

type Action = "pause" | "resume" | "stop";
export const timerAction = createAsyncThunk(
  "timers/action",
  async ({ id, action }: { id: string; action: Action }, { rejectWithValue }) => {
    try {
      return stamp((await api.timers[action](id)).timer);
    } catch (e) {
      return rejectWithValue(message(e));
    }
  }
);

export const assignTimer = createAsyncThunk(
  "timers/assign",
  async (
    { id, projectId, description }: { id: string; projectId?: string | null; description?: string | null },
    { rejectWithValue }
  ) => {
    try {
      const r = await api.timers.update(id, { projectId, description });
      return { timer: stamp(r.timer), learnedRepoPattern: r.learnedRepoPattern ?? null };
    } catch (e) {
      return rejectWithValue(message(e));
    }
  }
);

const upsert = (state: TimersState, timer: BoardTimer) => {
  const i = state.items.findIndex((t) => t.id === timer.id);
  const active = timer.status === "running" || timer.status === "paused";
  if (i >= 0) {
    if (active) state.items[i] = timer;
    else state.items.splice(i, 1);
  } else if (active) {
    state.items.unshift(timer);
  }
};

const timersSlice = createSlice({
  name: "timers",
  initialState,
  reducers: {
    timerFromSocket: {
      reducer(state, action: PayloadAction<BoardTimer>) {
        upsert(state, action.payload);
      },
      prepare(timer: Timer) {
        return { payload: stamp(timer) };
      },
    },
    noteAddedFromSocket(state, action: PayloadAction<string>) {
      const timer = state.items.find((t) => t.id === action.payload);
      if (timer) timer.noteCount += 1;
    },
    clearTimersError(state) {
      state.error = null;
    },
  },
  extraReducers: (b) => {
    b.addCase(fetchActiveTimers.pending, (s) => {
      s.loading = true;
    })
      .addCase(fetchActiveTimers.fulfilled, (s, a) => {
        s.loading = false;
        s.loaded = true;
        s.items = a.payload;
      })
      .addCase(fetchActiveTimers.rejected, (s, a) => {
        s.loading = false;
        s.error = (a.payload as string) || "Couldn't load timers";
      })
      .addCase(timerAction.pending, (s, a) => {
        s.busy.push(a.meta.arg.id);
      })
      .addCase(timerAction.fulfilled, (s, a) => {
        s.busy = s.busy.filter((id) => id !== a.meta.arg.id);
        upsert(s, a.payload);
      })
      .addCase(timerAction.rejected, (s, a) => {
        s.busy = s.busy.filter((id) => id !== a.meta.arg.id);
        s.error = (a.payload as string) || "Couldn't update the timer";
      })
      .addCase(assignTimer.fulfilled, (s, a) => {
        upsert(s, a.payload.timer);
      })
      .addCase(assignTimer.rejected, (s, a) => {
        s.error = (a.payload as string) || "Couldn't assign the timer";
      });
  },
});

export const { timerFromSocket, noteAddedFromSocket, clearTimersError } = timersSlice.actions;
export default timersSlice.reducer;
