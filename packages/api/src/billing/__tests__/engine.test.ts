import { billProject, effectiveRate, unionMs, BillingPolicy, BillableEntry } from "../engine";
import { localDateKey, midnightsBetween, startOfLocalDay } from "../time";
import { estimateCost, priceForModel } from "../pricing";

const T0 = Date.UTC(2026, 2, 2, 9, 0, 0); // Mon 2026-03-02 09:00Z
const at = (min: number) => new Date(T0 + min * 60_000);
const entry = (id: string, from: number, to: number, rate: number | null, isAi = true): BillableEntry => ({
  id,
  start: at(from),
  end: at(to),
  rate,
  isAi,
});
const policy = (p: Partial<BillingPolicy> = {}): BillingPolicy => ({
  overlapMode: "dedupe",
  aiMultiplier: 1,
  agentHourlyRate: null,
  includeAiCosts: false,
  aiCostMarkupPercent: 0,
  ...p,
});
const H = 3_600_000;

describe("billing engine — the plan's worked example", () => {
  // Three agents on one project between 09:00 and 11:00:
  // A 09:00–10:30, B 09:30–10:00, C 10:15–11:00 → summed 2h45, wall-clock 2h.
  const agents = [entry("A", 0, 90, 100), entry("B", 30, 60, 100), entry("C", 75, 120, 100)];

  it("dedupe bills wall-clock time once", () => {
    const r = billProject(agents, policy(), "UTC");
    expect(r.wallClockMs).toBe(2 * H);
    expect(r.trackedMs).toBe(2.75 * H);
    expect(r.billedMs).toBe(2 * H);
    expect(r.amount).toBeCloseTo(200);
  });

  it("sum bills every agent in full", () => {
    const r = billProject(agents, policy({ overlapMode: "sum" }), "UTC");
    expect(r.billedMs).toBe(2.75 * H);
    expect(r.amount).toBeCloseTo(275);
  });

  it("a 3x multiplier with sum is the 8h15 the research warned about; dedupe keeps it at 2h of time", () => {
    const summed = billProject(agents, policy({ overlapMode: "sum", aiMultiplier: 3 }), "UTC");
    expect(summed.amount).toBeCloseTo(825); // 8.25h × $100
    const deduped = billProject(agents, policy({ aiMultiplier: 3 }), "UTC");
    expect(deduped.billedMs).toBe(2 * H);
    expect(deduped.amount).toBeCloseTo(600);
  });
});

