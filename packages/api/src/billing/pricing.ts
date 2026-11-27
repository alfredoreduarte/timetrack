/**
 * Claude API list prices (USD per million tokens), used to turn agent token
 * usage into a cost line. These are API-equivalent costs: developers on a
 * flat Claude subscription don't pay per token, so timesheets label the
 * figure "API-equivalent" and cost pass-through is opt-in per project.
 *
 * Cache writes are priced at the 5-minute TTL rate (1.25x input). Source:
 * Anthropic pricing as of PRICING_AS_OF; update when prices change.
 */
export const PRICING_AS_OF = "2026-10-06";

export interface ModelPrice {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

const p = (input: number, output: number, cacheRead: number): ModelPrice => ({
  input,
  output,
  cacheWrite: input * 1.25,
  cacheRead,
});

// Keyed by model id prefix; the longest matching prefix wins, so dated or
// suffixed ids (claude-sonnet-4-5-20250929, claude-opus-4-6[1m]) resolve.
const PRICES: Record<string, ModelPrice> = {
  "claude-fable-5-1": p(10, 50, 0.25),
  "claude-mythos-5-1": p(10, 50, 0.25),
  "claude-fable-5": p(10, 50, 1.0),
  "claude-mythos-5": p(10, 50, 1.0),
  "claude-opus-5-5": p(4, 20, 0.2),
  "claude-opus-5": p(5, 25, 0.5),
  "claude-opus-4-8": p(5, 25, 0.5),
  "claude-opus-4-7": p(5, 25, 0.5),
  "claude-opus-4-6": p(5, 25, 0.5),
  "claude-opus-4-5": p(5, 25, 0.5),
  "claude-sonnet-5-5": p(2, 10, 0.2),
  "claude-sonnet-5": p(2, 10, 0.2),
  "claude-sonnet-4-6": p(3, 15, 0.3),
  "claude-sonnet-4-5": p(3, 15, 0.3),
  // Haiku 5.5 is $0.50/$2.50 above 100K-token prompts; agent turns are
  // usually below that, so the base rate is used.
  "claude-haiku-5-5": p(0.1, 0.5, 0.01),
  "claude-haiku-4-5": p(1, 5, 0.1),
};

const PREFIXES = Object.keys(PRICES).sort((a, b) => b.length - a.length);

export function priceForModel(model: string): ModelPrice | null {
  const id = model.trim().toLowerCase().replace(/\[.*\]$/, "").replace(/^anthropic\./, "");
  const prefix = PREFIXES.find((k) => id === k || id.startsWith(`${k}-`) || id.startsWith(`${k}@`));
  return prefix ? PRICES[prefix] : null;
}

export interface TokenCounts {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface CostEstimate {
  costUsd: number;
  /** Models we have no price for (their tokens are not counted). */
  unpricedModels: string[];
}

/** Sums the API-equivalent cost of per-model token usage. */
export function estimateCost(usage: Record<string, TokenCounts> | null | undefined): CostEstimate {
  let costUsd = 0;
  const unpricedModels: string[] = [];
  for (const [model, u] of Object.entries(usage ?? {})) {
    const price = priceForModel(model);
    if (!price) {
      unpricedModels.push(model);
      continue;
    }
    costUsd +=
      ((u.inputTokens ?? 0) * price.input +
        (u.outputTokens ?? 0) * price.output +
        (u.cacheWriteTokens ?? 0) * price.cacheWrite +
        (u.cacheReadTokens ?? 0) * price.cacheRead) /
      1_000_000;
  }
  return { costUsd: Math.round(costUsd * 10_000) / 10_000, unpricedModels };
}
