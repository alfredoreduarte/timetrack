import React, { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import api from "../services/api";
import type { Project } from "../store/slices/projectsSlice";

const errorText = (e: unknown) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error || "Couldn't save";

/** The form's values for a project as the server has it. */
const valuesFrom = (p: Project) => ({
  repos: (p.repoPatterns ?? []).join("\n"),
  overlap: (p.overlapMode ?? "") as "" | "dedupe" | "sum",
  multiplier: p.aiMultiplier != null ? String(p.aiMultiplier) : "",
  agentRate: p.agentHourlyRate != null ? String(p.agentHourlyRate) : "",
  includeCosts: Boolean(p.includeAiCosts),
  markup: String(p.aiCostMarkupPercent ?? 0),
});

/** Linked repositories and this client's billing policy for AI work. */
const ProjectAgentSettings: React.FC<{ project: Project; onSaved?: (p: Project) => void }> = ({ project, onSaved }) => {
  const [repos, setRepos] = useState("");
  const [overlap, setOverlap] = useState<"" | "dedupe" | "sum">("");
  const [multiplier, setMultiplier] = useState("");
  const [agentRate, setAgentRate] = useState("");
  const [includeCosts, setIncludeCosts] = useState(false);
  const [markup, setMarkup] = useState("0");
  const [saving, setSaving] = useState(false);
  // The form must not be saved before the real values loaded (blanks would
  // wipe the linked repos and the policy), and it sends only what the user
  // changed: the server adds repos while the form is open (assigning an
  // agent's timer here learns its repo), and a stale copy must not undo that.
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  const loaded = useRef<ReturnType<typeof valuesFrom> | null>(null);
  const show = (v: ReturnType<typeof valuesFrom>) => {
    loaded.current = v;
    setRepos(v.repos);
    setOverlap(v.overlap);
    setMultiplier(v.multiplier);
    setAgentRate(v.agentRate);
    setIncludeCosts(v.includeCosts);
    setMarkup(v.markup);
  };

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    api.projects.getProject(project.id).then(
      (p: Project) => {
        if (!alive) return;
        show(valuesFrom(p));
        setStatus("loaded");
      },
      () => alive && setStatus("failed")
    );
    return () => {
      alive = false;
    };
  }, [project.id, attempt]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status !== "loaded") return;
    const was = loaded.current;
    if (!was) return;
    const changes: Partial<Project> = {};
    if (repos !== was.repos) changes.repoPatterns = repos.split("\n").map((r) => r.trim()).filter(Boolean);
    if (overlap !== was.overlap) changes.overlapMode = overlap || null;
    if (multiplier !== was.multiplier) changes.aiMultiplier = multiplier === "" ? null : parseFloat(multiplier);
    if (agentRate !== was.agentRate) changes.agentHourlyRate = agentRate === "" ? null : parseFloat(agentRate);
    if (includeCosts !== was.includeCosts) changes.includeAiCosts = includeCosts;
    if (markup !== was.markup) changes.aiCostMarkupPercent = parseFloat(markup || "0");
    if (Object.keys(changes).length === 0) {
      toast.success("Nothing to save");
      return;
    }
    setSaving(true);
    try {
      const updated = (await api.projects.updateProject(project.id, changes)) as Project;
      // The saved project is the new baseline (incl. repos the server added).
      show(valuesFrom(updated));
      toast.success("Saved");
      onSaved?.(updated);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="card">
      <summary className="px-6 py-4 cursor-pointer font-medium text-gray-900">Repositories & AI billing</summary>
      {status === "failed" && (
        <p className="px-6 pb-3 text-sm text-red-700" role="alert">
          Couldn't load these settings.{" "}
          <button type="button" className="underline" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </p>
      )}
      {status === "loading" && <p className="px-6 pb-3 text-sm text-gray-500">Loading…</p>}
      <form onSubmit={save} className="px-6 pb-6 space-y-5" aria-busy={status === "loading"}>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700">Linked repositories</span>
          <textarea
            className="input-field mt-1 font-mono text-xs"
            rows={3}
            value={repos}
            onChange={(e) => setRepos(e.target.value)}
            placeholder={"github.com/acme/web\n/Users/me/code/acme"}
          />
          <span className="mt-1 block text-xs text-gray-500">
            One per line: a git remote or a folder. Agent sessions in these repositories are billed to this project automatically.
            Assigning an agent's timer to this project adds its repository here.
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700">Parallel agents</span>
            <select className="input-field mt-1" value={overlap} onChange={(e) => setOverlap(e.target.value as typeof overlap)}>
              <option value="">Account default</option>
              <option value="dedupe">Bill the overlap once</option>
              <option value="sum">Bill every agent in full</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-gray-700">AI time multiplier</span>
            <input className="input-field mt-1" type="number" step="0.1" min={0} max={20} value={multiplier} onChange={(e) => setMultiplier(e.target.value)} placeholder="Account default" />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-gray-700">Flat agent rate (per hour)</span>
            <input className="input-field mt-1" type="number" step="0.01" min={0} value={agentRate} onChange={(e) => setAgentRate(e.target.value)} placeholder="Off" />
            <span className="mt-1 block text-xs text-gray-500">Overrides rate × multiplier for AI time.</span>
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" checked={includeCosts} onChange={(e) => setIncludeCosts(e.target.checked)} />
              Pass AI usage costs through
            </label>
            {includeCosts && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                Handling fee
                <input className="input-field w-20" type="number" min={0} max={100} value={markup} onChange={(e) => setMarkup(e.target.value)} />%
              </label>
            )}
          </div>
        </div>

        <button type="submit" className="btn-primary disabled:opacity-50" disabled={saving || status !== "loaded"}>
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </details>
  );
};

export default ProjectAgentSettings;
