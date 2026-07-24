# ADR-0017: Applicant interview booking via a secure, single-purpose token — not the Fellow Portal

**Status:** Accepted
**Date:** 2026-07-19
**Context:** Release 1 — Enterprise Functional Specification Addendum, Module 1 (Interview Scheduling), §1.5 "Applicant Booking"

## Context

The Addendum requires applicants to self-book an interview slot: "Applicants may: View available slots; Select one preferred slot; Submit booking request." No applicant-facing authentication exists anywhere in this codebase — `Applicant`/`Application` are plain database rows with no login, `Role.FELLOW` is explicitly excluded from `ASSIGNABLE_ROLES` in V1 (`lib/rbac/roles.ts`), and `docs/architecture.md`/the Phase 0 decision record document "No module access until the Fellow Portal ships in V2" as settled. Building real applicant authentication to satisfy this one requirement would reverse that decision for the whole platform, which the Addendum does not ask for and which is out of scope for a single scheduling feature.

## Decision

Applicant booking is a **secure, invitation-based, single-purpose flow**, not a portal:

1. Once an interview's candidate slots are published (`schedulingService.publishSlots`), the system generates a cryptographically random token (32 bytes, `crypto.randomBytes`) and stores only its SHA-256 hash (`Interview.bookingTokenHash`) plus an expiry (`Interview.bookingTokenExpiresAt`, configurable via `interview.booking_token_ttl_hours`, default 7 days) — the raw token is never persisted, the same principle as a password hash: a leaked database row alone cannot be replayed.
2. The raw token is returned to the Secretariat **once**, as `/interview/book/{token}`, for them to send to the applicant themselves — there is no automated email delivery in this codebase (see "Related limitation" below), matching the same manual-paste pattern the Addendum's own §1.7 already accepts for the Microsoft Teams link ("Secretariat pastes externally generated Teams link... Version 1 shall not implement Microsoft Graph integration").
3. `app/(auth)/interview/book/[token]/page.tsx` is a public route — no session, no `requireSession`/`requirePermission` call anywhere in its call chain (`schedulingService.getBookingPageData`/`bookSlot` take the token as their only identity input). It is placed in the `(auth)` route group specifically because that group's layout and existing unauthenticated pages (`/login`) are the correct shell for an unauthenticated screen — not because it's part of the login/session system.
4. The page can do exactly one thing: view this one interview's candidate slots and submit a booking request for it. It never exposes application details, scores, other applicants, or any other route — there is no session to pivot from, and the service functions behind it only ever accept `(token, slotId)`, never a broader query.
5. `proxy.ts`'s `authorized` callback already only gates paths starting with `/dashboard`; every other route (including this one) reaches its page, which independently decides whether to guard itself. `/interview/book/[token]` deliberately doesn't call any guard.

## Consequences

- No `Role.FELLOW` / Fellow Portal work happens in this release. The Phase 0 boundary stands exactly as documented.
- "Applicants may never hold multiple interview bookings" (§1.5) is enforced by `bookSlot`'s status-conditioned update (`bookingStatus` must still be `SLOTS_PUBLISHED`) — a second booking attempt with the same or a different token-derived request fails with `ConflictError`, not a second row.
- A booking link is a bearer credential for the duration of its TTL: anyone who obtains it (e.g. a forwarded email) can book on the applicant's behalf. This is an accepted, standard trade-off for invitation-based flows (the same trust model as a password-reset link or a calendar-scheduling link) — not a gap introduced casually. The 7-day default TTL and the fact that the token only ever grants "book a slot for this specific interview" (nothing else) bound the blast radius.
- If a token needs to be revoked or resent, the Secretariat calls `publishSlots` again — it overwrites the hash and expiry, invalidating the previous token immediately (there is at most one live token per interview).

## Related limitation

No email or job-scheduler infrastructure exists anywhere in this codebase — Release 1.5 deliberately stubbed the entire Notification Configuration category with zero consumer ("no delivery mechanism exists in this codebase yet," `lib/settings/registry.ts`). This ADR's token flow is consistent with that existing, deliberate boundary: the booking link, Teams-link invitations, and interview reminders are all generated/recorded (audited) but never dispatched by this codebase. See `docs/INTERVIEW_SCHEDULING.md` for the full scope of what's recorded versus what a real deployment would still need to wire up (an actual mail provider and a scheduler/cron to invoke `sendDueReminders`).

## Alternatives considered

- **Build the full Fellow Portal now** (`Role.FELLOW` accounts, login): rejected — reverses a settled, explicitly-documented Phase 0 decision for the sake of one feature, and is materially larger scope than the Addendum asks for.
- **Secretariat books on the applicant's behalf, no applicant-facing surface at all**: rejected — technically simpler, but diverges from the specification's explicit "Applicants may... Select one preferred slot. Submit booking request" self-service language; the token-based flow satisfies that literally without the portal-scope cost.