describe("billing engine — rates and attribution", () => {
  it("bills overlapping time at the highest effective rate", () => {
    const r = billProject([entry("cheap", 0, 60, 50), entry("pricey", 30, 90, 200)], policy(), "UTC");
    // 0–30 cheap (25), 30–90 pricey (200)
    expect(r.amount).toBeCloseTo(25 + 200);
    expect(r.allocations.get("cheap")!.get("2026-03-02")).toMatchObject({ trackedMs: H, billedMs: 0.5 * H });
    expect(r.allocations.get("pricey")!.get("2026-03-02")).toMatchObject({ trackedMs: H, billedMs: H });
  });

  it("prefers human work on equal rates, then earlier start", () => {
    const r = billProject([entry("agent", 0, 60, 100, true), entry("human", 0, 60, 100, false)], policy(), "UTC");
    expect(r.billedHumanMs).toBe(H);
    expect(r.billedAgentMs).toBe(0);
    const s = billProject([entry("late", 10, 60, 100), entry("early", 0, 60, 100)], policy(), "UTC");
    expect(s.allocations.get("early")!.get("2026-03-02")!.billedMs).toBe(H);
    expect(s.allocations.get("late")!.get("2026-03-02")!.billedMs).toBe(0);
  });

  it("applies flat agent rates and multipliers only to AI time", () => {
    const p = policy({ agentHourlyRate: 40, aiMultiplier: 5 });
    expect(effectiveRate({ rate: 100, isAi: true }, p)).toBe(40);
    expect(effectiveRate({ rate: 100, isAi: false }, p)).toBe(100);
    expect(effectiveRate({ rate: 100, isAi: true }, policy({ aiMultiplier: 0 }))).toBe(0);
    expect(effectiveRate({ rate: null, isAi: true }, policy({ aiMultiplier: 3 }))).toBe(0);
  });

  it("splits entries at local midnight in the requested timezone", () => {
    // 2026-03-02 22:00 → 2026-03-03 02:00 in UTC; São Paulo is UTC-3 → 19:00–23:00 same local day.
    const late = [{ id: "x", start: new Date(Date.UTC(2026, 2, 2, 22)), end: new Date(Date.UTC(2026, 2, 3, 2)), rate: 60, isAi: true }];
    const utc = billProject(late, policy(), "UTC");
    expect(Array.from(utc.allocations.get("x")!.entries()).map(([d, a]) => [d, a.billedMs])).toEqual([
      ["2026-03-02", 2 * H],
      ["2026-03-03", 2 * H],
    ]);
    const sp = billProject(late, policy(), "America/Sao_Paulo");
    expect(Array.from(sp.allocations.get("x")!.keys())).toEqual(["2026-03-02"]);
  });

  it("matches a brute-force minute-by-minute computation on random schedules", () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let trial = 0; trial < 40; trial++) {
      const n = 1 + Math.floor(rand() * 8);
      const es: BillableEntry[] = Array.from({ length: n }, (_, i) => {
        const s = Math.floor(rand() * 600);
        return entry(`e${i}`, s, s + 1 + Math.floor(rand() * 240), [50, 100, 150][Math.floor(rand() * 3)], rand() < 0.7);
      });
      const p = policy({ aiMultiplier: [1, 2, 0.5][trial % 3] });
      const r = billProject(es, p, "Europe/Madrid");
      let wall = 0;
      let amount = 0;
      for (let m = 0; m < 900; m++) {
        const covering = es.filter((e) => e.start.getTime() <= at(m).getTime() && e.end.getTime() >= at(m + 1).getTime());
        if (covering.length === 0) continue;
        wall += 60_000;
        amount += Math.max(...covering.map((e) => effectiveRate(e, p))) / 60;
      }
      expect(r.wallClockMs).toBe(wall);
      expect(r.billedMs).toBe(wall);
      expect(r.amount).toBeCloseTo(amount, 6);
      expect(unionMs(es)).toBe(wall);
      const summed = billProject(es, { ...p, overlapMode: "sum" }, "Europe/Madrid");
      expect(summed.billedMs).toBe(es.reduce((s, e) => s + (e.end.getTime() - e.start.getTime()), 0));
      expect(summed.billedMs).toBeGreaterThanOrEqual(r.billedMs);
    }
  });

  it("stays fast when thousands of entries overlap (no per-slice scans)", () => {
    const base = Date.UTC(2026, 2, 1);
    const many = Array.from({ length: 20_000 }, (_, i) => ({
      id: `e${i}`,
      start: new Date(base + i * 60_000),
      end: new Date(base + i * 60_000 + 20 * 3600_000),
      rate: (i % 7) * 10,
      isAi: i % 2 === 0,
    }));
    for (const overlapMode of ["dedupe", "sum"] as const) {
      const t0 = Date.now();
      const bill = billProject(many, policy({ overlapMode }), "Europe/Madrid");
      expect(Date.now() - t0).toBeLessThan(2000); // quadratic took minutes
      expect(bill.trackedMs).toBe(20_000 * 20 * 3600_000);
    }
  });

  it("ignores zero-length entries and handles no entries", () => {
    expect(billProject([], policy(), "UTC").billedMs).toBe(0);
    expect(billProject([entry("z", 5, 5, 100)], policy(), "UTC").billedMs).toBe(0);
  });
});

describe("timezone helpers", () => {
  it("finds local midnights across a DST change", () => {
    // Europe/Madrid springs forward on 2026-03-29.
    const a = new Date(Date.UTC(2026, 2, 28, 12));
    const b = new Date(Date.UTC(2026, 2, 30, 12));
    const mids = midnightsBetween(a, b, "Europe/Madrid").map((d) => d.toISOString());
    expect(mids).toEqual(["2026-03-28T23:00:00.000Z", "2026-03-29T22:00:00.000Z"]);
    expect(startOfLocalDay(new Date("2026-03-29T12:00:00Z"), "Europe/Madrid").toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(localDateKey(new Date("2026-03-02T02:00:00Z"), "America/Sao_Paulo")).toBe("2026-03-01");
  });
});

describe("pricing", () => {
  it("resolves dated, suffixed and platform-prefixed model ids", () => {
    expect(priceForModel("claude-opus-5-5")).toMatchObject({ input: 4, output: 20, cacheRead: 0.2 });
    expect(priceForModel("claude-sonnet-4-5-20250929")).toMatchObject({ input: 3 });
    expect(priceForModel("claude-opus-4-6[1m]")).toMatchObject({ input: 5 });
    expect(priceForModel("anthropic.claude-haiku-4-5")).toMatchObject({ input: 1 });
    // opus-5 must not swallow opus-5-5
    expect(priceForModel("claude-opus-5")).toMatchObject({ input: 5 });
    expect(priceForModel("gpt-5")).toBeNull();
  });

  it("estimates API-equivalent cost and reports unpriced models", () => {
    const r = estimateCost({
      "claude-opus-5-5": { inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 10_000_000, cacheWriteTokens: 200_000 },
      "mystery-model": { inputTokens: 5 },
    });
    // 4 + 2 + 2 + 1 = 9
    expect(r.costUsd).toBeCloseTo(9);
    expect(r.unpricedModels).toEqual(["mystery-model"]);
  });
});
