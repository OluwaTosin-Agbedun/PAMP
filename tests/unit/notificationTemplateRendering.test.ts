import { describe, expect, it } from "vitest";

import { extractPlaceholders, renderTemplate } from "@/modules/notifications/domain/templateRendering";

describe("renderTemplate", () => {
  it("substitutes every known placeholder", () => {
    const result = renderTemplate(
      { subject: "Hi {{applicantFirstName}}", body: "Your interview is on {{interviewDate}}." },
      { applicantFirstName: "Ada", interviewDate: "12 August" },
    );
    expect(result.subject).toBe("Hi Ada");
    expect(result.body).toBe("Your interview is on 12 August.");
    expect(result.missingVariables).toEqual([]);
  });

  it("leaves a placeholder literally in place and reports it as missing, rather than silently dropping it", () => {
    const result = renderTemplate({ subject: "Hi {{applicantFirstName}}", body: "Body" }, {});
    expect(result.subject).toBe("Hi {{applicantFirstName}}");
    expect(result.missingVariables).toEqual(["applicantFirstName"]);
  });

  it("tolerates whitespace inside the braces", () => {
    const result = renderTemplate({ subject: "Hi {{ applicantFirstName }}", body: "" }, { applicantFirstName: "Ada" });
    expect(result.subject).toBe("Hi Ada");
  });

  it("does not treat unrelated double braces as anything special", () => {
    const result = renderTemplate({ subject: "Cost: {{amount}} {not a placeholder}", body: "" }, { amount: "10" });
    expect(result.subject).toBe("Cost: 10 {not a placeholder}");
  });
});

describe("extractPlaceholders", () => {
  it("finds every distinct placeholder across subject and body", () => {
    const found = extractPlaceholders({
      subject: "Hi {{applicantFirstName}}",
      body: "See you on {{interviewDate}} — {{applicantFirstName}} again",
    });
    expect(found.sort()).toEqual(["applicantFirstName", "interviewDate"]);
  });

  it("returns an empty array for plain text", () => {
    expect(extractPlaceholders({ subject: "Hello", body: "No placeholders here." })).toEqual([]);
  });
});
