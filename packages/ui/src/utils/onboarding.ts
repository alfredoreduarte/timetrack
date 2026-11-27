/**
 * Per-user flags for the dashboard's setup checklist, kept in this browser.
 * Storage may be unavailable (private mode); then nothing is remembered.
 */
const key = (name: string, userId: string) => `gettingStarted.${name}.${userId}`;

const read = (name: string, userId: string | undefined) => {
  if (!userId) return false;
  try {
    return localStorage.getItem(key(name, userId)) === "1";
  } catch {
    return false;
  }
};

const write = (name: string, userId: string | undefined) => {
  if (!userId) return;
  try {
    localStorage.setItem(key(name, userId), "1");
  } catch {
    // Not remembered; harmless.
  }
};

/** The checklist was hidden, or finished. */
export const checklistDone = (userId: string | undefined) => read("dismissed", userId);
export const markChecklistDone = (userId: string | undefined) => write("dismissed", userId);

/** A timesheet went out as CSV or Markdown (Free accounts can't make share links). */
export const timesheetSent = (userId: string | undefined) => read("timesheetSent", userId);
export const markTimesheetSent = (userId: string | undefined) => write("timesheetSent", userId);

/** Drops this browser's checklist flags for an account (it was deleted). */
export const forgetChecklist = (userId: string | undefined) => {
  if (!userId) return;
  try {
    localStorage.removeItem(key("dismissed", userId));
    localStorage.removeItem(key("timesheetSent", userId));
  } catch {
    // Nothing was stored.
  }
};
