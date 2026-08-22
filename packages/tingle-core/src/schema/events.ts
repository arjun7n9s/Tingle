import { z } from "zod";
import { HitSourceSchema } from "./hits.js";

/**
 * Stages a heal can reach. `heal_pending_approval` is a terminal state for an
 * unattended run: the default is preview-then-approve, so a job that hits the
 * gate without `autoApprove` stops there rather than committing a rewrite.
 */
export const HealStageSchema = z.enum([
  "validation_failed",
  "heal_started",
  "heal_pending_approval",
  "heal_approved",
  "heal_rejected",
  "retry_started",
  "retry_succeeded",
  "retry_failed",
]);
export type HealStage = z.infer<typeof HealStageSchema>;

export const HealEventSchema = z.object({
  id: z.string(),
  at: z.string(),
  /** The pinned c_* being repaired. Identical before and after a heal. */
  collector_id: z.string(),
  collector: HitSourceSchema,
  stage: HealStageSchema,
  detail: z.string(),
  /** Zod paths + messages that triggered the incident. */
  zod_issues: z.array(z.string()).optional(),
  /** Bright Data's proposed extractor output, when it reaches the gate. */
  preview: z.unknown().optional(),
});

export type HealEvent = z.infer<typeof HealEventSchema>;

export const TingleEventTypeSchema = z.enum([
  "already_exists",
  "building",
  "just_shipped",
  "paper_patent",
  "ai_default",
  "discussion",
]);
export type TingleEventType = z.infer<typeof TingleEventTypeSchema>;

export const UrgencySchema = z.enum(["now", "soon", "note", "quiet"]);
export type Urgency = z.infer<typeof UrgencySchema>;

export const TingleEventSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  at: z.string(),
  type: TingleEventTypeSchema,
  urgency: UrgencySchema,
  claim_fingerprint: z.string(),
  entity_key: z.string(),
  content_hash: z.string(),
  sources: z.array(
    z.object({
      collector: z.string(),
      url: z.string(),
    }),
  ),
  hit_ids: z.array(z.string()),
});
export type TingleEvent = z.infer<typeof TingleEventSchema>;
