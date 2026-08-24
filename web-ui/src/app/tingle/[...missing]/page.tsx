import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/** Unmatched /tingle/* paths render the Tingle 404. */
export default function TingleMissingPage() {
  notFound();
}
