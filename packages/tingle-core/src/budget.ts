import type { Budget } from "./schema/profile.js";
import { DEFAULT_BUDGET } from "./schema/profile.js";

export const PAUSE_COPY =
  "Tingle is paused because it exceeded its budget — adjust here.";

export function normalizeBudget(raw?: Partial<Budget>): Budget {
  return {
    cap: Number.isFinite(raw?.cap) ? Math.max(0, Number(raw?.cap)) : DEFAULT_BUDGET.cap,
    spent: Number.isFinite(raw?.spent) ? Math.max(0, Number(raw?.spent)) : 0,
    lane: raw?.lane === "deep" ? "deep" : "cheap",
  };
}

export function remaining(budget: Budget): number {
  return Math.max(0, budget.cap - budget.spent);
}

export function wouldExceed(budget: Budget, pageLoads: number): boolean {
  return budget.spent + pageLoads > budget.cap;
}

export function spend(budget: Budget, pageLoads: number): Budget {
  return { ...budget, spent: budget.spent + pageLoads };
}

export function isCapHit(budget: Budget): boolean {
  return budget.spent >= budget.cap;
}
