export type LoyaltyFormulaMode = "uniform" | "proportional";

/**
 * Not yet wired into any live points-award path (see ohm#9k3m7qxc Part 2).
 * Wet Area is never passed through this function — it stays a fixed 3 pts,
 * handled at the call site once that wiring exists.
 */
export function computeLoyaltyPoints(
  mode: LoyaltyFormulaMode,
  paidAmount: number,
  fullPrice: number,
  basePoints: number,
  pesoPerPoint: number | null,
): number {
  if (mode === "uniform") {
    if (!pesoPerPoint) return 0;
    return Math.round(paidAmount / pesoPerPoint);
  }
  return Math.round(basePoints * (paidAmount / fullPrice));
}
