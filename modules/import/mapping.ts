export const CORE_FIELDS = [
  { key: "externalRef", label: "External reference / Applicant ID", required: false },
  { key: "firstName", label: "First name", required: true },
  { key: "lastName", label: "Last name", required: true },
  { key: "email", label: "Email", required: true },
  { key: "phone", label: "Phone", required: false },
  { key: "gender", label: "Gender", required: false },
  { key: "dateOfBirth", label: "Date of birth", required: false },
  { key: "stateOfOrigin", label: "State of origin", required: false },
  { key: "institution", label: "Institution", required: false },
  { key: "pathway", label: "Pathway / Track", required: false },
  // PAM-P 2026 Eligibility Screening Checklist — structured fields the
  // eligibility engine's automatic pre-checks read (§11.1). All
  // optional: absent means "no data, ask the screener," never a
  // negative automatic result.
  { key: "nationality", label: "Nationality", required: false },
  { key: "governmentIdType", label: "Government ID type", required: false },
  { key: "governmentIdNumber", label: "Government ID number", required: false },
  { key: "nyscStatus", label: "NYSC status", required: false },
  { key: "nyscCompletionDate", label: "NYSC completion date", required: false },
  { key: "availabilityDeclared", label: "Programme availability declaration", required: false },
  { key: "submittedAt", label: "Portal submission timestamp", required: false },
] as const;

export type CoreFieldKey = (typeof CORE_FIELDS)[number]["key"];

/** Every source column is mapped to a core field, kept as extra data, or ignored. */
export type ColumnTarget = CoreFieldKey | "EXTRA" | "IGNORE";
export type ColumnMapping = Record<string, ColumnTarget>;

const ALIASES: Record<CoreFieldKey, string[]> = {
  externalRef: ["applicant id", "reference", "ref", "application id", "id"],
  firstName: ["first name", "firstname", "given name"],
  lastName: ["last name", "lastname", "surname", "family name"],
  email: ["email", "email address"],
  phone: ["phone", "phone number", "mobile", "telephone"],
  gender: ["gender", "sex"],
  dateOfBirth: ["date of birth", "dob", "birth date"],
  stateOfOrigin: ["state of origin", "state"],
  institution: ["institution", "school", "university"],
  pathway: ["pathway", "track", "programme track"],
  nationality: ["nationality", "citizenship"],
  governmentIdType: ["id type", "identification type", "government id type"],
  governmentIdNumber: ["id number", "identification number", "government id number", "nin"],
  nyscStatus: ["nysc status", "nysc"],
  nyscCompletionDate: ["nysc completion date", "nysc date", "nysc discharge date"],
  availabilityDeclared: ["availability", "programme availability", "available"],
  submittedAt: ["submitted at", "submission date", "submission timestamp", "date submitted", "date applied", "application date"],
};

/**
 * Word-boundary match only — a raw substring check (`normalized.includes(alias)`)
 * previously matched a short alias anywhere inside an unrelated header
 * ("ref" inside "Referee", "id" inside "Middle Name"/"Residential
 * Address"/"How Did You Hear", "state" inside "Personal Statement",
 * "nysc" inside every NYSC-prefixed column), silently collapsing many
 * distinct columns onto one field. Padding both sides with spaces
 * requires the alias to appear as whole word(s), not a fragment.
 */
function matchesAlias(normalized: string, alias: string): boolean {
  return ` ${normalized} `.includes(` ${alias} `);
}

/**
 * Best-effort default mapping so the admin is adjusting, not building
 * from scratch. Always reviewable/overridable before commit.
 *
 * A real export commonly has several columns that all word-match the
 * same field at once — "Email Address" and "Referee 1 Email Address"
 * both contain "email address"; "NYSC Status" and "NYSC Document View
 * Link" both contain "nysc". Rather than suggest all of them (which
 * `findDuplicateMappings` would then just reject, handing the admin a
 * blocked import with 20+ dropdowns to sort out by hand), every
 * (header, field) candidate is scored by how specific its match is —
 * an exact full-header match beats a partial word match, and a longer
 * matched alias beats a shorter one — then assigned greedily,
 * strongest match first, skipping a header or field the moment either
 * has already been claimed. The result is always internally
 * conflict-free by construction; `findDuplicateMappings` remains as a
 * guard for mappings an admin edits by hand afterward, not something
 * the suggestion itself should ever need to trigger.
 */
