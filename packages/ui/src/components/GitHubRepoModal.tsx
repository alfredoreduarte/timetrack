import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { RootState, AppDispatch } from "../store";
import { fetchGitHubRepos } from "../store/slices/githubSlice";

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  description?: string;
  html_url: string;
  private: boolean;
  open_issues_count: number;
}

interface GitHubRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (repo: GitHubRepo) => void;
}

const GitHubRepoModal: React.FC<GitHubRepoModalProps> = ({
  isOpen,
  onClose,
  onSelect,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const { repos, loading } = useSelector((state: RootState) => state.github);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (isOpen) {
      dispatch(fetchGitHubRepos());
      setSearch("");
    }
  }, [isOpen, dispatch]);

  if (!isOpen) return null;

  const filtered = repos.filter(
    (repo) =>
      repo.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (repo.description || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-medium text-gray-900">
              Link GitHub Repository
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search repositories..."
            className="input-field w-full"
            autoFocus
          />
        </div>

        <div className="overflow-y-auto flex-1 p-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-sm text-gray-500">
                Loading repositories...
              </span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              {search ? "No matching repositories" : "No repositories found"}
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((repo) => (
                <button
                  key={repo.id}
                  onClick={() => onSelect(repo)}
                  className="w-full text-left p-3 rounded-md hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <svg
                        className="w-4 h-4 text-gray-400 flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 16 16"
                      >
                        <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z" />
                      </svg>
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {repo.full_name}
                      </span>
                      {repo.private && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded flex-shrink-0">
                          Private
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                      {repo.open_issues_count} issues
                    </span>
                  </div>
                  {repo.description && (
                    <p className="text-xs text-gray-500 mt-1 truncate pl-6">
                      {repo.description}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-gray-200">
          <button onClick={onClose} className="btn-secondary w-full">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default GitHubRepoModal;
