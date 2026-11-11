import React, { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import api from "../services/api";
import type { Project } from "../store/slices/projectsSlice";

const errorText = (e: unknown) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error || "Couldn't save";

/** Linked repositories and this client's billing policy for AI work. */
const ProjectAgentSettings: React.FC<{ project: Project; onSaved?: (p: Project) => void }> = ({ project, onSaved }) => {
  const [repos, setRepos] = useState("");
  const [overlap, setOverlap] = useState<"" | "dedupe" | "sum">("");
  const [multiplier, setMultiplier] = useState("");
  const [agentRate, setAgentRate] = useState("");
  const [includeCosts, setIncludeCosts] = useState(false);
  const [markup, setMarkup] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.projects.getProject(project.id).then(
      (p: Project) => {
        setRepos((p.repoPatterns ?? []).join("\n"));
        setOverlap(p.overlapMode ?? "");
        setMultiplier(p.aiMultiplier != null ? String(p.aiMultiplier) : "");
        setAgentRate(p.agentHourlyRate != null ? String(p.agentHourlyRate) : "");
        setIncludeCosts(Boolean(p.includeAiCosts));
        setMarkup(String(p.aiCostMarkupPercent ?? 0));
      },
      () => undefined
    );
  }, [project.id]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.projects.updateProject(project.id, {
        repoPatterns: repos.split("\n").map((r) => r.trim()).filter(Boolean),
        overlapMode: overlap || null,
        aiMultiplier: multiplier === "" ? null : parseFloat(multiplier),
        agentHourlyRate: agentRate === "" ? null : parseFloat(agentRate),
        includeAiCosts: includeCosts,
        aiCostMarkupPercent: parseFloat(markup || "0"),
      } as Partial<Project>);
      toast.success("Saved");
      onSaved?.(updated as Project);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="card">
      <summary className="px-6 py-4 cursor-pointer font-medium text-gray-900">Repositories & AI billing</summary>
      <form onSubmit={save} className="px-6 pb-6 space-y-5">
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

        <button type="submit" className="btn-primary disabled:opacity-50" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
    </details>
  );
};

export default ProjectAgentSettings;
