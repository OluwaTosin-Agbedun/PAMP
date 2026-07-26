import "dotenv/config";

import { runSeed } from "./seed";

async function main() {
  const name = process.env.SEED_ADMIN_NAME;
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!name || !email || !password) {
    throw new Error(
      "SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, and SEED_ADMIN_PASSWORD must be set to seed the bootstrap System Administrator.",
    );
  }

  await runSeed({ name, email, password }, Number(process.env.SEED_COHORT_YEAR ?? "2026"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
