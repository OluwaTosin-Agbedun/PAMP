/**
 * Pure template rendering — no I/O, mirrors this codebase's established
 * "pure calculation function" convention (interviewScoring.ts,
 * scoringThreshold.ts, interviewQuestions.ts). `{{variableName}}`
 * placeholders only — deliberately not a templating engine with
 * conditionals/loops/expressions, since Configuration Centre §5.4
 * explicitly requires "Do not allow administrators to place unsafe
 * executable content in templates." A wider syntax would widen what an
 * administrator-edited template could do.
 */

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export type RenderedTemplate = {
  subject: string;
  body: string;
  /** Placeholders present in the template but missing from `variables` — surfaced so a caller can fail loudly rather than send a message with a literal "{{missingVar}}" in it. */
  missingVariables: string[];
};

function render(text: string, variables: Record<string, string>, missing: Set<string>): string {
  return text.replace(PLACEHOLDER_PATTERN, (match, name: string) => {
    if (!(name in variables)) {
      missing.add(name);
      return match;
    }
    return variables[name];
  });
}

export function renderTemplate(
  template: { subject: string; body: string },
  variables: Record<string, string>,
): RenderedTemplate {
  const missing = new Set<string>();
  const subject = render(template.subject, variables, missing);
  const body = render(template.body, variables, missing);
  return { subject, body, missingVariables: [...missing] };
}

/** Every placeholder a template's subject+body actually reference — used to validate a template against an event's declared variable list before it's saved. */
export function extractPlaceholders(template: { subject: string; body: string }): string[] {
  const found = new Set<string>();
  for (const text of [template.subject, template.body]) {
    for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
      found.add(match[1]);
    }
  }
  return [...found];
}
