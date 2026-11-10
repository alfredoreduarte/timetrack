// Builds the PUT /time-entries/:id body from the edit modal's form state.
// Times are sent only when the user changed them, so editing a description
// never rewrites (and truncates the seconds of) the stored start/end.

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
}

export interface EntryUpdatePayload {
  description: string | null;
  projectId: string | null;
  taskId: string | null;
  startTime?: string;
  endTime?: string;
  hours?: number;
}

export function buildEntryUpdate(form: EditFormState, initial: InitialTimes): EntryUpdatePayload {
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
    // Hours mode keeps the duration: resend it whenever the start moves too,
    // otherwise the server keeps the old end and the duration silently changes.
    if (form.hours && (form.hours !== initial.hours || startEdited)) {
      payload.hours = parseFloat(form.hours);
    }
  } else {
    const endEdited = form.endDate !== initial.end.date || form.endTime !== initial.end.time;
    if (form.endDate && form.endTime && endEdited) {
      payload.endTime = new Date(`${form.endDate}T${form.endTime}`).toISOString();
    }
  }
  return payload;
}
