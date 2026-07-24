/**
 * The PAM-P 2026 Eligibility Screening Checklist, verbatim — 8 required
 * documents, 8 baseline eligibility items, 6 consistency/integrity
 * checks. Code-defined rather than database-configurable (the same
 * "central catalogue" pattern `lib/permissions/catalog.ts` uses, per
 * docs/RBAC.md's own rationale for that choice): the checklist itself is
 * an approved, fixed programme document, not something an admin screen
 * should be able to reshape.
 */

export type ChecklistItemDefinition = {
  key: string;
  label: string;
  evidence: string;
};

export const DOCUMENT_ITEMS: ChecklistItemDefinition[] = [
  { key: "CV", label: "CV", evidence: "Uploaded CV showing education, experience, activities, and leadership evidence" },
  { key: "DEGREE_CERTIFICATE", label: "Degree Certificate", evidence: "BSc, HND, or equivalent accepted certificate" },
  { key: "NYSC_EVIDENCE", label: "NYSC Evidence", evidence: "Discharge certificate, exemption, exclusion, or current service evidence" },
  { key: "VALID_ID_CARD", label: "Valid ID Card", evidence: "National ID, voter card, passport, driver licence, or accepted government ID" },
  { key: "PASSPORT_PHOTOGRAPH", label: "Passport Photograph", evidence: "Clear recent passport photograph for administrative identification" },
  { key: "PERSONAL_STATEMENT", label: "Personal Statement", evidence: "Written personal statement submitted through the portal" },
  { key: "MOTIVATION_FOR_APPLYING", label: "Motivation for Applying", evidence: "Written motivation statement submitted through the portal" },
  { key: "LEADERSHIP_PATHWAY_SELECTION", label: "Leadership Pathway Selection", evidence: "Only one primary pathway selected" },
];

export const BASELINE_ITEMS: ChecklistItemDefinition[] = [
  { key: "NIGERIAN_CITIZEN", label: "Nigerian citizen", evidence: "Valid ID card and application declaration" },
  { key: "MIN_QUALIFICATION", label: "Minimum BSc or HND", evidence: "Degree certificate uploaded and readable" },
  { key: "NYSC_STATUS", label: "NYSC completed or currently serving", evidence: "NYSC certificate, exemption/exclusion, or current service evidence" },
  { key: "FIVE_YEAR_RULE", label: "Not more than five years post-NYSC", evidence: "NYSC date and CV timeline" },
  { key: "LEADERSHIP_POTENTIAL", label: "Leadership potential indicated", evidence: "CV, personal statement, motivation response" },
  { key: "ETHICAL_ORIENTATION", label: "Ethical orientation or service mindset indicated", evidence: "Written responses and service examples" },
  { key: "PROGRAMME_AVAILABILITY", label: "Available for programme requirements", evidence: "Applicant declaration or motivation response" },
  { key: "SUBMITTED_WITHIN_DEADLINE", label: "Application submitted within deadline", evidence: "Portal submission timestamp" },
];

export const INTEGRITY_ITEMS: ChecklistItemDefinition[] = [
  { key: "NAME_CONSISTENCY", label: "Name consistency", evidence: "Names match or can be reasonably reconciled across uploaded documents" },
  { key: "DATE_CONSISTENCY", label: "Date consistency", evidence: "Graduation, NYSC, employment, and activity dates are reasonable" },
  { key: "DOCUMENT_READABILITY", label: "Document readability", evidence: "Documents are clear enough to verify" },
  { key: "POSSIBLE_ALTERATION", label: "Possible alteration", evidence: "No obvious manipulation, cropping, overwriting, or suspicious formatting" },
  { key: "DUPLICATE_APPLICATION", label: "Duplicate application", evidence: "No repeated application under the same name, email, phone, or ID" },
  { key: "WRITTEN_RESPONSE_AUTHENTICITY", label: "Written response authenticity", evidence: "Responses are specific, coherent, and not obviously copied or generic" },
];

export const CHECKLIST_SECTIONS = {
  DOCUMENT: { label: "Required Application Documents", items: DOCUMENT_ITEMS, statuses: ["PASS", "FAIL", "CLARIFY"] as const },
  BASELINE: { label: "Baseline Eligibility Requirements", items: BASELINE_ITEMS, statuses: ["PASS", "FAIL", "CLARIFY"] as const },
  INTEGRITY: { label: "Consistency and Integrity Checks", items: INTEGRITY_ITEMS, statuses: ["CLEAR", "FLAG", "CLARIFY"] as const },
} as const;

export type ChecklistSectionKey = keyof typeof CHECKLIST_SECTIONS;

export const ALL_CHECKLIST_ITEMS: { section: ChecklistSectionKey; item: ChecklistItemDefinition }[] = (
  Object.entries(CHECKLIST_SECTIONS) as [ChecklistSectionKey, (typeof CHECKLIST_SECTIONS)[ChecklistSectionKey]][]
).flatMap(([section, def]) => def.items.map((item) => ({ section, item })));

export function isKnownChecklistItem(section: string, itemKey: string): boolean {
  return ALL_CHECKLIST_ITEMS.some((entry) => entry.section === section && entry.item.key === itemKey);
}
