import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      "server-only": fileURLToPath(new URL("./tests/mocks/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    // Integration tests share one real Postgres instance and mutate
    // rows scoped to their own test-only email domain (see
    // tests/helpers/db.ts) — running them concurrently is safe for data
    // isolation, but keep it serial for simplicity and predictable
    // audit-log assertions.
    fileParallelism: false,
  },
});
