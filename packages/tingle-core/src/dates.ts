const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export type ParsedDate = {
  iso: string | null;
  /** How the value was read. Surfaced so "undated" is never mistaken for "old". */
  precision: "exact" | "inferred-year" | "unparsed";
};

/**
 * Parse whatever a listing put in `published_at`.
 *
 * Returns null rather than guessing. The third pile is "shipped in the last
 * 7 days", so a date silently defaulted to today would manufacture a finding,
 * and one defaulted to the epoch would hide a real one. Unparsed stays
 * unparsed and gets counted in the quality log.
 */
export function parseListingDate(
  raw: string | null | undefined,
  now: Date,
): ParsedDate {
  if (!raw || typeof raw !== "string") {
    return { iso: null, precision: "unparsed" };
  }
  const s = raw.trim();
  if (!s) return { iso: null, precision: "unparsed" };

  // Already a full timestamp or ISO date.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return { iso: d.toISOString(), precision: "exact" };
    }
  }

  // "Aug 14, 2025" / "14 Aug 2025" — month name with an explicit year.
  const withYear = s.match(
    /(?:([a-z]{3,9})\s+(\d{1,2})|(\d{1,2})\s+([a-z]{3,9})),?\s+(\d{4})/i,
  );
  if (withYear) {
    const mName = (withYear[1] ?? withYear[4] ?? "").slice(0, 3).toLowerCase();
    const day = Number(withYear[2] ?? withYear[3]);
    const year = Number(withYear[5]);
    const month = MONTHS[mName];
    if (month !== undefined && day >= 1 && day <= 31) {
      return {
        iso: new Date(Date.UTC(year, month, day)).toISOString(),
        precision: "exact",
      };
    }
  }

  // "Aug 14" — no year. Listings drop the year for recent posts, so take the
  // most recent occurrence that is not in the future.
  const noYear = s.match(/^([a-z]{3,9})\s+(\d{1,2})$/i);
  if (noYear) {
    const month = MONTHS[noYear[1]!.slice(0, 3).toLowerCase()];
    const day = Number(noYear[2]);
    if (month !== undefined && day >= 1 && day <= 31) {
      let year = now.getUTCFullYear();
      let d = new Date(Date.UTC(year, month, day));
      // Allow a day of slack for timezone skew before rolling back a year.
      if (d.getTime() - now.getTime() > 86_400_000) {
        year -= 1;
        d = new Date(Date.UTC(year, month, day));
      }
      return { iso: d.toISOString(), precision: "inferred-year" };
    }
  }

  return { iso: null, precision: "unparsed" };
}

export function daysBetween(isoA: string, isoB: string): number {
  return Math.abs(
    (new Date(isoA).getTime() - new Date(isoB).getTime()) / 86_400_000,
  );
}

export function isWithinDays(
  iso: string | null,
  now: Date,
  days: number,
): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const age = now.getTime() - t;
  // Future-dated rows are not "shipped recently"; they are bad data.
  return age >= -86_400_000 && age <= days * 86_400_000;
}
