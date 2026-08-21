import { z } from "zod";

/**
 * Where the builder is. Drives what counts as urgent later, and what the first
 * look is even looking for. Always user-supplied — never inferred and hidden,
 * because a wrong guess silently retargets the whole watch.
 */
export const StageSchema = z.enum(["starting", "building", "shipped"]);
export type Stage = z.infer<typeof StageSchema>;

export const LaneSchema = z.enum(["cheap", "deep"]);

export const BudgetSchema = z.object({
  /** Hard ceiling in page loads. Watch pauses when exceeded. */
  cap_page_loads: z.number().int().positive().default(500),
  spent_page_loads: z.number().int().nonnegative().default(0),
  lane: LaneSchema.default("cheap"),
});

/**
 * The watch profile is the product. Everything else is derived from it.
 *
 * Mirrors the storage shape so a vault row and a repo-local file are the same
 * object with a different backend.
 */
export const WatchProfileSchema = z.object({
  project_id: z.string().min(1),
  stage: StageSchema,
  /** The one confirmed sentence. This *is* the watch. */
  claim: z.string().min(1),
  /**
   * Hash of the claim at confirmation time. A claim edit that does not go
   * through an explicit re-confirm must not silently retarget the job.
   */
  claim_lock: z.string().min(1),
  /** Phrases pulled from the claim and artifacts. Sharpen over time. */
  fingerprints: z.array(z.string()).default([]),
  /** If one of these appears, it is the same niche regardless of score. */
  must_match: z.array(z.string()).default([]),
  /** Adjacent things that are not them. Grows every time they mute a hit. */
  ignore: z.array(z.string()).default([]),
  /** Which lanes ran for this project. */
  sources: z.array(z.string()).default([]),
  /** First-look hit ids, so the second run is a diff. */
  baseline_ids: z.array(z.string()).default([]),
  geo: z
    .object({ country: z.string().optional(), language: z.string().optional() })
    .default({}),
  budget: BudgetSchema.default({
    cap_page_loads: 500,
    spent_page_loads: 0,
    lane: "cheap",
  }),
  alert_email: z.string().email().nullable().default(null),
  digest_floor: z.enum(["daily", "weekly"]).default("weekly"),
  stealth: z.boolean().default(false),
  storage: z.enum(["vault", "github"]).default("vault"),
  created_at: z.string(),
  updated_at: z.string(),
});

export type WatchProfile = z.infer<typeof WatchProfileSchema>;

/** What the builder handed us. Minimum: one toggle on, with something in it. */
export const ProjectInputSchema = z
  .object({
    stage: StageSchema,
    /** Free text, in their words. */
    pitch: z.string().optional(),
    /** Already-extracted document text. Files are read, never scraped. */
    docs: z
      .array(z.object({ name: z.string(), text: z.string() }))
      .default([]),
    /** Product pages, papers, known competitors. */
    links: z.array(z.string().url()).default([]),
    /** Repo url. Read over the public REST API, not scraped. */
    github_repo: z.string().optional(),
    /** Extra sites or names to watch. */
    watch_list: z.array(z.string()).default([]),
    /** An existing filing id, so nobody has to upload a PDF. */
    patent_number: z.string().optional(),
    /** "Looks like us, is not." */
    ignore: z.array(z.string()).default([]),
    country: z.string().optional(),
  })
  .refine(
    (v) =>
      Boolean(v.pitch?.trim()) ||
      v.docs.length > 0 ||
      v.links.length > 0 ||
      Boolean(v.github_repo?.trim()) ||
      Boolean(v.patent_number?.trim()),
    {
      message:
        "at least one input needs content — pitch, docs, links, a repo, or a patent number",
    },
  );

export type ProjectInput = z.infer<typeof ProjectInputSchema>;
