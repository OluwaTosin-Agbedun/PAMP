import { describe, expect, it } from "vitest";

import { findDuplicateMappings, splitExtraIntoTextAndDocuments, suggestMapping } from "@/modules/import/mapping";

describe("splitExtraIntoTextAndDocuments", () => {
  it("routes a URL-shaped value to documents, keyed by its column header", () => {
    const { essayAnswers, documents } = splitExtraIntoTextAndDocuments({
      "Passport Photo": "https://example-storage.co/storage/v1/object/sign/passport.jpg?token=abc",
      Motivation: "I want to join this programme because...",
    });

    expect(documents).toEqual([
      {
        type: "Passport Photo",
        fileName: "Passport Photo",
        storageKey: "https://example-storage.co/storage/v1/object/sign/passport.jpg?token=abc",
      },
    ]);
    expect(essayAnswers).toEqual({ Motivation: "I want to join this programme because..." });
  });

  it("leaves non-URL text in essayAnswers untouched", () => {
    const { essayAnswers, documents } = splitExtraIntoTextAndDocuments({
      "Extra Notes": "Referred by a mentor, no document link here.",
    });
    expect(documents).toEqual([]);
    expect(essayAnswers).toEqual({ "Extra Notes": "Referred by a mentor, no document link here." });
  });

  it("trims surrounding whitespace before detecting a URL", () => {
    const { documents } = splitExtraIntoTextAndDocuments({ CV: "  https://example.com/cv.pdf  " });
    expect(documents).toEqual([{ type: "CV", fileName: "CV", storageKey: "https://example.com/cv.pdf" }]);
  });

  it("rejects a value that merely contains a URL alongside other text", () => {
    const { essayAnswers, documents } = splitExtraIntoTextAndDocuments({
      Notes: "See https://example.com/cv.pdf for my CV",
    });
    expect(documents).toEqual([]);
    expect(essayAnswers).toEqual({ Notes: "See https://example.com/cv.pdf for my CV" });
  });

  it("handles an empty input", () => {
    expect(splitExtraIntoTextAndDocuments({})).toEqual({ essayAnswers: {}, documents: [] });
  });
});

