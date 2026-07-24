-- Phase 3B.1: split Role.REVIEWER into ELIGIBILITY_REVIEWER and
-- APPLICATION_REVIEWER (docs/ROLE_AND_NAVIGATION_RECONCILIATION.md,
-- docs/adr/ADR-0009-role-vocabulary-and-navigation-taxonomy.md).
--
-- Postgres enums have no ALTER TYPE ... DROP VALUE — a value can only be
-- removed by creating a replacement type with the correct value set,
-- migrating every column that uses it, dropping the old type, and
-- renaming the new one into its place. "Role" is used by exactly one
-- column ("users"."role"), so this is a single ALTER COLUMN ... USING.
--
-- Every existing "REVIEWER" row is backfilled to "APPLICATION_REVIEWER"
-- — the only role the "REVIEWER" value has ever actually been used for
-- (automatic Application Review assignment; eligibility screening has
-- always been fully automatic, with no human review action to have
-- performed). No row is deleted, no other column changes.

CREATE TYPE "Role_new" AS ENUM (
  'SYSTEM_ADMIN',
  'PROGRAMME_DIRECTOR',
  'PROGRAMME_SECRETARY',
  'ELIGIBILITY_REVIEWER',
  'APPLICATION_REVIEWER',
  'INTERVIEWER',
  'SELECTION_COMMITTEE_MEMBER',
  'EXECUTIVE',
  'FELLOW'
);

ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "Role_new"
  USING (
    CASE WHEN "role"::text = 'REVIEWER' THEN 'APPLICATION_REVIEWER' ELSE "role"::text END
  )::"Role_new";

DROP TYPE "Role";

ALTER TYPE "Role_new" RENAME TO "Role";
