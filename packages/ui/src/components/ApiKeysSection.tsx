import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  ClipboardDocumentIcon,
  PlusIcon,
  TrashIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { toast } from "react-hot-toast";
import { AppDispatch, RootState } from "../store";
import {
  fetchApiKeys,
  createApiKey,
  revokeApiKey,
} from "../store/slices/apiKeysSlice";

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  return d.toLocaleString();
};

const ApiKeysSection: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { apiKeys, loading } = useSelector(
    (state: RootState) => state.apiKeys
  );

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchApiKeys());
  }, [dispatch]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      const result = await dispatch(
        createApiKey({
          name: name.trim(),
          expiresAt: expiresAt
            ? new Date(expiresAt).toISOString()
            : undefined,
        })
      ).unwrap();
      setNewToken(result.token);
      setShowCreateForm(false);
      setName("");
      setExpiresAt("");
      toast.success("API key created");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create API key";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (id: string, keyName: string) => {
    if (!window.confirm(`Revoke "${keyName}"? Any client using it will lose access immediately.`)) {
      return;
    }
    try {
      await dispatch(revokeApiKey(id)).unwrap();
      toast.success("API key revoked");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to revoke API key";
      toast.error(message);
    }
  };

  const copyToken = async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      toast.success("Token copied to clipboard");
    } catch {
      toast.error("Failed to copy — select and copy manually");
    }
  };

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">API Keys</h3>
          <p className="text-sm text-gray-500 mt-1">
            Tokens for programmatic access (CLI tools, AI agents, integrations).
            Time entries created with an API key are flagged for billing.
          </p>
        </div>
        {!showCreateForm && !newToken && (
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="btn-primary flex items-center gap-1 whitespace-nowrap"
          >
            <PlusIcon className="h-4 w-4" />
            New Key
          </button>
        )}
      </div>

      {newToken && (
        <div className="mb-6 p-4 border border-amber-300 bg-amber-50 rounded-md">
          <div className="flex gap-2 mb-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900 font-medium">
              Copy your token now. It will not be shown again.
            </p>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 px-3 py-2 bg-white border border-amber-300 rounded text-sm font-mono break-all">
              {newToken}
            </code>
            <button
              type="button"
              onClick={copyToken}
              className="btn-secondary flex items-center gap-1 whitespace-nowrap"
              title="Copy to clipboard"
            >
              <ClipboardDocumentIcon className="h-4 w-4" />
              Copy
            </button>
          </div>
          <button
            type="button"
            onClick={() => setNewToken(null)}
            className="mt-3 text-sm text-amber-900 underline hover:no-underline"
          >
            I've saved it — dismiss
          </button>
        </div>
      )}

      {showCreateForm && (
        <form onSubmit={handleCreate} className="mb-6 space-y-3 p-4 bg-gray-50 rounded-md">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field mt-1"
              placeholder="e.g. Claude Code, my-laptop"
              maxLength={100}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Expires (optional)
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="input-field mt-1"
              min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
            />
            <p className="mt-1 text-xs text-gray-500">
              Leave blank for a key that never expires.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating..." : "Create Key"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setName("");
                setExpiresAt("");
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading && apiKeys.length === 0 ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : apiKeys.length === 0 ? (
        <p className="text-sm text-gray-500 italic">
          No API keys yet. Create one to give a tool programmatic access.
        </p>
      ) : (
        <div className="divide-y divide-gray-200">
          {apiKeys.map((key) => {
            const expired =
              key.expiresAt && new Date(key.expiresAt) < new Date();
            return (
              <div
                key={key.id}
                className="py-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 truncate">
                      {key.name}
                    </span>
                    <code className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded font-mono">
                      {key.keyPrefix}…
                    </code>
                    {expired && (
                      <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">
                        expired
                      </span>
                    )}
                    {!key.isActive && !expired && (
                      <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded">
                        inactive
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-500 space-x-3">
                    <span>Created {formatDate(key.createdAt)}</span>
                    <span>
                      Last used{" "}
                      {key.lastUsedAt ? formatDate(key.lastUsedAt) : "never"}
                    </span>
                    {key.expiresAt && (
                      <span>Expires {formatDate(key.expiresAt)}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(key.id, key.name)}
                  className="text-red-600 hover:text-red-800 p-2"
                  title="Revoke"
                  aria-label={`Revoke API key ${key.name}`}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ApiKeysSection;
