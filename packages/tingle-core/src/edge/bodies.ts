import { z } from "zod";
import { ClientError } from "./clientError.js";

/** Untrusted HTTP JSON. Parse here; handlers receive typed values. */
export const EmailPasswordBody = z.object({
  email: z.string().trim().email("invalid email"),
  password: z.string().min(8, "password must be at least 8 characters"),
});

export const QuickChatBody = z.object({
  message: z.string().trim().min(1, "message required"),
});

export function parseBody<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ClientError(result.error.issues[0]?.message ?? "invalid body");
  }
  return result.data;
}
