import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { PauseIcon, PlayIcon, StopIcon, SparklesIcon, ChatBubbleLeftEllipsisIcon } from "@heroicons/react/24/solid";
import { AppDispatch, RootState } from "../store";
import {
  assignTimer,
  BoardTimer,
  clearTimersError,
  fetchActiveTimers,
  timerAction,
} from "../store/slices/timersSlice";
import { fetchDashboardEarnings } from "../store/slices/dashboardSlice";
import { agentLabel, clock, repoLabel } from "../utils/agentFormat";

const liveSeconds = (t: BoardTimer, now: number) =>
  t.status === "running" ? t.trackedSeconds + Math.max(0, (now - t.receivedAt) / 1000) : t.trackedSeconds;

const statusLine = (t: BoardTimer) => {
  if (t.status === "running") return null;
  if (t.pauseReason === "idle") {
    const since = new Date(t.lastActivityAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `Paused automatically — no activity since ${since}`;
  }
  if (t.pauseReason === "agent") return "Paused by the agent — resumes when it continues";
  return "Paused";
};

/**
 * Every active timer — usually one per AI agent session, plus anything you
 * started by hand. Agents' timers appear and pause on their own via hooks;
 * you can pause, resume, stop or assign them here.
 */
const TimersBoard: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { items, loaded, error, busy } = useSelector((s: RootState) => s.timers);
  const projects = useSelector((s: RootState) => s.projects.projects);
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchActiveTimers());
  }, [dispatch]);

  const anyRunning = items.some((t) => t.status === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyRunning]);

  const act = async (id: string, action: "pause" | "resume" | "stop") => {
    await dispatch(timerAction({ id, action }));
    dispatch(fetchDashboardEarnings());
  };

  const assign = async (t: BoardTimer, projectId: string) => {
    const r = await dispatch(assignTimer({ id: t.id, projectId: projectId || null }));
    if (assignTimer.fulfilled.match(r) && r.payload.learnedRepoPattern) {
      const name = (Array.isArray(projects) ? projects : []).find((p) => p.id === projectId)?.name ?? "this project";
      setNotice(`Future sessions in ${r.payload.learnedRepoPattern} will go to ${name} automatically.`);
    }
  };

  const running = items.filter((t) => t.status === "running").length;
  const paused = items.length - running;
  const activeProjects = (Array.isArray(projects) ? projects : []).filter((p) => p.isActive !== false);

  return (
    <section className="card overflow-hidden" aria-labelledby="timers-board-title">
      <div className="px-6 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
        <h3 id="timers-board-title" className="text-sm font-medium text-gray-900">
          Timers{" "}
          {items.length > 0 && (
            <span className="ml-2 text-gray-500 font-normal">
              {running} running{paused > 0 ? ` · ${paused} paused` : ""}
            </span>
          )}
        </h3>
        <Link to="/integrations" className="text-sm text-primary-600 hover:text-primary-700">
          Track your agents automatically →
        </Link>
      </div>

      {error && (
        <div className="px-6 py-2 bg-red-50 text-sm text-red-700 flex justify-between gap-4" role="alert">
          <span>{error}</span>
          <button className="underline" onClick={() => dispatch(clearTimersError())}>
            Dismiss
          </button>
        </div>
      )}
      {notice && (
        <div className="px-6 py-2 bg-emerald-50 text-sm text-emerald-800 flex justify-between gap-4" role="status">
          <span>{notice}</span>
          <button className="underline" onClick={() => setNotice(null)}>
            OK
          </button>
        </div>
      )}

      {loaded && items.length === 0 ? (
        <p className="px-6 py-5 text-sm text-gray-600">
          Nothing running. Start a timer above, or{" "}
          <Link to="/integrations" className="text-primary-600 underline">
            connect Claude Code
          </Link>{" "}
          so every agent session is tracked without you pressing play.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100" aria-live="polite">
          {items.map((t) => {
            const repo = repoLabel(t.gitRemote, t.cwd);
            // Auto-generated descriptions already name the repo and branch.
            const describesRepo = Boolean(repo && t.description?.includes(repo));
            const isBusy = busy.includes(t.id);
            const line = statusLine(t);
            return (
              <li key={t.id} className="px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${
                      t.status === "running" ? "bg-green-500 animate-pulse" : "bg-amber-400"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{t.description || "Untitled timer"}</p>
                    <p className="text-xs text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {t.isAiGenerated && (
                        <span className="inline-flex items-center gap-1 text-violet-700">
                          <SparklesIcon className="h-3 w-3" aria-hidden="true" />
                          {agentLabel(t.agent, t.createdVia, t.isAiGenerated)}
                        </span>
                      )}
                      {repo && !describesRepo && <span>{repo}</span>}
                      {t.gitBranch && !describesRepo && <span className="font-mono">{t.gitBranch}</span>}
                      {t.noteCount > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <ChatBubbleLeftEllipsisIcon className="h-3 w-3" aria-hidden="true" />
                          {t.noteCount}
                        </span>
                      )}
                      {line && <span className={t.pauseReason === "manual" ? "" : "text-amber-700"}>{line}</span>}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:justify-end">
                  {t.project ? (
                    <span
                      className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700 max-w-[10rem] truncate"
                      title={t.project.name}
                    >
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.project.color }} />
                      {t.project.name}
                    </span>
                  ) : (
                    <label className="sr-only" htmlFor={`assign-${t.id}`}>
                      Assign a project
                    </label>
                  )}
                  {!t.project && (
                    <select
                      id={`assign-${t.id}`}
                      className="text-xs border border-amber-300 bg-amber-50 rounded-md py-1 pl-2 pr-6"
                      defaultValue=""
                      onChange={(e) => assign(t, e.target.value)}
                    >
                      <option value="" disabled>
                        Assign project…
                      </option>
                      {activeProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <span className="font-mono tabular-nums text-sm text-gray-900 w-20 text-right">
                    {clock(liveSeconds(t, now))}
                  </span>
                  {t.status === "running" ? (
                    <button
                      className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                      onClick={() => act(t.id, "pause")}
                      disabled={isBusy}
                      aria-label={`Pause ${t.description || "timer"}`}
                      title="Pause"
                    >
                      <PauseIcon className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      className="p-1.5 rounded-md text-green-700 hover:bg-green-50 disabled:opacity-40"
                      onClick={() => act(t.id, "resume")}
                      disabled={isBusy}
                      aria-label={`Resume ${t.description || "timer"}`}
                      title="Resume"
                    >
                      <PlayIcon className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    className="p-1.5 rounded-md text-red-600 hover:bg-red-50 disabled:opacity-40"
                    onClick={() => act(t.id, "stop")}
                    disabled={isBusy}
                    aria-label={`Stop ${t.description || "timer"}`}
                    title="Stop"
                  >
                    <StopIcon className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default TimersBoard;
