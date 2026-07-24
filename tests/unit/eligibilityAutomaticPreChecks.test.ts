import { describe, expect, it } from "vitest";

import { evaluateBaselineItem, evaluateDocumentItem, evaluateIntegrityItem, type PreCheckContext } from "@/modules/eligibility/automaticPreChecks";

const baseCtx: PreCheckContext = {
  applicant: { nationality: null, nyscStatus: "NOT_RECORDED", nyscCompletionDate: null },
  application: { pathway: null, submittedAt: null, availabilityDeclared: null },
  documentTypes: [],
  essayAnswerKeys: [],
  applicationClosesAt: null,
  hasExactDuplicate: false,
};

describe("evaluateDocumentItem", () => {
  it("suggests PASS when a matching document type is on file", () => {
    const ctx = { ...baseCtx, documentTypes: ["NYSC Document View Link"] };
    expect(evaluateDocumentItem("NYSC_EVIDENCE", ctx)?.status).toBe("PASS");
  });

  it("suggests CLARIFY when no matching document exists", () => {
    expect(evaluateDocumentItem("CV", baseCtx)?.status).toBe("CLARIFY");
  });

  it("also matches a personal statement arriving as an essay-answer key, not a document", () => {
    const ctx = { ...baseCtx, essayAnswerKeys: ["Personal Statement"] };
    expect(evaluateDocumentItem("PERSONAL_STATEMENT", ctx)?.status).toBe("PASS");
  });

  it("pathway selection: PASS for a single recognised pathway", () => {
    const ctx = { ...baseCtx, application: { ...baseCtx.application, pathway: "Entrepreneurship & Enterprise" } };
    expect(evaluateDocumentItem("LEADERSHIP_PATHWAY_SELECTION", ctx)).toEqual({
      status: "PASS",
      detail: expect.stringContaining("Entrepreneurship & Enterprise"),
    });
  });

  it("pathway selection: FAIL when more than one pathway appears to be recorded", () => {
    const ctx = { ...baseCtx, application: { ...baseCtx.application, pathway: "Entrepreneurship, Academia" } };
    expect(evaluateDocumentItem("LEADERSHIP_PATHWAY_SELECTION", ctx)?.status).toBe("FAIL");
  });

  it("pathway selection: CLARIFY when nothing is recorded", () => {
    expect(evaluateDocumentItem("LEADERSHIP_PATHWAY_SELECTION", baseCtx)?.status).toBe("CLARIFY");
  });
});

describe("evaluateBaselineItem", () => {
  it("Nigerian citizen: CLARIFY with no declared nationality", () => {
    expect(evaluateBaselineItem("NIGERIAN_CITIZEN", baseCtx)?.status).toBe("CLARIFY");
  });

  it("Nigerian citizen: PASS when declared Nigerian", () => {
    const ctx = { ...baseCtx, applicant: { ...baseCtx.applicant, nationality: "Nigerian" } };
    expect(evaluateBaselineItem("NIGERIAN_CITIZEN", ctx)?.status).toBe("PASS");
  });

  it("Nigerian citizen: CLARIFY (never an automatic FAIL) for a non-Nigerian declaration", () => {
    const ctx = { ...baseCtx, applicant: { ...baseCtx.applicant, nationality: "Ghanaian" } };
    expect(evaluateBaselineItem("NIGERIAN_CITIZEN", ctx)?.status).toBe("CLARIFY");
  });

  it("NYSC status: CLARIFY when not recorded", () => {
    expect(evaluateBaselineItem("NYSC_STATUS", baseCtx)?.status).toBe("CLARIFY");
  });

  it("NYSC status: PASS for any recorded status", () => {
    const ctx = { ...baseCtx, applicant: { ...baseCtx.applicant, nyscStatus: "CURRENTLY_SERVING" as const } };
    expect(evaluateBaselineItem("NYSC_STATUS", ctx)?.status).toBe("PASS");
  });

  it("programme availability: FAIL when the applicant declared they cannot participate", () => {
    const ctx = { ...baseCtx, application: { ...baseCtx.application, availabilityDeclared: false } };
    expect(evaluateBaselineItem("PROGRAMME_AVAILABILITY", ctx)?.status).toBe("FAIL");
  });

  it("submitted within deadline: PASS when submitted before the deadline", () => {
    const ctx = {
      ...baseCtx,
      application: { ...baseCtx.application, submittedAt: new Date("2026-01-01") },
      applicationClosesAt: new Date("2026-02-01"),
    };
    expect(evaluateBaselineItem("SUBMITTED_WITHIN_DEADLINE", ctx)?.status).toBe("PASS");
  });

  it("submitted within deadline: FAIL when submitted after the deadline", () => {
    const ctx = {
      ...baseCtx,
      application: { ...baseCtx.application, submittedAt: new Date("2026-03-01") },
      applicationClosesAt: new Date("2026-02-01"),
    };
    expect(evaluateBaselineItem("SUBMITTED_WITHIN_DEADLINE", ctx)?.status).toBe("FAIL");
  });

  it("returns null (no automatic suggestion) for explicitly human-judgement items", () => {
    expect(evaluateBaselineItem("LEADERSHIP_POTENTIAL", baseCtx)).toBeNull();
    expect(evaluateBaselineItem("ETHICAL_ORIENTATION", baseCtx)).toBeNull();
    expect(evaluateBaselineItem("MIN_QUALIFICATION", baseCtx)).toBeNull();
  });
});

describe("evaluateIntegrityItem", () => {
  it("duplicate application: FLAG when an exact match exists", () => {
    const ctx = { ...baseCtx, hasExactDuplicate: true };
    expect(evaluateIntegrityItem("DUPLICATE_APPLICATION", ctx)?.status).toBe("FLAG");
  });

  it("duplicate application: CLEAR when no exact match exists", () => {
    expect(evaluateIntegrityItem("DUPLICATE_APPLICATION", baseCtx)?.status).toBe("CLEAR");
  });

  it("returns null for explicitly human-judgement integrity items", () => {
    expect(evaluateIntegrityItem("NAME_CONSISTENCY", baseCtx)).toBeNull();
    expect(evaluateIntegrityItem("DOCUMENT_READABILITY", baseCtx)).toBeNull();
  });
});
