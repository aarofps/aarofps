export type GoalLike = { targetCents: number; accountId: string | null; earmarkedCents: number; manualCents: number };

export function goalProgress(g: GoalLike, accountBalanceCents: number | null): { currentCents: number; pct: number } {
  const raw = g.accountId ? Math.min(g.earmarkedCents, accountBalanceCents ?? 0) : g.manualCents;
  const currentCents = Math.max(0, raw);
  return { currentCents, pct: g.targetCents > 0 ? Math.min(1, currentCents / g.targetCents) : 0 };
}

export function validScore(n: number): boolean {
  return Number.isInteger(n) && n >= 300 && n <= 850;
}
