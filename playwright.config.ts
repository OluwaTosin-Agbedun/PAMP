import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the Phase 3D acceptance criteria's Playwright
 * requirement. Runs against a `next dev` server this config launches
 * itself (`webServer`), against the same real Postgres instance every
 * other test in this repo uses — fixtures are seeded/torn down directly
 * via Prisma in each spec's own setup, the same pattern
 * `tests/integration/*.test.ts` already uses, not a mocked backend.
 *
 * The pre-installed Chromium at a fixed path (this sandboxed dev
 * environment's own setup — see AGENTS.md) is used only when it actually
 * exists; CI and any other machine fall back to Playwright's own
 * browser resolution (`npx playwright install --with-deps chromium`;
 * see `.github/workflows/accessibility.yml`) instead of failing on a
 * path that's specific to this one environment.
 */
const SANDBOX_CHROMIUM_PATH = "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    launchOptions: existsSync(SANDBOX_CHROMIUM_PATH) ? { executablePath: SANDBOX_CHROMIUM_PATH } : {},
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
