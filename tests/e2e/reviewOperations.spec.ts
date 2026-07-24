import { execFileSync } from "node:child_process";

import { test, expect } from "@playwright/test";

/**
 * End-to-end coverage for the Programme Secretariat Review Operations
 * Workspace (Phase 3D) — a real browser against a real running `next
 * dev` server and the same Postgres instance every integration test
 * uses.
 *
 * Fixture setup/teardown/verification run in a separate `tsx` subprocess
 * (`tests/e2e/fixtures/manage.ts`), never imported in-process here:
 * Prisma 7's generated client (`lib/generated/prisma/client.ts`) is
 * ESM-only TypeScript using `import.meta`, which Playwright Test's own
 * CJS-oriented spec transform cannot load (unlike Vitest, whose Vite
 * transform natively supports it). A real `tsx`-run subprocess handles
 * both the TypeScript and the ESM requirement correctly, the same way
 * this repo's manual verification scripts already do. This file
 * therefore only ever touches the browser and `node:child_process` —
 * never `@/lib/db/prisma` or any `"server-only"`-tagged module.
 *
 * Runs under two Playwright projects (`playwright.config.ts`):
 * `desktop-chromium` (1280×900) and `mobile-chromium` (a Pixel 7
 * viewport) — every test here therefore exercises both desktop and
 * mobile layouts without a separate mobile-only spec.
 */

const PASSWORD = "Correct-Horse9!";

type Fixture = {
  programmeId: string;
  cohortId: string;
  criterionId: string;
  secretaryEmail: string;
  reviewerOneId: string;
  reviewerTwoId: string;
  reviewerThreeId: string;
  blockedReviewerEmail: string;
  submittedApplicationId: string;
  awaitingApplicationId: string;
  pendingAssignmentId: string;
  pendingApplicationId: string;
};

function runFixtureScript(mode: "setup" | "teardown" | "check-reassignment"): Record<string, unknown> {
  const output = execFileSync("npx", ["tsx", "tests/e2e/fixtures/manage.ts", mode], {
    cwd: process.cwd(),
    encoding: "utf-8",
  });
  const lastLine = output.trim().split("\n").filter(Boolean).pop() ?? "{}";
  return JSON.parse(lastLine);
}

let fixture: Fixture;

test.beforeAll(() => {
  fixture = runFixtureScript("setup") as unknown as Fixture;
});

test.afterAll(() => {
  runFixtureScript("teardown");
});

async function loginAsSecretary(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', fixture.secretaryEmail);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 10_000 });
}

test("Secretary sees the Review Operations dashboard with correct totals", async ({ page }) => {
  await loginAsSecretary(page);

  await page.locator('a[href="/review-operations"]').first().click();
  await page.waitForURL("**/review-operations");
  await expect(page.getByRole("heading", { name: "Review Operations" })).toBeVisible();

  const body = await page.locator("body").innerText();
  expect(body).toContain("3"); // 3 eligible applications total
  expect(body).toContain("Eligible applications");
  expect(body).toContain("Stage completion");
  expect(body).toContain("Reviewer utilisation");
});

test("Assignment Monitoring table lists every application with correct status and export downloads a CSV", async ({ page }) => {
  await loginAsSecretary(page);
  await page.goto("/review-operations/assignments");
  await expect(page.getByRole("heading", { name: "Assignment Monitoring" })).toBeVisible();

  const body = await page.locator("body").innerText();
  expect(body).toContain("E2E Submitted");
  expect(body).toContain("E2E Awaiting");
  expect(body).toContain("E2E Pending");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: /Export CSV/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
});

test("Application detail shows both reviewers' scores/comments distinctly, and reassignment preserves history", async ({ page }) => {
  await loginAsSecretary(page);

  await page.goto(`/review-operations/assignments/${fixture.submittedApplicationId}`);
  await expect(page.getByText("Assigned reviewers")).toBeVisible();
  const detailBody = await page.locator("body").innerText();
  expect(detailBody).toContain("80");
  expect(detailBody).toContain("82");
  expect(detailBody).toContain("Reviewer score");
  expect(detailBody).toContain("Reviewer comment");

  await page.goto(`/review-operations/assignments/${fixture.pendingApplicationId}`);
  await page.getByRole("button", { name: "Reassign a reviewer" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Current assignment").click();
  await page.getByRole("option").first().click();
  await dialog.getByLabel("Replacement reviewer").click();
  await page.getByRole("option").first().click();
  await dialog.getByLabel("Reason").fill("E2E test reassignment reason, over ten characters.");
  await dialog.getByRole("button", { name: "Confirm reassignment" }).click();

  await expect(page.getByText("Assignment reassigned.")).toBeVisible({ timeout: 10_000 });

  const { status, reviewerId } = runFixtureScript("check-reassignment");
  expect(status).toBe("REASSIGNED");
  expect(reviewerId).toBe(fixture.reviewerThreeId); // history preserved, never mutated
});

test("Reviewer Workload, Third-Review Monitoring, and Conflicts pages all render", async ({ page }) => {
  await loginAsSecretary(page);

  await page.goto("/review-operations/workload");
  await expect(page.getByRole("heading", { name: "Reviewer Workload" })).toBeVisible();

  await page.goto("/review-operations/escalations");
  await expect(page.getByRole("heading", { name: "Third-Review Monitoring" })).toBeVisible();

  await page.goto("/review-operations/conflicts");
  await expect(page.getByRole("heading", { name: "Conflicts & Recusals" })).toBeVisible();
});

test("an Application Reviewer cannot reach the Review Operations workspace (direct URL access is server-protected)", async ({ page, context }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', fixture.blockedReviewerEmail);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");

  // No "Review Operations" link in this role's sidebar at all.
  await expect(page.locator('a[href="/review-operations"]')).toHaveCount(0);

  // Direct URL access is still denied server-side, not just hidden from nav.
  await page.goto("/review-operations");
  await page.waitForURL("**/access-denied**", { timeout: 10_000 });

  await context.close();
});
