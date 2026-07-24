-- Trigram search indexes for Applicant name/email/institution search.
-- Not expressible in schema.prisma (Prisma's declarative @@index doesn't
-- cover GIN/trigram operator classes), so this is a hand-written
-- migration alongside the generated ones. Needed once volume grows past
-- a few hundred rows — a plain B-tree index doesn't help ILIKE '%term%'
-- queries, which is what "search applicants by name/email/institution"
-- actually runs.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "applicants_firstName_trgm_idx" ON "applicants" USING GIN ("firstName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "applicants_lastName_trgm_idx" ON "applicants" USING GIN ("lastName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "applicants_email_trgm_idx" ON "applicants" USING GIN ("email" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "applicants_institution_trgm_idx" ON "applicants" USING GIN ("institution" gin_trgm_ops);
