import { z } from "zod";

export const StageSchema = z.enum(["starting", "building", "shipped"]);
export type Stage = z.infer<typeof StageSchema>;

export const FirstLookTogglesSchema = z.object({
  pitch: z.string().optional(),
  docs_text: z.string().optional(),
  links: z.array(z.string().url()).optional(),
  github_url: z.string().optional(),
  watch_list: z.array(z.string()).optional(),
  patent_number: z.string().optional(),
  ignore: z.array(z.string()).optional(),
});
export type FirstLookToggles = z.infer<typeof FirstLookTogglesSchema>;

export const DigestFloorSchema = z.enum(["daily", "weekly"]);
export type DigestFloor = z.infer<typeof DigestFloorSchema>;

export const BudgetLaneSchema = z.enum(["cheap", "deep"]);
export const BudgetSchema = z.object({
  cap: z.number().nonnegative().default(50),
  spent: z.number().nonnegative().default(0),
  lane: BudgetLaneSchema.default("cheap"),
});
export type Budget = z.infer<typeof BudgetSchema>;

export const DEFAULT_BUDGET: Budget = { cap: 50, spent: 0, lane: "cheap" };

/**
 * The persisted watch object. First look and later Tingle ticks both derive
 * from this; they do not keep a parallel copy of the pitch.
 */
export const WatchProfileSchema = z.object({
  project_id: z.string(),
  stage: StageSchema,
  extra_question: z.string().optional(),
  claim: z.string().min(1),
  fingerprints: z.array(z.string()),
  must_match: z.array(z.string()).default([]),
  ignore: z.array(z.string()).default([]),
  sources: z.array(z.string()).default(["search", "watch"]),
  baseline_ids: z.array(z.string()).default([]),
  github_url: z.string().optional(),
  patent_number: z.string().optional(),
  links: z.array(z.string()).default([]),
  watch_list: z.array(z.string()).default([]),
  tingle_on: z.boolean().default(false),
  alert_email: z.string().email().optional(),
  digest_floor: DigestFloorSchema.default("daily"),
  budget: BudgetSchema.default(DEFAULT_BUDGET),
  paused: z.boolean().default(false),
  stealth: z.boolean().default(false),
});
export type WatchProfile = z.infer<typeof WatchProfileSchema>;
