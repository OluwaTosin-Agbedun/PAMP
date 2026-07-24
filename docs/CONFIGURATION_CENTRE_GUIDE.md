# Configuration Centre Guide

Where to change an operational value without a code deploy.
`/administration/configuration`, visible to System Administrator,
Programme Director, and Programme Secretary/Admin.

## Getting there

Sidebar → **Administration** → **Configuration Centre**. The landing
page lists seven categories as cards; each links to its own screen.

## Editing a setting

Every category screen except Programme Configuration renders one card
per setting:

- **Boolean settings** are a switch — click, or focus it and press
  Space/Enter. Saves immediately.
- **Text/number settings** save when you click away from the field
  (on blur) after changing the value.
- **Settings with a fixed set of choices** (like the Interview tie-break
  rule) are a dropdown.
- A **"Read-only" badge** means the value is shown for transparency but
  isn't editable — its description explains why (usually: it reflects a
  structural fact about how the system works, like blind review always
  being on, or the fact that only one third-review calculation strategy
  is implemented). Attempting to change one through the API is rejected
  server-side, not just hidden in the UI.

Every change is saved the moment you make it — there's no separate
"Save all" step, and no draft state to lose if you navigate away.

## Programme Configuration

The one screen that isn't a flat settings list — it edits real
Programme/Cohort fields and every pipeline-stage date window:

1. **Programme and cohort** — name, code, cohort name/year, and the
   application intake window (opening/closing date). Click "Save
   changes" once you've edited any of these fields.
2. **Application Review Window** — when reviewers can score
   applications. This is the same date range the Secretariat's
   Assignment Monitoring table (Phase 3D) already reads for "overdue."
3. **Eligibility Review / Interview / Executive Approval / Offer
   windows** — stored for the phases that will use them (none of those
   modules exist yet in this codebase); each has its own "Save" button.

Every window is a start/end date-time pair. Leaving a field blank clears
that bound (an open-ended window).

## What "changing a date here updates the whole system automatically"
## actually means today

Application intake and Application Review windows have real consumers
(the eligibility pipeline reads the intake window's boundary
conceptually; the Application Review Window is read by
`getActiveReviewStage`, used across the Reviewer Workspace and
Secretariat dashboards for "is this overdue"). The other four windows
are stored, correctly, with no consumer yet — editing them now doesn't
change anything visible until the corresponding module (Interview
Engine, Executive Approval, Admissions) is built and reads them. This is
intentional: see `docs/CONFIGURATION_REFERENCE.md` for exactly which
settings are "live" versus "stored for later."

## Access levels

Every role that can reach the Configuration Centre has both view and
change access today (`configuration.view` and `configuration.manage`
are granted together to Director/Secretary/Admin) — there's no current
read-only role. The two permissions are kept separate in the code so a
future narrower role (an auditor who can see configuration but not
change it) is a one-line grant change, not new plumbing.

## Audit

Every change — a setting, a Programme/Cohort field, a window — writes an
audit row recording who changed what, from what value, to what value.
Nothing in the Configuration Centre is silent.