export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const header of headers) mapping[header] = "EXTRA";

  type Candidate = { header: string; field: CoreFieldKey; score: number };
  const candidates: Candidate[] = [];

  for (const header of headers) {
    const normalized = header.trim().toLowerCase();
    for (const field of CORE_FIELDS) {
      for (const alias of ALIASES[field.key]) {
        if (!matchesAlias(normalized, alias)) continue;
        const isExact = normalized === alias;
        candidates.push({ header, field: field.key, score: (isExact ? 1000 : 0) + alias.length });
      }
    }
  }

  // Stable sort: ties (equal specificity) keep header order, so the
  // first matching column in the file wins a tie rather than an
  // arbitrary one.
  candidates.sort((a, b) => b.score - a.score);

  const claimedHeaders = new Set<string>();
  const claimedFields = new Set<CoreFieldKey>();
  for (const candidate of candidates) {
    if (claimedHeaders.has(candidate.header) || claimedFields.has(candidate.field)) continue;
    mapping[candidate.header] = candidate.field;
    claimedHeaders.add(candidate.header);
    claimedFields.add(candidate.field);
  }

  return mapping;
}

/**
 * Guards against the failure mode word-boundary matching alone can't
 * fully rule out (an admin manually assigning two columns to the same
 * field, or two headers that both legitimately word-match one alias):
 * every core-field target must come from exactly one column. Without
 * this, `applyMapping`'s `core[target] = value` silently lets the last
 * mapped column win, and — for `externalRef`/`email`, the fields the
 * importer upserts on — that means two unrelated applicants can end up
 * sharing an identity key and overwriting each other's records.
 * `EXTRA`/`IGNORE` are exempt: many columns legitimately land there.
 */
export function findDuplicateMappings(mapping: ColumnMapping): { field: CoreFieldKey; headers: string[] }[] {
  const byField = new Map<CoreFieldKey, string[]>();
  for (const [header, target] of Object.entries(mapping)) {
    if (target === "EXTRA" || target === "IGNORE") continue;
    const headers = byField.get(target) ?? [];
    headers.push(header);
    byField.set(target, headers);
  }
  return Array.from(byField.entries())
    .filter(([, headers]) => headers.length > 1)
    .map(([field, headers]) => ({ field, headers }));
}

export function applyMapping(
  row: Record<string, string>,
  mapping: ColumnMapping,
): { core: Record<string, string>; extra: Record<string, string> } {
  const core: Record<string, string> = {};
  const extra: Record<string, string> = {};

  for (const [header, value] of Object.entries(row)) {
    const target = mapping[header];
    if (!target || target === "IGNORE") continue;
    if (target === "EXTRA") {
      if (value !== "") extra[header] = value;
      continue;
    }
    core[target] = value;
  }

  return { core, extra };
}

const URL_PATTERN = /^https?:\/\/\S+$/i;

/**
 * An unmapped ("EXTRA") column commonly turns out to be a link the
 * source system exported for a photo/CV/certificate/ID document —
 * there's no dedicated "document" mapping target for an admin to pick
 * in the wizard, so these always land in `EXTRA` today. Left as-is, a
 * document link is stored as an opaque string in `essayAnswers` and
 * rendered as unreadable, unclickable plain text (and, for anything
 * long enough with no natural break point, visually overflows its
 * container). Splitting URL-shaped extra values out into
 * `ApplicationDocument` rows — the table this schema already has for
 * exactly this purpose, unused until now — means they render as an
 * actual clickable link in the existing "Documents" card instead.
 * Column header becomes the document's `type`/`fileName` — there's no
 * existing fixed vocabulary for `type` to match (this table had zero
 * writers before this), so the header is the most meaningful label
 * available.
 */
export function splitExtraIntoTextAndDocuments(extra: Record<string, string>): {
  essayAnswers: Record<string, string>;
  documents: { type: string; fileName: string; storageKey: string }[];
} {
  const essayAnswers: Record<string, string> = {};
  const documents: { type: string; fileName: string; storageKey: string }[] = [];

  for (const [header, value] of Object.entries(extra)) {
    const trimmed = value.trim();
    if (URL_PATTERN.test(trimmed)) {
      documents.push({ type: header, fileName: header, storageKey: trimmed });
    } else {
      essayAnswers[header] = value;
    }
  }

  return { essayAnswers, documents };
}
