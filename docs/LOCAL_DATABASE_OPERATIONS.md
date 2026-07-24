# Local Database Operations

Operational reference for the local PostgreSQL instance this project's `DATABASE_URL`
points at — starting it, checking it's reachable, and backing it up/restoring it. For
what environment variables exist and what they do, see
[`docs/ENVIRONMENT_CONFIGURATION.md`](ENVIRONMENT_CONFIGURATION.md). For what
`npm run db:seed` creates, see [`docs/SEEDING.md`](SEEDING.md).

## Current local database

- **Host:** `127.0.0.1`
- **Port:** `5432`
- **Database name:** `pam_p_fms_dev`
- **Schema:** `public`
- **Application role:** `pam_p_app`

This is a standard native PostgreSQL 16 installation running as a Windows service
(`postgresql-x64-16`), not a container. The password lives only in the local `.env`
file's `DATABASE_URL` — never committed, never printed in logs or documentation.

## Starting PostgreSQL

The Windows service normally starts automatically on boot. If it isn't running:

```powershell
Get-Service postgresql-x64-16
Start-Service postgresql-x64-16
```

## Testing connectivity

```bash
npx prisma migrate status
```

A healthy connection reports the database name, schema, host:port, and confirms
whether all committed migrations are applied. `ECONNREFUSED` means the service isn't
running (see above); an authentication error means the credentials in `.env` don't
match the `pam_p_app` role's actual password on this instance.

## Applying migrations

```bash
npx prisma migrate deploy   # apply committed migrations, no prompts (safe for an existing DB)
npx prisma generate         # regenerate the Prisma Client after any schema change
```

Never run `prisma migrate reset` or `prisma db push --force-reset` against this
database — both drop and recreate the schema. See
[`docs/SEEDING.md`](SEEDING.md) for the idempotent bootstrap script
(`npm run db:seed`) instead.

## Bootstrapping the system

```bash
npm run db:seed
```

Creates the System Administrator account, the active Programme/Cohort, the
Application Review and Panel Interview scoring frameworks, and notification
templates — all `upsert`-based, safe to re-run, never deletes anything. Full
behavior documented in [`docs/SEEDING.md`](SEEDING.md).

## Importing applicants

There is no scripted applicant-data restoration path — applicant records only ever
enter this system through a human uploading a spreadsheet via the Applicant Import
wizard (`/applicants/import` in the app, backed by `modules/import/`). If applicant
data needs to be present in a given database, that file has to be re-imported through
that same UI; nothing in this repository can reconstruct it.

## Creating a backup

```bash
"C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -h 127.0.0.1 -p 5432 -U pam_p_app -d pam_p_fms_dev -F c -f "<path-outside-the-repo>\pam_p_fms_dev_<timestamp>.dump"
```

`pg_dump` will prompt for the `pam_p_app` password (or read it from a `PGPASSWORD`
environment variable / a `.pgpass` file — never pass it on the command line where it
could end up in shell history). Always write the output **outside this repository** —
never commit a `.dump` file.

## Restoring a backup

```bash
"C:\Program Files\PostgreSQL\16\bin\pg_restore.exe" -h 127.0.0.1 -p 5432 -U pam_p_app -d pam_p_fms_dev --clean --if-exists "<path-to-backup>.dump"
```

`--clean --if-exists` drops existing objects before recreating them from the backup —
review what's currently in the target database before running this against anything
you don't intend to overwrite. To inspect a backup's contents first without applying
it:

```bash
"C:\Program Files\PostgreSQL\16\bin\pg_restore.exe" --list "<path-to-backup>.dump"
```

## Test database

This project does **not** use a separate physical test database. Integration tests
run directly against the same `DATABASE_URL` as `npm run dev`, and stay isolated from
real data by scoping every test-created row to a dedicated
`@test.pam-p.invalid` email domain (`tests/helpers/db.ts`) — cleanup only ever deletes
rows under that domain, never a table-wide truncate. See the "Test environment"
section of [`docs/ENVIRONMENT_CONFIGURATION.md`](ENVIRONMENT_CONFIGURATION.md) for the
full rationale.
