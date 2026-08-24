import { notFound } from "next/navigation";

/** Unmatched /tingle/* paths render the Tingle 404. */
export default function TingleMissingPage() {
  notFound();
}
