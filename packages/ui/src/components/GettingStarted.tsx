import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { XMarkIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import { RootState } from "../store";
import { checklistDone, markChecklistDone, timesheetSent } from "../utils/onboarding";

/**
 * The four steps from sign-up to a first timesheet a client can open.
 * Shown until they're all done, or the user hides it.
 */
const GettingStarted: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  const { projects, loaded: projectsLoaded } = useSelector((state: RootState) => state.projects);
  const [counts, setCounts] = useState<{ keys: number; links: number } | null>(null);
  const [dismissed, setDismissed] = useState(() => checklistDone(user?.id));

  useEffect(() => {
    setDismissed(checklistDone(user?.id));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || dismissed) return;
    let live = true;
    Promise.all([api.apiKeys.list().catch(() => null), api.shareLinks.list().catch(() => null)]).then(
      ([keys, links]) => {
        // Unknown (a failed request) counts as not done.
        if (live) setCounts({ keys: keys?.length ?? 0, links: links?.length ?? 0 });
      }
    );
    return () => {
      live = false;
    };
  }, [user?.id, dismissed]);

  const steps =
    user && counts
      ? [
          {
            done: counts.keys > 0,
            label: "Connect Claude Code",
            detail: "Every agent session gets its own timer, without pressing play.",
            to: "/integrations",
          },
          {
            done: projects.length > 0,
            label: "Add a client project",
            detail: "Link it to a git repo and sessions land on the right client.",
            to: "/projects",
          },
          {
            done: (user.defaultHourlyRate ?? 0) > 0 || projects.some((p) => (p.hourlyRate ?? 0) > 0),
            label: "Set your rate",
            detail: "A default in Settings, or one per client.",
            to: "/settings",
          },
          {
            // A share link, or (on Free, which has none) a CSV or Markdown export.
            done: counts.links > 0 || timesheetSent(user.id),
            label: "Send a timesheet",
            detail: "A read-only link your client can open, or Markdown and CSV.",
            to: "/timesheet",
          },
        ]
      : null;
  const doneCount = steps ? steps.filter((s) => s.done).length : 0;
  const allDone = !!steps && projectsLoaded && doneCount === steps.length;

  // Finished for good: don't fetch its data on every visit.
  useEffect(() => {
    if (allDone) markChecklistDone(user?.id);
  }, [allDone, user?.id]);

  // Wait for every source, so a finished account never sees it flash.
  if (!user || !steps || !projectsLoaded || dismissed || allDone) return null;

  const dismiss = () => {
    markChecklistDone(user.id);
    setDismissed(true);
  };

  return (
    <section className="card p-5" aria-labelledby="getting-started-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="getting-started-title" className="text-base font-semibold text-gray-900">
            Get set up
          </h2>
          <p className="text-sm text-gray-600">
            {doneCount} of {steps.length} done
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="p-1 text-gray-400 hover:text-gray-600 rounded"
          aria-label="Hide the setup checklist"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step) => (
          <li key={step.label}>
            <Link
              to={step.to}
              className={`block h-full rounded-lg border p-3 transition-colors ${
                step.done ? "border-green-200 bg-green-50" : "border-gray-200 hover:border-primary-300 hover:bg-primary-50"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
                {step.done ? (
                  <CheckCircleIcon className="h-5 w-5 text-green-600" aria-hidden="true" />
                ) : (
                  <span className="h-5 w-5 rounded-full border-2 border-gray-300" aria-hidden="true" />
                )}
                <span className="sr-only">{step.done ? "Done: " : "To do: "}</span>
                {step.label}
              </span>
              <span className="mt-1 block text-xs text-gray-600">{step.detail}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
};

export default GettingStarted;
