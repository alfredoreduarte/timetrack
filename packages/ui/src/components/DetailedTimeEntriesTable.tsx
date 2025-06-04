import React from "react";
import { DetailedTimeEntry } from "../store/slices/reportsSlice";

interface DetailedTimeEntriesTableProps {
  entries: DetailedTimeEntry[];
  loading: boolean;
}

interface GroupedEntry {
  date: string;
  projects: {
    [projectId: string]: {
      projectName: string;
      projectColor: string;
      entries: DetailedTimeEntry[];
      totalDuration: number;
      totalEarnings: number;
    };
  };
}

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h${minutes.toString().padStart(2, "0")}m`;
};

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
};

const DetailedTimeEntriesTable: React.FC<DetailedTimeEntriesTableProps> = ({
  entries,
  loading,
}) => {
  // State to track which project groups are expanded
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(
    new Set()
  );

  // State to track which specific copy button was clicked
  const [copiedProjectKey, setCopiedProjectKey] = React.useState<string | null>(
    null
  );

  // Function to copy to clipboard with project-specific feedback
  const copyToClipboard = async (text: string, projectKey: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedProjectKey(projectKey);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      try {
        document.execCommand("copy");
        setCopiedProjectKey(projectKey);
      } catch (err) {
        console.error("Failed to copy text: ", err);
        setCopiedProjectKey(null);
      } finally {
        document.body.removeChild(textArea);
      }
    }

    // Reset the copied state after 2 seconds
    setTimeout(() => {
      setCopiedProjectKey(null);
    }, 2000);
  };

  // Function to toggle expanded state for a project group
  const toggleProjectGroup = (groupKey: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  };

  // Function to generate deduplicated list of entries for a project
  const generateEntryList = (projectEntries: DetailedTimeEntry[]): string => {
    const items = new Set<string>();

    projectEntries.forEach((entry) => {
      // Pick either task name OR description (task name has priority)
      // Skip entries with no meaningful content
      if (entry.task?.name) {
        items.add(entry.task.name);
      } else if (entry.description) {
        items.add(entry.description);
      }
      // Skip entries with no task name or description (don't add "No description")
    });

    // Convert to array, sort, and format with bullet points
    return Array.from(items)
      .sort()
      .map((item) => `- ${item}`)
      .join("\n");
  };

  // Group entries by date, then by project
  const groupedEntries = React.useMemo(() => {
    const grouped: { [date: string]: GroupedEntry } = {};

    entries.forEach((entry) => {
      const date = entry.startTime.split("T")[0]; // Get YYYY-MM-DD
      const projectId = entry.project?.id || "no-project";
      const projectName = entry.project?.name || "No Project";
      const projectColor = entry.project?.color || "#6B7280";

      if (!grouped[date]) {
        grouped[date] = {
          date,
          projects: {},
        };
      }

      if (!grouped[date].projects[projectId]) {
        grouped[date].projects[projectId] = {
          projectName,
          projectColor,
          entries: [],
          totalDuration: 0,
          totalEarnings: 0,
        };
      }

      grouped[date].projects[projectId].entries.push(entry);
      grouped[date].projects[projectId].totalDuration += entry.duration;
      grouped[date].projects[projectId].totalEarnings += entry.earnings;
    });

    // Sort by date ascending
    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
  }, [entries]);

  // Calculate grand totals
  const grandTotals = React.useMemo(() => {
    const totalDuration = entries.reduce(
      (sum, entry) => sum + entry.duration,
      0
    );
    const totalEarnings = entries.reduce(
      (sum, entry) => sum + entry.earnings,
      0
    );
    const totalEntries = entries.length;

    return {
      totalDuration,
      totalEarnings,
      totalEntries,
    };
  }, [entries]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Detailed Time Entries
          </h3>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Detailed Time Entries
          </h3>
        </div>
        <div className="p-6">
          <div className="text-center py-8">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
            >
              <path
                d="M9 17a2 2 0 012-2h20a2 2 0 012 2v6a2 2 0 01-2 2H11a2 2 0 01-2-2v-6zM21 12h6a2 2 0 012 2v6a2 2 0 01-2 2H21a2 2 0 01-2-2v-6a2 2 0 012-2z"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              No time entries found
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              No time entries found for the selected week.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">
          Detailed Time Entries
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Project
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Time Entries
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Time
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Earnings
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {groupedEntries.map((dayGroup) => {
              // Get all project entries for this day
              const projectEntries = Object.values(dayGroup.projects);

              return projectEntries
                .map((projectGroup) => {
                  const rows = [];
                  const groupKey = `${dayGroup.date}-${projectGroup.projectName}`;
                  const isExpanded = expandedGroups.has(groupKey);

                  // Add total row for this project FIRST
                  rows.push(
                    <tr
                      key={`${dayGroup.date}-${projectGroup.projectName}-total`}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleProjectGroup(groupKey)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {/* Triangle toggle icon */}
                          <button
                            className="mr-2 p-1 hover:bg-gray-200 rounded"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleProjectGroup(groupKey);
                            }}
                          >
                            <svg
                              className={`w-4 h-4 transition-transform duration-200 ${
                                isExpanded ? "rotate-90" : "rotate-0"
                              }`}
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
                            </svg>
                          </button>

                          <div className="mr-4">
                            <div className="text-sm font-medium text-gray-900">
                              {formatDate(dayGroup.date)}
                            </div>
                          </div>

                          <div className="flex items-center">
                            <div
                              className="w-3 h-3 rounded-full mr-3"
                              style={{
                                backgroundColor: projectGroup.projectColor,
                              }}
                            ></div>
                            <div className="text-sm font-medium text-gray-900">
                              {projectGroup.projectName}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(
                              generateEntryList(projectGroup.entries),
                              groupKey
                            );
                          }}
                          className={`flex items-center gap-2 px-3 py-1 text-sm rounded-md transition-all duration-200 ${
                            copiedProjectKey === groupKey
                              ? "text-green-700 bg-green-100 border border-green-300"
                              : "text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                          }`}
                          title={
                            copiedProjectKey === groupKey
                              ? "Copied to clipboard!"
                              : "Copy entry list to clipboard"
                          }
                        >
                          {copiedProjectKey === groupKey ? (
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                          )}
                          {copiedProjectKey === groupKey
                            ? "Copied!"
                            : "Copy Tasks List"}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {formatDuration(projectGroup.totalDuration)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {formatCurrency(projectGroup.totalEarnings)}
                        </div>
                      </td>
                    </tr>
                  );

                  // Individual entry rows - only show when expanded
                  if (isExpanded) {
                    projectGroup.entries.forEach((entry, entryIndex) => {
                      const isFirstEntryOfProject = entryIndex === 0;

                      rows.push(
                        <tr key={entry.id} className="hover:bg-gray-50">
                          {/* Project column - empty for individual entries */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            {/* Empty - project info shown in total row */}
                          </td>

                          {/* Time Entries column */}
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900">
                              {entry.description || "No description"}
                            </div>
                            {entry.task && (
                              <div className="text-xs text-gray-500">
                                Task: {entry.task.name}
                              </div>
                            )}
                            <div className="text-xs text-gray-500">
                              {new Date(entry.startTime).toLocaleTimeString(
                                "en-US",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              )}{" "}
                              -{" "}
                              {new Date(entry.endTime).toLocaleTimeString(
                                "en-US",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              )}
                            </div>
                          </td>

                          {/* Time column - Individual entry duration */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-600">
                              {formatDuration(entry.duration)}
                            </div>
                          </td>

                          {/* Earnings column */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-600">
                              {formatCurrency(entry.earnings)}
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  }

                  return rows;
                })
                .flat();
            })}
          </tbody>
          <tfoot className="bg-gray-100 border-t-2 border-gray-300">
            <tr>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-bold text-gray-900">
                  Grand Total
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="text-sm font-medium text-gray-700">
                  {grandTotals.totalEntries}{" "}
                  {grandTotals.totalEntries === 1 ? "entry" : "entries"}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-bold text-gray-900">
                  {formatDuration(grandTotals.totalDuration)}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-bold text-gray-900">
                  {formatCurrency(grandTotals.totalEarnings)}
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default DetailedTimeEntriesTable;
