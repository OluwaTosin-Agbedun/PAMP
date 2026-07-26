/**
 * §7.1 "Applicant state and regional distribution" — no `region`/
 * geopolitical-zone field exists anywhere in the schema (confirmed by
 * search; the prior session's own "correlate source documents" plan
 * explicitly deferred adding one). Nigeria's six geopolitical zones are
 * a fixed, well-known mapping from state name, so region is *derived*
 * from `Applicant.stateOfOrigin` here rather than stored — no new
 * column, and the mapping itself is data, not a business rule this
 * module invents.
 */
export const NIGERIA_STATE_TO_ZONE: Record<string, string> = {
  Benue: "North Central",
  Kogi: "North Central",
  Kwara: "North Central",
  Nasarawa: "North Central",
  Niger: "North Central",
  Plateau: "North Central",
  "Federal Capital Territory": "North Central",
  FCT: "North Central",
  Abuja: "North Central",
  Adamawa: "North East",
  Bauchi: "North East",
  Borno: "North East",
  Gombe: "North East",
  Taraba: "North East",
  Yobe: "North East",
  Jigawa: "North West",
  Kaduna: "North West",
  Kano: "North West",
  Katsina: "North West",
  Kebbi: "North West",
  Sokoto: "North West",
  Zamfara: "North West",
  Abia: "South East",
  Anambra: "South East",
  Ebonyi: "South East",
  Enugu: "South East",
  Imo: "South East",
  "Akwa Ibom": "South South",
  Bayelsa: "South South",
  "Cross River": "South South",
  Delta: "South South",
  Edo: "South South",
  Rivers: "South South",
  Ekiti: "South West",
  Lagos: "South West",
  Ogun: "South West",
  Ondo: "South West",
  Osun: "South West",
  Oyo: "South West",
};

const NORMALISED_ZONE_LOOKUP: Record<string, string> = Object.fromEntries(
  Object.entries(NIGERIA_STATE_TO_ZONE).map(([state, zone]) => [state.trim().toLowerCase(), zone]),
);

/** Null for an unset/unrecognised state — a bad or missing import value never crashes the dashboard, it just doesn't bucket. */
export function zoneForState(stateOfOrigin: string | null | undefined): string | null {
  if (!stateOfOrigin) return null;
  return NORMALISED_ZONE_LOOKUP[stateOfOrigin.trim().toLowerCase()] ?? null;
}

/** The inverse of `NIGERIA_STATE_TO_ZONE` — every state name (as actually stored, not normalised) belonging to a given zone, for filtering `Applicant.stateOfOrigin` by zone in a Prisma `in` clause. */
export function statesInZone(zone: string): string[] {
  return Object.entries(NIGERIA_STATE_TO_ZONE)
    .filter(([, z]) => z.toLowerCase() === zone.trim().toLowerCase())
    .map(([state]) => state);
}

/** `groupBy` rows → a plain `{key: count}` record, folding `null`/`undefined` keys under one bucket label. */
export function toCountRecord<K extends string | null>(
  rows: { key: K; count: number }[],
  nullLabel = "Not recorded",
): Record<string, number> {
  const record: Record<string, number> = {};
  for (const row of rows) {
    const label = row.key ?? nullLabel;
    record[label] = (record[label] ?? 0) + row.count;
  }
  return record;
}

export function percentage(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** Standard 5-year demographic bins — no PAM-P-specific age eligibility rule exists in the schema to derive bucket edges from instead. */
const AGE_BUCKETS = [
  { label: "20–24", min: 20, max: 24 },
  { label: "25–29", min: 25, max: 29 },
  { label: "30–34", min: 30, max: 34 },
  { label: "35–39", min: 35, max: 39 },
  { label: "40+", min: 40, max: Infinity },
] as const;

/** Whole years as of `asOf`, the same "count completed birthdays" definition used everywhere else age matters (e.g. NYSC eligibility). */
function ageInYears(dateOfBirth: Date, asOf: Date): number {
  let age = asOf.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const hasHadBirthdayThisYear =
    asOf.getUTCMonth() > dateOfBirth.getUTCMonth() ||
    (asOf.getUTCMonth() === dateOfBirth.getUTCMonth() && asOf.getUTCDate() >= dateOfBirth.getUTCDate());
  if (!hasHadBirthdayThisYear) age--;
  return age;
}

/** Bucket label for one applicant's age, or null for "under 20"/unrecorded — never forced into a nearest bucket, since a bad import value shouldn't silently masquerade as a real 20-year-old. */
export function ageBucketLabel(dateOfBirth: Date | null, asOf: Date): string | null {
  if (!dateOfBirth) return null;
  const age = ageInYears(dateOfBirth, asOf);
  const bucket = AGE_BUCKETS.find((b) => age >= b.min && age <= b.max);
  return bucket?.label ?? null;
}

/** Fixed left-to-right ordering for rendering — `Object.entries` on a count record has no guaranteed bucket order otherwise. */
export const AGE_BUCKET_ORDER = AGE_BUCKETS.map((b) => b.label);

/** One row per calendar day (UTC) between two dates the submission-trend chart needs, even for days with zero submissions. */
export function dateRangeDays(from: Date, to: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}
