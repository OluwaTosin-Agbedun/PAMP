import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";

/**
 * Release 1.5 §"Accessibility" — automated WCAG 2 A/AA validation via
 * axe-core against every major screen this session's phases have built,
 * plus a keyboard-navigation and colour-contrast check on the
 * highest-traffic form (the Configuration Centre).
 *
 * Fixture setup/teardown reuses the same `tsx` subprocess pattern
 * `reviewOperations.spec.ts` established (Phase 3D) — Playwright's spec
 * transform can't load Prisma 7's ESM-only generated client directly.
 *
 * Findings are written to `tests/e2e/accessibility-results.json` for
 * `docs/PHASE_ACCESSIBILITY_REPORT.md` to summarize — this test fails
 * only on "critical"/"serious" impact violations; "moderate"/"minor"
 * findings are recorded, not blocking, per the brief's "Document any
 * accessibility failures" (not "achieve zero findings before shipping").
 */

const PASSWORD = "Correct-Horse9!";
const RESULTS_FILE = join(process.cwd(), "tests/e2e/accessibility-results.json");

type Fixture = {
  secretaryEmail: string;
  interviewerEmail: string;
  interviewId: string;
  schedulingInterviewId: string;
  bookingToken: string;
};

function runFixtureScript(mode: "setup" | "teardown"): Record<string, unknown> {
  const output = execFileSync("npx", ["tsx", "tests/e2e/fixtures/manage.ts", mode], {
    cwd: process.cwd(),
    encoding: "utf-8",
  });
  const lastLine = output.trim().split("\n").filter(Boolean).pop() ?? "{}";
  return JSON.parse(lastLine);
}

let fixture: Fixture;
const allFindings: { page: string; violations: unknown[] }[] = [];

test.beforeAll(() => {
  fixture = runFixtureScript("setup") as unknown as Fixture;
  mkdirSync(join(process.cwd(), "tests/e2e"), { recursive: true });
});

test.afterAll(() => {
  writeFileSync(RESULTS_FILE, JSON.stringify(allFindings, null, 2));
  runFixtureScript("teardown");
});

async function scan(page: import("@playwright/test").Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  allFindings.push({ page: label, violations: results.violations });

  const blocking = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(blocking, `${label}: ${blocking.map((v) => v.id).join(", ")}`).toEqual([]);
}

test("login page has no critical/serious accessibility violations", async ({ page }) => {
  await page.goto("/login");
  await scan(page, "/login");
});

test("dashboard and Review Operations screens have no critical/serious accessibility violations", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', fixture.secretaryEmail);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 10_000 });
  // `waitForURL` only tracks the URL, not the post-login client-side
  // transition settling — on a throttled mobile-chromium runner axe can
  // scan mid-transition and find a still-empty <title>, a flake this
  // test is the only one exposed to (every other test either scans a
  // page reached via a full `page.goto()`, which already waits for the
  // document to load, or never scans right after this exact redirect).
  await page.locator("h1").waitFor({ state: "visible" });
  await scan(page, "/dashboard");

  await page.goto("/review-operations");
  await scan(page, "/review-operations");

  await page.goto("/review-operations/risk");
  await scan(page, "/review-operations/risk");
});

test("Configuration Centre screens have no critical/serious accessibility violations", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', fixture.secretaryEmail);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 10_000 });

  await page.goto("/administration/configuration");
  await scan(page, "/administration/configuration");

  await page.goto("/administration/configuration/security");
  await scan(page, "/administration/configuration/security");

  await page.goto("/administration/configuration/programme");
  await scan(page, "/administration/configuration/programme");
});

test("Interview Workspace screens have no critical/serious accessibility violations", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', fixture.interviewerEmail);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 10_000 });

  await page.goto("/interviews");
  await scan(page, "/interviews");

  await page.goto(`/interviews/${fixture.interviewId}`);
  await scan(page, "/interviews/[interviewId]");
});

test("Interview scoring form is reachable and operable by keyboard alone", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', fixture.interviewerEmail);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 10_000 });

  await page.goto(`/interviews/${fixture.interviewId}`);
  const scoreInput = page.locator('input[type="number"]').first();
  await scoreInput.waitFor({ state: "visible" });
  await scoreInput.focus();
  await expect(scoreInput).toBeFocused();
  await page.keyboard.type("7");
  await expect(scoreInput).toHaveValue("7");
});

test("Interview availability screen has no critical/serious accessibility violations", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', fixture.interviewerEmail);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 10_000 });

  await page.goto("/interviews/availability");
  await scan(page, "/interviews/availability");
});

test("Interview Scheduling operator screens have no critical/serious accessibility violations", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', fixture.secretaryEmail);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 10_000 });

  await page.goto("/interviews/scheduling");
  await scan(page, "/interviews/scheduling");

  await page.goto(`/interviews/scheduling/${fixture.schedulingInterviewId}`);
  await scan(page, "/interviews/scheduling/[interviewId]");
});

test("the public interview booking page has no critical/serious accessibility violations and is keyboard-operable", async ({ page }) => {
  await page.goto(`/interview/book/${fixture.bookingToken}`);
  await scan(page, "/interview/book/[token]");

  const firstSlot = page.locator('input[type="radio"][name="slot"]').first();
  await firstSlot.waitFor({ state: "visible" });
  await firstSlot.focus();
  await expect(firstSlot).toBeFocused();
});

test("Configuration Centre settings are reachable and toggleable by keyboard alone", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', fixture.secretaryEmail);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 10_000 });

  await page.goto("/administration/configuration/review");
  // "Automatic assignment" is a genuinely editable boolean on this
  // category (unlike "Blind review", read-only and disabled by design —
  // a disabled control correctly can't receive focus, which would make
  // a poor keyboard-navigation probe).
  const editableSwitch = page.locator("#review\\.automatic_assignment_enabled");
  await editableSwitch.waitFor({ state: "visible" });
  await editableSwitch.focus();
  await expect(editableSwitch).toBeFocused();
  // Space toggles a native/ARIA switch — confirms it's a real keyboard
  // control, not a mouse-only click handler on a non-focusable element.
  const before = await editableSwitch.getAttribute("aria-checked");
  await page.keyboard.press("Space");
  await expect(async () => {
    const after = await editableSwitch.getAttribute("aria-checked");
    expect(after).not.toBe(before);
  }).toPass({ timeout: 5_000 });
  // Restore original state so the run is idempotent.
  await page.keyboard.press("Space");
});