describe("suggestMapping", () => {
  it("root-cause regression: never matches a short alias as a mere substring of an unrelated header", () => {
    const mapping = suggestMapping([
      "Personal Statement", // contains "state" — must not become stateOfOrigin
      "Referee 1 Name", // contains "ref" — must not become externalRef
      "Middle Name", // contains "id" — must not become externalRef
      "Residential Address", // contains "id" — must not become externalRef
      "How Did You Hear", // contains "id" (in "did") — must not become externalRef
    ]);

    expect(mapping["Personal Statement"]).toBe("EXTRA");
    expect(mapping["Referee 1 Name"]).toBe("EXTRA");
    expect(mapping["Middle Name"]).toBe("EXTRA");
    expect(mapping["Residential Address"]).toBe("EXTRA");
    expect(mapping["How Did You Hear"]).toBe("EXTRA");
  });

  it("when several columns all word-match one field, picks the single most specific one and leaves the rest EXTRA instead of suggesting a conflict", () => {
    const phoneMapping = suggestMapping(["Phone", "Referee 1 Phone", "Referee 2 Phone"]);
    expect(phoneMapping["Phone"]).toBe("phone"); // exact match wins
    expect(phoneMapping["Referee 1 Phone"]).toBe("EXTRA");
    expect(phoneMapping["Referee 2 Phone"]).toBe("EXTRA");
    expect(findDuplicateMappings(phoneMapping)).toEqual([]);

    const nyscMapping = suggestMapping(["NYSC Status", "NYSC Year", "NYSC Call-up Number", "NYSC Document View Link"]);
    expect(nyscMapping["NYSC Status"]).toBe("nyscStatus"); // exact match on "nysc status" wins
    expect(nyscMapping["NYSC Year"]).toBe("EXTRA");
    expect(nyscMapping["NYSC Call-up Number"]).toBe("EXTRA");
    expect(nyscMapping["NYSC Document View Link"]).toBe("EXTRA"); // becomes a document via URL auto-detection
    expect(findDuplicateMappings(nyscMapping)).toEqual([]);
  });

  it("still matches legitimate headers as whole words", () => {
    const mapping = suggestMapping(["State of Origin", "NYSC Status", "First Name", "Email Address", "Application ID"]);

    expect(mapping["State of Origin"]).toBe("stateOfOrigin");
    expect(mapping["NYSC Status"]).toBe("nyscStatus");
    expect(mapping["First Name"]).toBe("firstName");
    expect(mapping["Email Address"]).toBe("email");
    expect(mapping["Application ID"]).toBe("externalRef");
  });

  it("real-world regression: the exact PAM-P 2026 export header set never produces a conflicting suggestion", () => {
    const mapping = suggestMapping([
      "Application ID",
      "Status",
      "Date Applied",
      "First Name",
      "Middle Name",
      "Last Name",
      "Email Address",
      "Phone",
      "Gender",
      "Date of Birth",
      "State of Origin",
      "Nationality",
      "Institution Name",
      "Course of Study",
      "Graduation Year",
      "Degree Class",
      "Highest Qualification",
      "Pathway",
      "NYSC Status",
      "NYSC Year",
      "NYSC State",
      "NYSC Call-up Number",
      "NYSC Document View Link",
      "Employment Status",
      "Current Employer",
      "Job Title",
      "Years of Experience",
      "Motivation",
      "Logistical Needs",
      "How Did You Hear",
      "Residential Address",
      "Referee 1 Name",
      "Referee 1 Org",
      "Referee 1 Phone",
      "Referee 1 Email Address",
      "Referee 2 Name",
      "Referee 2 Org",
      "Referee 2 Phone",
      "Referee 2 Email Address",
      "CV / Résumé View Link",
      "Professional Photograph View Link",
      "Educational Qualification Certificate View Link",
      "Government-issued ID View Link",
      "Additional Supporting Document View Link",
    ]);

    expect(findDuplicateMappings(mapping)).toEqual([]);

    // The columns that actually should win each field:
    expect(mapping["Application ID"]).toBe("externalRef");
    expect(mapping["First Name"]).toBe("firstName");
    expect(mapping["Last Name"]).toBe("lastName");
    expect(mapping["Email Address"]).toBe("email");
    expect(mapping["Phone"]).toBe("phone");
    expect(mapping["State of Origin"]).toBe("stateOfOrigin");
    expect(mapping["NYSC Status"]).toBe("nyscStatus");

    // The columns that lost the tie must fall back to EXTRA, not a stolen field:
    expect(mapping["Referee 1 Phone"]).toBe("EXTRA");
    expect(mapping["Referee 2 Phone"]).toBe("EXTRA");
    expect(mapping["Referee 1 Email Address"]).toBe("EXTRA");
    expect(mapping["Referee 2 Email Address"]).toBe("EXTRA");
    expect(mapping["NYSC State"]).toBe("EXTRA");
    expect(mapping["NYSC Year"]).toBe("EXTRA");
    expect(mapping["NYSC Call-up Number"]).toBe("EXTRA");
    expect(mapping["NYSC Document View Link"]).toBe("EXTRA");
    expect(mapping["Government-issued ID View Link"]).toBe("EXTRA");
    expect(mapping["Middle Name"]).toBe("EXTRA");
    expect(mapping["Residential Address"]).toBe("EXTRA");
    expect(mapping["How Did You Hear"]).toBe("EXTRA");
  });
});

describe("findDuplicateMappings", () => {
  it("flags multiple columns mapped to the same core field", () => {
    const duplicates = findDuplicateMappings({
      "Middle Name": "externalRef",
      "Application ID": "externalRef",
      Email: "email",
    });
    expect(duplicates).toEqual([{ field: "externalRef", headers: ["Middle Name", "Application ID"] }]);
  });

  it("does not flag EXTRA or IGNORE even when many columns share them", () => {
    const duplicates = findDuplicateMappings({
      "Job Title": "EXTRA",
      "Degree Class": "EXTRA",
      Notes: "IGNORE",
      Comments: "IGNORE",
    });
    expect(duplicates).toEqual([]);
  });

  it("returns an empty array for a clean one-to-one mapping", () => {
    expect(findDuplicateMappings({ "First Name": "firstName", "Last Name": "lastName" })).toEqual([]);
  });
});
