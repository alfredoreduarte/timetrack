import { describe, it, expect } from "vitest";
import { buildEntryUpdate, EditFormState, InitialTimes } from "../editTimeEntryPayload";

const initial: InitialTimes = {
  start: { date: "2026-03-02", time: "09:00" },
  end: { date: "2026-03-02", time: "11:00" },
  hours: "2.00",
};
const form = (over: Partial<EditFormState> = {}): EditFormState => ({
  description: "Work",
  projectId: "p1",
  taskId: "",
  startDate: "2026-03-02",
  startTime: "09:00",
  endDate: "2026-03-02",
  endTime: "11:00",
  hours: "2.00",
  useHours: false,
  ...over,
});

describe("buildEntryUpdate", () => {
  it("sends no times for a description-only edit", () => {
    const p = buildEntryUpdate(form({ description: "Renamed" }), initial);
    expect(p).toEqual({ description: "Renamed", projectId: "p1", taskId: null });
  });

  it("sends only the changed end in time mode", () => {
    const p = buildEntryUpdate(form({ endTime: "12:00" }), initial);
    expect(p.startTime).toBeUndefined();
    expect(p.endTime).toBe(new Date("2026-03-02T12:00").toISOString());
  });

  it("in hours mode keeps the duration when only the start moves", () => {
    const p = buildEntryUpdate(form({ useHours: true, startTime: "07:00" }), initial);
    expect(p.startTime).toBe(new Date("2026-03-02T07:00").toISOString());
    expect(p.hours).toBe(2);
    expect(p.endTime).toBeUndefined();
  });

  it("in hours mode moving the start keeps the exact duration, not the rounded hours", () => {
    // 2h 0m 10s shows as "2.00"; resending 2.00h would shave 10 seconds off.
    const p = buildEntryUpdate(
      form({ useHours: true, startTime: "07:00" }),
      { ...initial, durationSeconds: 7210 },
      Date.parse("2026-03-03T00:00:00")
    );
    expect(p.hours).toBeUndefined();
    expect(Date.parse(p.endTime!) - Date.parse(p.startTime!)).toBe(7210 * 1000);
  });

  it("in hours mode never sends an end in the future (the server would clamp it)", () => {
    const now = Date.parse("2026-03-02T08:30:00");
    const p = buildEntryUpdate(form({ useHours: true, startTime: "07:00" }), { ...initial, durationSeconds: 7210 }, now);
    expect(p.endTime).toBeUndefined();
    expect(p.hours).toBe(7210 / 3600);
  });

  it("in hours mode sends new hours and nothing else when only hours change", () => {
    const p = buildEntryUpdate(form({ useHours: true, hours: "3.5" }), initial);
    expect(p).toMatchObject({ hours: 3.5 });
    expect(p.startTime).toBeUndefined();
  });

  it("builds local times (no UTC date shift)", () => {
    const p = buildEntryUpdate(form({ startDate: "2026-03-03", startTime: "23:30" }), initial);
    const d = new Date(p.startTime!);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 3, 3, 23, 30]);
  });
});
