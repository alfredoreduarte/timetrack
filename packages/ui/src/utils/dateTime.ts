/**
 * Utilities for date and time formatting throughout the application
 */

/**
 * Format duration from seconds to readable string for reports
 * Example: 3661 seconds -> "1h 1m"
 */
export const formatReportsDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

/**
 * Format duration from seconds to HH:MM:SS format for running timers
 * Example: 3661 seconds -> "01:01:01"
 */
export const formatTimerDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return [hours, minutes, secs]
    .map((val) => val.toString().padStart(2, "0"))
    .join(":");
};

/**
 * Format date and time for display
 * Example: "2024-01-15T14:30:00Z" -> "1/15/2024 2:30 PM"
 */
export const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return (
    date.toLocaleDateString("en-US") +
    " " +
    date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  );
};

/**
 * Format date only for display
 * Example: "2024-01-15T14:30:00Z" -> "1/15/2024"
 */
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US");
};

/**
 * Format time only for display
 * Example: "2024-01-15T14:30:00Z" -> "2:30 PM"
 */
export const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};
