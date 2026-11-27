import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { XMarkIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import { RootState } from "../store";

const dismissKey = (userId: string) => `gettingStarted.dismissed.${userId}`;

const readDismissed = (userId: string | undefined) => {
  if (!userId) return false;
  try {
    return localStorage.getItem(dismissKey(userId)) === "1";
  } catch {
    return false;
  }
};

/**
 * The four steps from sign-up to a first timesheet a client can open.
 * Shown until they're all done, or the user hides it.
 */
const GettingStarted: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  const projects = useSelector((state: RootState) => state.projects.projects);
  const [counts, setCounts] = useState<{ keys: number; links: number } | null>(null);
  const [dismissed, setDismissed] = useState(() => readDismissed(user?.id));

  useEffect(() => {
    setDismissed(readDismissed(user?.id));
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

  if (!user || dismissed || !counts) return null;

  const steps = [
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
      done: counts.links > 0,
      label: "Send a timesheet",
      detail: "A read-only link your client can open, or Markdown and CSV.",
      to: "/timesheet",
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(dismissKey(user.id), "1");
    } catch {
      // Hidden for this visit only.
    }
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
                  <CheckCircleIcon className="h-5 w-5 text-green-600" aria-label="Done" />
                ) : (
                  <span className="h-5 w-5 rounded-full border-2 border-gray-300" aria-hidden="true" />
                )}
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
