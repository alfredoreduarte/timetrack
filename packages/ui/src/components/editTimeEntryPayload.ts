// Builds the PUT /time-entries/:id body from the edit modal's form state.
// Times are sent only when the user changed them, so editing a description
// never rewrites (and truncates the seconds of) the stored start/end.

/** How far ahead of the server a browser clock may run (the API tolerates 5 min). */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface EditFormState {
  description: string;
  projectId: string;
  taskId: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  hours: string;
  useHours: boolean;
}

export interface InitialTimes {
  start: { date: string; time: string };
  end: { date: string; time: string };
  /** The entry's duration as shown in the hours field when the modal opened. */
  hours: string;
  /** The entry's exact duration, so moving the start keeps it to the second. */
  durationSeconds?: number | null;
}

export interface EntryUpdatePayload {
  description: string | null;
  projectId: string | null;
  taskId: string | null;
  startTime?: string;
  endTime?: string;
  hours?: number;
}

export function buildEntryUpdate(
  form: EditFormState,
  initial: InitialTimes,
  now: number = Date.now()
): EntryUpdatePayload {
  const payload: EntryUpdatePayload = {
    description: form.description || null,
    projectId: form.projectId || null,
    taskId: form.taskId || null,
  };

  const startEdited = form.startDate !== initial.start.date || form.startTime !== initial.start.time;
  if (form.startDate && form.startTime && startEdited) {
    payload.startTime = new Date(`${form.startDate}T${form.startTime}`).toISOString();
  }

  if (form.useHours) {
    if (form.hours && form.hours !== initial.hours) {
      payload.hours = parseFloat(form.hours);
    } else if (form.hours && startEdited && payload.startTime) {
      // Hours mode keeps the duration when only the start moves; otherwise the
      // server keeps the old end and the duration silently changes. Send the
      // exact end, since the hours field is rounded to hundredths.
      const end = initial.durationSeconds ? Date.parse(payload.startTime) + initial.durationSeconds * 1000 : null;
      if (end !== null && end <= now - CLOCK_SKEW_MS) {
        payload.endTime = new Date(end).toISOString();
      } else {
        // Near "now" the server would clamp an explicit end (silently
        // shortening the entry), and this browser's clock may be ahead of
        // it; unrounded hours let the server check the end itself.
        payload.hours = initial.durationSeconds ? initial.durationSeconds / 3600 : parseFloat(form.hours);
      }
    }
  } else {
    const endEdited = form.endDate !== initial.end.date || form.endTime !== initial.end.time;
    if (form.endDate && form.endTime && endEdited) {
      payload.endTime = new Date(`${form.endDate}T${form.endTime}`).toISOString();
    }
  }
  return payload;
}
