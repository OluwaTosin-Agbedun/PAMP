# Project instruction history — verbatim

Every substantive instruction given for this project, in the order given, extracted verbatim from the session transcript (`4a127891-3a52-5b21-871b-7a21fee24c9e.jsonl`). This is the raw material `docs/architecture.md` and every `docs/PHASE_*_IMPLEMENTATION_REPORT.md` were written from — read this file when you need the *exact original wording* of a requirement, not just a paraphrase; read `docs/architecture.md` and `handoff/README.md` first for orientation, and come here to verify specifics.

Short procedural asides (single-line acknowledgements, this file's own originating request) are omitted. Duplicate re-pastes of identical text are noted but not repeated. Each entry's "Response" line says what was built and points to the detailed doc — it does not re-explain the work; see `docs/architecture.md` for that.

---

## Entry 1 — 2026-07-18 16:01 UTC — Project kickoff: Lead Architect mandate

**Response:** Established the mandate: convert the approved prototype into a production Next.js/PostgreSQL/Prisma/Auth.js application. See `docs/architecture.md` for the resulting stack and phase roadmap.

```text
You are the Lead Software Architect and Senior Full-Stack Engineer responsible for building the PAM-P Fellowship Management System (FMS).

This project has completed the UI/UX design phase. The prototype is now frozen and approved.

Your responsibility is to convert the approved prototype into a secure, scalable, production-ready web application while preserving the existing user experience.

=========================================================
PROJECT
=========================================================

Project Name:
PAM-P Fellowship Management System (FMS)

Version:
1.0

Purpose:

Build a secure role-based Fellowship Management System that manages the complete application review and admission process for the Pius Anyim Mentorship Programme (PAM-P).

This version is exclusively for PAM-P.

DO NOT redesign the interface.

Use the approved prototype as the UI specification.

=========================================================
PRIMARY BUSINESS OBJECTIVE
=========================================================

Applications close on Monday.

Over 600 applications must be reviewed within approximately two weeks.

The platform MUST support the programme team in efficiently reviewing, interviewing, selecting and admitting Fellows.

This objective takes precedence over all non-essential features.

=========================================================
TECHNOLOGY STACK
=========================================================

Frontend

• Next.js (latest stable)
• React
• TypeScript
• Tailwind CSS
• shadcn/ui

Backend

• Next.js API Routes

Database

• PostgreSQL

ORM

• Prisma

Authentication

• Auth.js / NextAuth

File Storage

Design for future cloud storage integration.

Export

Excel
CSV
PDF

=========================================================
ARCHITECTURE PRINCIPLES
=========================================================

Follow enterprise software engineering standards.

Use:

• Clean Architecture
• Modular Design
• Reusable Components
• SOLID Principles
• DRY
• Strong typing
• Repository pattern where appropriate

Organise code for long-term maintainability.

=========================================================
PROJECT STRUCTURE
=========================================================

Create a clean repository structure.

Example:

/app

/components

/modules

/lib

/prisma

/public

/styles

/types

/utils

/docs

/scripts

/tests

=========================================================
CURRENT STATUS
=========================================================

The prototype is complete.

Treat it as frozen.

Do NOT redesign layouts.

Do NOT rename modules.

Only improve where necessary for accessibility, responsiveness or technical implementation.

=========================================================
VERSION 1.0 SCOPE
=========================================================

Build only the modules required for the 2026 selection exercise.

Priority Modules

• Authentication
• Dashboard
• Applicant Management
• Application Detail View
• Reviewer Workspace
• Interview Workspace
• Selection Committee Workspace
• Executive Approval Workspace
• Admissions Workspace
• Search
• Advanced Filtering
• Status Tracking
• Notes
• Audit Trail
• Reports
• Excel Export
• Role-Based Access Control

Postpone the following until Version 2.0

• Fellow Portal
• Google Classroom Integration
• Residency
• Graduation
• Alumni
• Advanced Automation
• Enhanced Communications

=========================================================
NON-NEGOTIABLE REQUIREMENTS
=========================================================

1. Build production-quality code.

2. Use TypeScript throughout.

3. Keep business logic separate from UI.

4. Create reusable components.

5. Write clean folder structures.

6. Use environment variables correctly.

7. Prepare the project for deployment.

8. Build incrementally.

9. Commit logical milestones.

10. Never break existing functionality.

=========================================================
WORKING METHOD
=========================================================

Do NOT attempt to build everything at once.

Before writing code:

1. Analyse the entire project.

2. Produce the recommended folder structure.

3. Produce the database entity list.

4. Produce the development roadmap.

5. Identify risks.

6. Ask for confirmation before generating production code.

Think like a Senior Software Architect.

Do not rush into implementation.

First produce the project architecture and implementation plan.

Only after approval should coding begin.
```

---

## Entry 2 — 2026-07-18 16:12 UTC — Phase 0 production requirements

**Response:** Built in Phase 0: Auth.js Credentials Provider, bcrypt password hashing, JWT sessions. See `docs/AUTHENTICATION.md`.

```text
Build Phase 0 for production, not just as a prototype.

Authentication:
Use Auth.js (NextAuth) with Credentials Provider as the primary authentication method.

Users will initially be created by the System Administrator.

Support the following roles:

- System Administrator
- Programme Director
- Programme Secretary/Admin
- Reviewer
- Interviewer
- Selection Committee Member
- Executive
- Fellow (Version 2)

Passwords must be securely hashed using bcrypt.

Implement Role-Based Access Control (RBAC) from the beginning.

Design the authentication layer so that Microsoft Entra ID (Azure AD) or Google Workspace Single Sign-On can be added later without requiring a redesign.

-------------------------------------------------

Hosting Target:

Design for deployment on Vercel with PostgreSQL.

Use:

- Frontend: Vercel
- Backend: Next.js API Routes
- Database: PostgreSQL
- Prisma ORM
- Environment variables for all secrets

The architecture should remain cloud-agnostic so it can later be deployed to Azure, AWS or DigitalOcean if required.

-------------------------------------------------

Important:

Although Phase 0 should be production-ready, optimise the build for the immediate operational requirement of supporting the 2026 PAM-P application review and selection process.
```

---

## Entry 3 — 2026-07-18 16:36 UTC — Mandatory responsive design requirements

**Response:** Responsive design has been a first-class requirement from Phase 0 onward — every accessibility Playwright run since Release 1.5 includes a mobile-chromium project (`tests/e2e/accessibility.spec.ts`) verifying this.

```text
The PAM-P Fellowship Management System (FMS) will be used by programme administrators, reviewers, interviewers, selection committee members, executives and, in future versions, Fellows.

Responsive design is a mandatory system requirement and must be built into the application architecture from the beginning.

=========================================================
RESPONSIVE DESIGN REQUIREMENTS
=========================================================

The application must provide an excellent user experience across:

• Desktop Computers (Primary)
• Laptops
• Tablets
• Android Phones
• iPhones

Use Tailwind CSS responsive breakpoints and modern responsive design best practices throughout the application.

=========================================================
DESKTOP EXPERIENCE (PRIMARY)
=========================================================

The primary operational environment is desktop.

Desktop users include:

• System Administrator
• Programme Director
• Programme Secretary/Admin
• Reviewers
• Interviewers
• Selection Committee Members
• Executives

The desktop interface should maximise productivity by providing:

• Multi-column layouts
• Rich dashboards
• Large data tables
• Advanced filtering and search
• Bulk actions
• Split-panel views where appropriate
• Keyboard-friendly interactions
• Fast navigation between records

=========================================================
TABLET EXPERIENCE
=========================================================

Tablet users should have access to the full functionality of the system with layouts optimised for medium-sized screens.

Navigation should automatically adjust to available screen space while maintaining usability.

=========================================================
MOBILE EXPERIENCE
=========================================================

The mobile interface should be fully functional and optimised for users who need to work while away from their desks.

Typical mobile activities include:

• Viewing dashboards
• Searching applicants
• Viewing applicant profiles
• Reviewing applications
• Adding notes
• Approving candidates
• Viewing interview schedules
• Checking application status
• Receiving notifications

The mobile interface should prioritise clarity, speed and ease of use.

=========================================================
RESPONSIVE BEHAVIOUR
=========================================================

Implement the following standards across all modules:

Navigation

• Desktop sidebar
• Tablet collapsible sidebar
• Mobile hamburger navigation

Dashboards

• Automatically stack cards
• Resize charts appropriately
• Preserve KPI visibility
• Optimise spacing

Tables

• Convert large tables into responsive layouts where practical
• Use horizontally scrollable tables only when unavoidable
• Provide responsive card views for applicant summaries where appropriate

Forms

• Optimise for touch interaction
• Large touch targets
• Responsive validation messages
• Logical field grouping
• Adaptive spacing

Buttons

• Minimum touch-friendly sizing
• Responsive alignment
• Accessible spacing

Search & Filters

• Fully functional on mobile
• Filters should collapse into drawers or modals on smaller devices

Typography

• Scale appropriately across screen sizes
• Maintain readability
• Avoid text overflow

Images & Charts

• Resize automatically
• Preserve aspect ratios
• Prevent clipping or distortion

=========================================================
ACCESSIBILITY
=========================================================

Follow modern accessibility best practices including:

• WCAG 2.1 AA compliance where practical
• Keyboard navigation
• Visible focus states
• Sufficient colour contrast
• Screen reader-friendly components
• Accessible forms and labels

=========================================================
PERFORMANCE
=========================================================

Optimise for performance on both desktop and mobile devices.

Requirements include:

• Fast page loading
• Code splitting
• Lazy loading where appropriate
• Responsive image optimisation
• Efficient rendering
• Minimal layout shift

=========================================================
QUALITY ASSURANCE
=========================================================

Every module must be tested at common responsive breakpoints, including:

• 320px
• 375px
• 414px
• 768px
• 1024px
• 1280px
• 1440px
• 1920px

No module should be considered complete until it functions correctly across all supported screen sizes.

=========================================================
DEVELOPMENT STANDARD
=========================================================

Build all UI components as reusable, responsive React components using:

• Next.js
• TypeScript
• Tailwind CSS
• shadcn/ui

Responsiveness must be built into every component by default.

Do not treat mobile responsiveness as a later enhancement or post-development task.

It is a mandatory acceptance criterion for every feature and module delivered.
```

---

## Entry 4 — 2026-07-18 16:43 UTC — Internal prototype review findings

**Response:** Usability/security/consistency findings folded into the Phase 0 production build rather than a separate pass — no dedicated report; treat as absorbed into the Phase 0 implementation.

```text
Following an internal review of the PAM-P Fellowship Management System (FMS) prototype, the following observations have been made.

These findings have been accepted and should be incorporated into the production implementation where applicable.

The objective is not to redesign the system, but to improve usability, security, responsiveness, consistency and overall production readiness while preserving the approved UI/UX.

=========================================================
1. MOBILE RESPONSIVENESS (HIGH PRIORITY)
=========================================================

The prototype does not render correctly on some mobile devices, displaying only a blue screen and partial text.

Required Actions:

• Investigate and resolve all responsive rendering issues.
• Ensure the application loads correctly on Android and iOS devices.
• Implement responsive layouts using Tailwind CSS breakpoints.
• Test across major browsers including Chrome, Safari, Edge and Firefox.
• Validate responsiveness at common viewport widths (320px, 375px, 414px, 768px, 1024px, 1280px, 1440px and above).

Mobile compatibility is a mandatory acceptance criterion.

=========================================================
2. DASHBOARD DATA CONSISTENCY
=========================================================

The figures displayed across dashboards must always be internally consistent.

Implement a central dashboard statistics service so that all KPIs, charts and summary cards are generated from the same validated data source.

No duplicated calculation logic should exist.

=========================================================
3. DATABASE INTEGRATION
=========================================================

Several buttons in the prototype are non-functional because no persistent data layer exists.

Replace all prototype placeholders with fully functional backend operations.

All user actions should perform real CRUD operations against the PostgreSQL database using Prisma ORM.

Where an action cannot yet be completed, provide appropriate validation messages rather than inactive controls.

=========================================================
4. AUTHENTICATION & ROLE-BASED ACCESS CONTROL (CRITICAL)
=========================================================

The prototype currently allows unrestricted switching between user roles.

This behaviour must not exist in the production system.

Implement secure authentication using Auth.js (NextAuth) with credential-based login.

All passwords must be securely hashed.

Implement Role-Based Access Control (RBAC).

Users should only see menus, dashboards, reports and functions authorised for their assigned role.

Role switching must only be available to authorised Super Administrators.

All permission checks must also be enforced on the server side.

=========================================================
5. ROLE SELECTOR USABILITY
=========================================================

The current role selector is difficult to use and lacks visual clarity.

Improve the component by:

• Using a modern dropdown or profile menu.
• Clearly displaying the currently logged-in user's name and role.
• Showing user profile information where appropriate.
• Following the overall design language of the application.

=========================================================
6. NAVIGATION IMPROVEMENTS
=========================================================

The Programme Administrator and Super Administrator sidebars contain a large number of menu items.

Improve navigation by organising related functions into collapsible menu groups.

Suggested groups include:

• Dashboard
• Applicant Management
• Reviews
• Interviews
• Selection
• Admissions
• Communications
• Reports & Analytics
• Administration
• System Settings

Only expand sections when required.

The navigation should remain clean, intuitive and scalable.

=========================================================
7. UI CONSISTENCY
=========================================================

Review the entire application to ensure consistent implementation of:

• Typography
• Colours
• Icons
• Button styles
• Form layouts
• Card layouts
• Spacing
• Tables
• Status badges
• Alerts
• Notifications
• Modal windows

Create reusable UI components to maintain consistency across all modules.

=========================================================
8. AUDITABILITY
=========================================================

One of the strengths of the prototype is the transparency of information.

Preserve and enhance this by implementing:

• Complete audit logs
• User activity history
• Status history
• Decision history
• Timestamp tracking
• User attribution for all changes

Auditability is a core system requirement.

=========================================================
9. PERFORMANCE & RELIABILITY
=========================================================

Optimise the application for production deployment.

Implement:

• Lazy loading
• Code splitting
• Optimised database queries
• Efficient pagination
• Error boundaries
• Graceful error handling
• Loading states
• Retry mechanisms where appropriate

=========================================================
10. PRODUCTION READINESS
=========================================================

Before any module is considered complete, it must satisfy the following quality gates:

✓ Responsive on desktop, tablet and mobile
✓ Connected to the database
✓ Fully functional
✓ Role-secured
✓ Server-side permission validation
✓ Consistent UI
✓ Accessible
✓ Performance optimised
✓ Proper error handling
✓ Fully audited
✓ Production-ready

=========================================================
FINAL INSTRUCTION
=========================================================

The prototype has been approved as the functional and visual foundation of the PAM-P Fellowship Management System.

Do not redesign the application.

Instead, evolve the prototype into a secure, responsive, scalable and production-ready system by implementing the improvements outlined above while preserving the approved user experience.
```

---

## Entry 5 — 2026-07-18 17:19 UTC — V1.0 planning: approved decisions

**Response:** Confirmed "prototype is the approved foundation, do not redesign" — this policy has held through every subsequent phase, including the Enterprise Functional Specification Addendum (Entry 19), which explicitly reaffirms it.

```text
Continue the implementation planning for the PAM-P Fellowship Management System (FMS), Version 1.0 – Selection Operations Edition.

Treat the following decisions as approved and final:

1. The existing Claude Design prototype is the approved visual and functional foundation.
2. Do not redesign the application.
3. Correct responsiveness, usability, security and consistency issues where necessary.
4. The application must work properly on desktop, tablet, Android phones and iPhones.
5. Authentication will use Auth.js with credentials-based login.
6. Passwords must be securely hashed.
7. Role-Based Access Control must be enforced in both the interface and server-side operations.
8. The production hosting target is Vercel with PostgreSQL and Prisma ORM.
9. Applicant records will initially enter the system through an administrator-controlled Excel/CSV import process.
10. The architecture should allow future API integration with the existing application portal.
11. Version 1.0 is exclusively for PAM-P.
12. The immediate business objective is to support the review and selection of more than 600 applicants within approximately two weeks.

The following prototype review findings are mandatory implementation requirements:

- Fix the mobile rendering failure that currently produces a blue screen and partial text.
- Ensure all buttons and controls perform real actions or display clear disabled-state explanations.
- Replace unrestricted prototype role switching with secure authentication and authorisation.
- Improve the user and role display component for visibility and usability.
- Group the crowded Programme Administrator and Super Administrator sidebar menus into collapsible sections.
- Ensure figures and dashboard statistics are generated consistently from one validated data source.
- Preserve and enhance auditability through complete activity, status and decision histories.
- Standardise typography, spacing, forms, tables, buttons, badges, alerts and modal components.
- Implement proper loading, success, empty and error states.
- Use reusable responsive components throughout.

Version 1.0 priority modules are:

- Authentication
- Dashboard
- Applicant Management
- Applicant Detail
- Applicant Excel/CSV Import
- Reviewer Workspace
- Interview Workspace
- Selection Committee Workspace
- Executive Approval Workspace
- Admissions Workspace
- Search and Filters
- Status Tracking
- Notes
- Audit Trail
- Reports and Excel Export
- User and Role Administration

Before writing production code, produce the following:

A. Recommended repository and folder structure  
B. Database entity list and relationship overview  
C. Authentication and RBAC model  
D. Applicant import architecture  
E. Responsive design implementation strategy  
F. Development sequence for the urgent Version 1.0 release  
G. Key risks and mitigation measures  
H. Explicit list of features deferred to Version 2.0  

Do not begin coding until this architecture plan has been presented for review.
```

---

## Entry 6 — 2026-07-18 17:27 UTC — Architecture approval + pre-code requirements

**Response:** Gate passed before any Phase 1 code was written.

```text
I have reviewed the proposed Version 1.0 architecture.

Overall, I approve the architecture and implementation strategy.

The separation of concerns, database design, RBAC model, import architecture, responsive strategy and phased development sequence align with the objectives of the PAM-P Fellowship Management System (FMS).

However, before any production code is written, I require the following architectural amendments to ensure the system fully supports the approved PAM-P selection framework.

These are mandatory business requirements and should be incorporated into the architecture and implementation plan.

=========================================================
1. REINSTATE ELIGIBILITY SCREENING
=========================================================

Do not remove the Eligibility Screening stage.

Although eligibility assessment will be fully automated, it remains an important business process.

The workflow should be:

Application Imported

↓

Automatic Eligibility Engine

↓

Eligible

or

Ineligible

↓

Reviewer Assignment

The Eligibility Engine should:

• Evaluate all configured eligibility criteria
• Automatically determine eligibility
• Record reasons for any rejection
• Store an audit trail explaining every eligibility decision
• Allow future changes to eligibility rules without redesigning the workflow

Eligibility is a workflow stage, not simply a filter.

=========================================================
2. SCORE AGGREGATION SERVICE
=========================================================

Create a dedicated ScoreAggregationService.

No module should calculate averages independently.

The ScoreAggregationService will be responsible for:

• Calculating reviewer averages
• Calculating interview averages
• Ranking applicants
• Resolving score ties
• Producing Top 70 rankings
• Producing Top 60 rankings
• Locking rankings after approval
• Generating final programme rankings
• Supplying dashboard KPI statistics

This service becomes the single source of truth for all scoring calculations.

=========================================================
3. BLIND DUAL REVIEW PROCESS
=========================================================

The review workflow must remain completely blind.

Reviewer A must never see:

• Reviewer B's score
• Reviewer B's comments
• Reviewer B's recommendation

Reviewer B must never see Reviewer A's review.

Only after both reviewers have submitted should the Programme Secretary be able to view both reviews.

The system should enforce this behaviour both in the UI and on the server.

=========================================================
4. THIRD REVIEWER BUSINESS RULE
=========================================================

Implement the previously approved conflict-resolution workflow.

Initial Review:

Reviewer 1

+

Reviewer 2

↓

Calculate score difference

↓

If the score difference exceeds the configured threshold,

↓

Automatically assign a Third Reviewer

↓

Final score =

Average of:

• Third Reviewer's score

AND

• The LOWER of Reviewer 1 or Reviewer 2's score

This process must be fully automatic.

The threshold value should be configurable through system settings rather than hardcoded.

=========================================================
5. AUTOMATIC REVIEWER ASSIGNMENT
=========================================================

The system must automatically distribute applications equally among reviewers.

Requirements:

• Equal workload distribution
• Automatic assignment
• Randomised allocation where appropriate
• No manual allocation required
• Reviewers only see their own assigned applications

=========================================================
6. INTERVIEW MODULE
=========================================================

The interview process follows the approved PAM-P workflow.

Interview Format:

• Four panelists interview each applicant together.

Each panelist must:

• Score independently
• Record comments independently
• Select their own name from the panel list
• Submit individually

The system should automatically calculate:

• Individual scores
• Panel average
• Final interview score

Interview questions should be configurable by administrators.

Scoring options should also be configurable.

=========================================================
7. DASHBOARD SERVICE
=========================================================

Create a dedicated DashboardService.

No dashboard component should calculate statistics independently.

The DashboardService should generate:

• Applicant counts
• Stage summaries
• Reviewer workloads
• Average scores
• Interview progress
• Committee decisions
• Admission statistics
• Eligibility statistics
• KPI cards

All dashboards should consume the same validated data source.

=========================================================
8. GLOBAL SEARCH
=========================================================

Implement a Global Search service available from the application header.

The search should locate:

• Applicants
• Reviewers
• Interviews
• Committee records
• Admissions
• Users
• Reports

Search should support:

• Partial matches
• Filters
• Fast results
• Keyboard shortcuts where appropriate

=========================================================
9. OPERATIONAL NOTIFICATIONS
=========================================================

Retain essential operational notifications within Version 1.0.

These include:

• Reviewer assignment
• Interview scheduling
• Progression to next stage
• Executive approval
• Admission offer issued

Advanced communication workflows may remain deferred to Version 2.0.

=========================================================
10. AUDIT ENHANCEMENTS
=========================================================

Expand the Audit Trail to include:

• Login events
• Logout events
• Applicant imports
• Exports
• Reviewer assignments
• Review submissions
• Interview submissions
• Committee decisions
• Executive approvals
• Admission offers
• Status changes
• Record edits
• Permission changes

Every important system action should be fully traceable.

=========================================================
11. VERSION 1.0 DELIVERY PRINCIPLE
=========================================================

The objective remains to deliver a production-ready system capable of supporting the 2026 PAM-P Fellowship selection exercise.

Focus on:

• Reliability
• Security
• Performance
• Auditability
• Responsive design
• Clean architecture
• Ease of use

Do not introduce unnecessary complexity.

Build only what is required to support the current selection process while keeping the architecture extensible for future versions.

=========================================================
FINAL INSTRUCTION
=========================================================

Please update the architecture to incorporate these business rules before beginning implementation.

Once the revised architecture has been produced, proceed with production development following the agreed phased implementation plan.

The approved prototype remains the visual specification and should not be redesigned. The objective is to evolve it into a secure, scalable, fully responsive, enterprise-grade production system.
```

---

## Entry 7 — 2026-07-18 18:28 UTC — Phase 1 kickoff: database foundation

**Response:** Produced the complete V1.0 schema in one pass, including many models that stayed unused for weeks until later phases caught up to them — Interview*, CommitteeVote/CommitteeDecision, ExecutiveApproval, AdmissionOffer, RankingSnapshot, ApplicationScore. See `docs/database.md`. This "design the whole schema up front, consume it incrementally" pattern is why Release 1's Interview modules needed almost no new tables — see `handoff/REMAINING_WORK.md` for which ones are still waiting on a consumer.

```text
The revised architecture has been approved.

Before implementing any UI modules, begin Phase 1 by designing the complete database foundation for Version 1.0 of the PAM-P Fellowship Management System (FMS).

=========================================================
OBJECTIVE
=========================================================

Design a robust, scalable and well-normalised PostgreSQL database using Prisma ORM that fully supports the approved PAM-P business processes.

The database must be production-ready, maintainable and extensible for future versions.

=========================================================
DELIVERABLES
=========================================================

Produce the following before implementing any application modules:

1. Complete Entity Relationship Diagram (ERD)

2. Prisma schema

3. Database relationship explanation

4. Primary and foreign key definitions

5. Indexing strategy

6. Unique constraints

7. Enum definitions

8. Audit strategy

9. Soft delete strategy (where appropriate)

10. Migration plan

=========================================================
BUSINESS RULES TO SUPPORT
=========================================================

The schema must support:

• Cohorts

• Applicants

• Applications

• Application Documents

• Automatic Eligibility Screening

• Reviewer Assignment

• Blind Dual Review

• Automatic Third Reviewer Assignment

• Score Aggregation

• Interview Scheduling

• Four-person Interview Panels

• Individual Interview Scores

• Committee Voting

• Executive Approval

• Admission Offers

• Notes

• Audit Trail

• User Management

• Role-Based Access Control

• Dashboard Statistics

• Import Batches

• Import Errors

• Notifications

=========================================================
IMPORTANT BUSINESS RULES
=========================================================

The database must support:

Automatic eligibility determination.

Blind review.

Configurable scoring rubrics.

Configurable interview questions.

Configurable score thresholds.

Automatic reviewer assignment.

Automatic third reviewer assignment.

Automatic ranking.

Top 70 generation.

Top 60 generation.

Executive approval workflow.

Admission workflow.

Future API synchronisation with the existing application portal.

=========================================================
SCORING MODEL
=========================================================

Do NOT store reviewer scores as JSON blobs.

Store:

Review

↓

ReviewScore

↓

Criterion

so that:

• averages

• rankings

• reporting

• analytics

can all be generated efficiently.

=========================================================
AUDIT MODEL
=========================================================

All important business events must be auditable.

Examples include:

• Login

• Logout

• Import

• Export

• Reviewer Assignment

• Eligibility Decision

• Review Submission

• Third Reviewer Assignment

• Interview Submission

• Committee Decision

• Executive Approval

• Admission Offer

• User Administration

• Role Changes

=========================================================
PERFORMANCE
=========================================================

Design for:

600+ applicants today

5,000+ applicants in future

Multiple cohorts

Future multiple fellowship programmes

Optimised queries

Proper indexing

Server-side filtering

Server-side pagination

=========================================================
OUTPUT FORMAT
=========================================================

Provide:

1. ERD diagram

2. Entity descriptions

3. Table definitions

4. Relationship explanations

5. Prisma schema

6. Design rationale

Do not implement any UI until the database design has been reviewed and approved.
```

---

## Entry 8 — 2026-07-18 18:57 UTC — Phase 2 brief: Application Foundation, Authentication, RBAC

**Response:** See `docs/PHASE_2_IMPLEMENTATION_REPORT.md`, `docs/RBAC.md`, `docs/AUDIT_LOGGING.md`.

```text
PAM-P FELLOWSHIP MANAGEMENT SYSTEM
PHASE 2 — APPLICATION FOUNDATION, AUTHENTICATION AND ROLE-BASED ACCESS CONTROL
The database design, Prisma schema and initial migrations for the PAM-P Fellowship Management System have been completed and accepted as the technical foundation.
Proceed to Phase 2: Application Foundation, Authentication and Role-Based Access Control.
Do not begin the Reviewer Workspace, Interview Workspace, Committee Workspace, Executive Approval Workspace or Admissions module during this phase.
1. Objective
Build the secure application foundation required by every future module.
This phase must establish:

* Project structure
* Environment configuration
* Database connection
* Authentication
* User account management
* Role-based access control
* Permission enforcement
* Session handling
* Audit logging foundation
* Protected routes
* Error handling
* Logging
* Seed data
* Developer documentation
The result should be a secure and maintainable platform foundation upon which the operational modules will later be built.
2. Required Technology Stack
Use the approved stack:

* Next.js
* React
* TypeScript
* PostgreSQL
* Prisma ORM
* Auth.js
* Credentials authentication
* bcrypt
* Zod
* Tailwind CSS
* shadcn/ui
Use the project’s existing package manager and configuration.
Do not introduce an alternative authentication library, ORM, database or major framework.
3. First Action: Review the Existing Foundation
Before writing code:

1. Inspect the existing project structure.
2. Review the approved Prisma schema and migrations.
3. Identify the existing user, role, permission, session and audit-related entities.
4. Confirm that the schema supports the requirements in this prompt.
5. Do not redesign the database unnecessarily.
Where a schema change is genuinely required:

* Explain the reason.
* Keep the change minimal.
* Create a new migration.
* Do not modify or delete an already-applied migration.
* Document the effect of the change.
Do not proceed on assumptions where the existing schema provides the answer.
4. Application Architecture
Organise the project using a clean, feature-based architecture.
Business logic must not be placed inside React components, route handlers or middleware.
Use clear separation between:

* UI components
* Route handlers
* Validation schemas
* Services
* Repositories
* Authentication
* Authorisation
* Database access
* Audit logging
* Configuration
* Shared utilities
* Domain types
A suitable structure may include:

```

```


```
src/
  app/
  components/
  features/
  services/
  repositories/
  lib/
  auth/
  permissions/
  validation/
  types/
  config/
  constants/
  middleware/
  errors/
  logging/
  audit/
```

Adapt this to the existing repository rather than duplicating folders unnecessarily.
5. Authentication Requirements
Implement secure credentials-based authentication using Auth.js.
The authentication flow must support:

*  Email and password sign-in 
*  Secure password hashing with bcrypt 
*  Active and inactive account validation 
*  Account status checks 
*  Session creation 
*  Session expiry 
*  Sign-out 
*  Failed login handling 
*  Last-login timestamp 
*  Password-change requirement 
*  Secure handling of authentication errors 
The system must never return sensitive authentication details to the client.
Authentication must be enforced server-side.
Client-side route hiding alone is not sufficient.
6. User Account Status
Support the account statuses already defined in the Prisma schema.
At minimum, the application must distinguish between:

*  Active 
*  Inactive 
*  Suspended 
*  Pending activation 
*  Locked, where supported by the schema 
A user who is not active must not gain access even where the password is correct.
Do not hardcode status strings where enums already exist.
7. Role-Based Access Control
Implement RBAC using the database entities already defined for:

*  Users 
*  Roles 
*  Permissions 
*  User-role assignments 
*  Role-permission assignments 
The architecture must support the following roles:

*  System Administrator 
*  Programme Director 
*  Programme Secretary/Admin 
*  Eligibility Reviewer 
*  Application Reviewer 
*  Interviewer 
*  Selection Committee Member 
*  Executive 
*  Fellow, reserved for a future phase 
Role names must not be the sole basis of authorisation.
Permissions must be checked through a central authorisation service.
8. Permission Model
Create a central permission catalogue.
Use consistent permission identifiers such as:

```

```


```
users.view
users.create
users.update
users.deactivate
roles.view
roles.manage
permissions.view
programmes.view
cohorts.view
applications.view
eligibility.review
reviews.perform
reviews.assign
interviews.view
interviews.score
committee.review
executive.approve
admissions.manage
reports.view
reports.export
audit.view
system.configure
```

These examples should be aligned with the permissions already represented in the database.
Do not grant permissions merely because a user can access a page.
Every sensitive operation must perform a server-side permission check.
9. Authorisation Service
Create a reusable authorisation service with functions equivalent to:

```

```


```
hasPermission(userId, permission)
requirePermission(userId, permission)
hasAnyPermission(userId, permissions)
hasAllPermissions(userId, permissions)
getUserPermissions(userId)
getUserRoles(userId)
```

The exact implementation may differ, but it must provide one authoritative mechanism for permission checking.
Do not duplicate permission logic across modules.
The service must support future programme-level or cohort-level access restrictions.
10. Protected Routes and Middleware
Implement route protection for authenticated areas.
The system must:

*  Redirect unauthenticated users to the sign-in page. 
*  Prevent inactive or suspended users from accessing protected routes. 
*  Prevent authenticated users from accessing pages for which they lack permission. 
*  Return appropriate HTTP status codes for API or server-action requests. 
*  Avoid exposing protected content during client-side loading. 
Middleware may be used for broad route protection, but final authorisation must also occur at the server action, service or route-handler level.
11. User Management Foundation
Create the backend foundation for user administration.
Implement services and validation for:

*  Creating a user 
*  Updating a user 
*  Activating a user 
*  Deactivating a user 
*  Suspending a user 
*  Assigning roles 
*  Removing roles 
*  Resetting or changing a password 
*  Requiring password change on next login 
*  Viewing a user’s roles and permissions 
Only users with the appropriate permissions may perform these actions.
Do not build the full user-management interface unless a minimal screen is necessary to verify the implementation.
12. Initial Administrator Account
Create a secure seeding mechanism for the first System Administrator.
Requirements:

*  Administrator credentials must come from environment variables. 
*  Do not commit a default password. 
*  Do not print the password in logs. 
*  Validate that required environment variables exist. 
*  Hash the password using bcrypt. 
*  Make the seeding process idempotent. 
*  Do not create duplicate administrator accounts. 
Provide an `.env.example` containing placeholder variable names only.
13. Seed Roles and Permissions
Create an idempotent seed script for:

*  Approved system roles 
*  Permission catalogue 
*  Role-permission assignments 
*  Initial System Administrator 
The script must be safe to run more than once.
It must not create duplicate roles, permissions or assignments.
Document the initial permission assignments clearly.
Apply the principle of least privilege.
14. Audit Logging Foundation
Implement the central audit logging service required by future modules.
The audit mechanism must support recording:

*  Actor user ID 
*  Action 
*  Entity type 
*  Entity ID 
*  Programme ID, where applicable 
*  Cohort ID, where applicable 
*  Previous value, where appropriate 
*  New value, where appropriate 
*  Reason or comment 
*  Timestamp 
*  IP address, where reliably available 
*  User agent, where reliably available 
*  Correlation or request ID 
Sensitive values such as passwords, password hashes, session tokens and secrets must never appear in audit logs.
Audit the following Phase 2 actions:

*  Successful login 
*  Failed login, where appropriate and safe 
*  Logout 
*  User creation 
*  User update 
*  User activation 
*  User deactivation 
*  User suspension 
*  Role assignment 
*  Role removal 
*  Password reset or change 
*  Permission-sensitive administrative actions 
Audit records should be append-only through normal application operations.
15. Error Handling
Create a consistent application error model.
Include errors equivalent to:

*  AuthenticationError 
*  AuthorisationError 
*  ValidationError 
*  NotFoundError 
*  ConflictError 
*  AccountInactiveError 
*  AccountLockedError 
*  InternalApplicationError 
Errors returned to users must be understandable without exposing stack traces, database structure, secrets or sensitive internal details.
Provide central error translation for route handlers and server actions.
16. Validation
Use Zod for all external input.
Validate:

*  Login credentials 
*  User creation 
*  User updates 
*  Role assignment 
*  Password changes 
*  Administrative actions 
Do not trust client-provided role names, permission lists, user IDs or account statuses.
Server-side validation is mandatory.
17. Logging
Implement structured application logging.
Logs should include:

*  Timestamp 
*  Severity 
*  Operation 
*  Correlation ID 
*  Relevant non-sensitive context 
Do not log:

*  Plain-text passwords 
*  Password hashes 
*  Authentication tokens 
*  Session secrets 
*  Personally identifiable information unless operationally necessary 
Separate operational logging from the formal audit trail.
18. Minimal Verification Interface
Create only the minimum interface necessary to verify the foundation.
This may include:

*  Sign-in page 
*  Sign-out action 
*  Access-denied page 
*  Authenticated landing page 
*  Basic current-user profile display 
*  Basic administrator user list, only where necessary for validation 
Do not build the full dashboard or operational workspaces during this phase.
The interface must use:

*  Arial or the approved application font configuration 
*  Tailwind CSS 
*  shadcn/ui 
*  Responsive layout 
*  Accessible form controls 
*  Clear validation messages 
19. Security Requirements
Implement the following controls:

*  Password hashing using bcrypt 
*  Secure session cookies 
*  Server-side permission checks 
*  Protection against privilege escalation 
*  No client-controlled authorisation 
*  Environment-variable validation 
*  Safe error messages 
*  Input validation 
*  Prevention of mass assignment 
*  Database transaction use for multi-step role assignments 
*  Protection against duplicate account creation 
*  Session invalidation or access denial following account deactivation 
*  Least-privilege access 
Where Auth.js handles a control internally, document how it is configured.
20. Testing Requirements
Create automated tests for the foundation.
At minimum, test:
Authentication

*  Valid credentials succeed. 
*  Invalid credentials fail. 
*  Inactive user cannot sign in. 
*  Suspended user cannot sign in. 
*  Unknown user cannot sign in. 
*  Password hash is never exposed. 
RBAC

*  User with permission can perform the action. 
*  User without permission is denied. 
*  Role assignment changes effective permissions. 
*  Removing a role removes the associated permissions. 
*  Client-provided role information cannot bypass server-side checks. 
User Administration

*  Authorised administrator can create a user. 
*  Duplicate email is rejected. 
*  Unauthorised user cannot create a user. 
*  Account activation and deactivation work correctly. 
*  Password-change requirement is respected. 
Audit

*  Sensitive administrative actions create audit entries. 
*  Passwords and secrets are excluded from audit data. 
*  Failed operations do not create misleading success audit records. 
Use the project’s approved testing framework. Where none exists, select a standard TypeScript-compatible approach and explain the choice.
21. Documentation Deliverables
Create or update:

```

```


```
README.md
docs/AUTHENTICATION.md
docs/RBAC.md
docs/AUDIT_LOGGING.md
docs/ENVIRONMENT_CONFIGURATION.md
docs/SEEDING.md
docs/PHASE_2_IMPLEMENTATION_REPORT.md
```

Documentation must include:

*  Architecture overview 
*  Authentication flow 
*  Session strategy 
*  Role and permission model 
*  Initial permission matrix 
*  Audit logging approach 
*  Environment variables 
*  Seed instructions 
*  Local setup instructions 
*  Test instructions 
*  Known limitations 
*  Decisions requiring future review 
22. Acceptance Criteria
Phase 2 is complete only when:

*  The application connects successfully to PostgreSQL. 
*  Prisma Client functions correctly. 
*  A seeded administrator can sign in. 
*  Inactive and suspended users are denied access. 
*  Protected routes reject unauthenticated access. 
*  Server-side permission enforcement works. 
*  Roles and permissions are seeded idempotently. 
*  User-management services are functional. 
*  Sensitive actions generate audit entries. 
*  Secrets and passwords are not exposed. 
*  Automated tests pass. 
*  Linting and type checking pass. 
*  The application builds successfully. 
*  Documentation is complete. 
23. Prohibited Actions
Do not:

*  Build the Reviewer Workspace. 
*  Build the Interview Workspace. 
*  Build the Committee Workspace. 
*  Build Executive Approval. 
*  Build Admissions. 
*  Build application import. 
*  Add fictional business rules. 
*  Replace the approved Prisma schema without justification. 
*  Store permissions only in frontend code. 
*  Use client-side checks as the sole security control. 
*  Commit credentials or secrets. 
*  Hardcode the initial administrator password. 
*  Skip testing. 
*  Continue to Phase 3 automatically. 
24. Required Final Response
When Phase 2 is complete, provide:

1.  Executive summary of work completed. 
2.  Files created or modified. 
3.  Any schema changes and migrations added. 
4.  Authentication architecture. 
5.  RBAC and permission architecture. 
6.  Initial role-permission matrix. 
7.  Audit logging implementation. 
8.  Test results. 
9.  Type-check, lint and build results. 
10.  Security considerations. 
11.  Known limitations. 
12.  Recommended next phase. 
Stop after completing Phase 2 and wait for review and approval before beginning applicant import or operational workflow modules.
```

---

## Entry 9 — 2026-07-18 22:59 UTC — Phase 3A brief: Review Framework and Scoring Engine

**Response:** See `docs/PHASE_3A_IMPLEMENTATION_REPORT.md`, `docs/REVIEW_FRAMEWORK.md`, `docs/SCORING_ENGINE.md`, `docs/REVIEW_LIFECYCLE.md`, `docs/SCORE_CALCULATION_RULES.md`.

```text
PAM-P FELLOWSHIP MANAGEMENT SYSTEM
PHASE 3A — REVIEW FRAMEWORK AND SCORING ENGINE
Phase 2 has been reviewed and accepted as the application foundation.
The following are now in place:

* Authentication
* Account lifecycle management
* Code-based RBAC
* Server-side permission enforcement
* Audit logging
* Structured operational logging
* Error handling
* Password-change workflows
* User administration
* Automated unit and integration testing
Proceed to Phase 3A: Review Framework and Scoring Engine.
This phase must build the reusable domain engine for configuring review criteria, validating scores, calculating review totals and supporting future review stages.
Do not build the Reviewer Workspace, automatic reviewer assignment, interviews, committee review, executive approval or admissions during this phase.
1. Phase Objective
Build a production-grade scoring framework that can support:

* Application review
* Eligibility assessment where scoring is required
* Interview scoring
* Selection committee assessment
* Future fellowship programmes
* Future cohorts
* Programme-specific scoring frameworks
* Versioned review criteria
* Weighted and unweighted scoring
* Score validation
* Review total calculation
* Review submission controls
* Score recalculation
* Auditability
The scoring engine must be independent of the user interface.
Business rules must live in domain services, not React components, route handlers or server actions.
2. Authoritative Sources
Before writing code, inspect:

* The approved Prisma schema
* Existing migrations
* `docs/database.md`
* `docs/architecture.md`
* `docs/RBAC.md`
* The PAM-P Selection Metrics Framework
* The Application Review Guidelines
* The Interview Guidelines
* Any existing criterion, review, score, programme and cohort models
* Existing seed data
* Existing tests
The programme documents are the authoritative source for scoring criteria, weights, maximum scores, thresholds and review-stage rules.
Do not invent scoring criteria or weights.
Where programme documents and the current database design appear inconsistent:

1. Identify the inconsistency.
2. Explain the impact.
3. Select the least disruptive implementation that preserves the approved business rules.
4. Document the decision.
5. Do not redesign unrelated parts of the database.
3. Scope of This Phase
Build the domain foundation for:

* Review stages
* Review templates or frameworks
* Review criteria
* Criterion ordering
* Criterion weights
* Maximum scores
* Minimum scores where required
* Rating scales
* Criterion guidance
* Evidence guidance
* Review status
* Review score entries
* Draft score calculation
* Submitted score calculation
* Score validation
* Review locking
* Review reopening under controlled authority
* Framework versioning
* Programme and cohort association
* Audit logging
* Service-layer tests
* Integration tests
* Technical documentation
No full reviewer-facing user interface should be developed in this phase.
4. Mandatory Business Context
For PAM-P, the selection framework currently includes:

* Application Review: maximum score of 60
* Panel Interview: maximum score of 40
* Final combined score: maximum score of 100
The system must not hardcode these totals globally.
The framework must allow different programmes or cohorts to use different:

* Review stages
* Criteria
* Weights
* Maximum scores
* Rating scales
* Thresholds
* Scoring methods
The scoring engine must calculate totals from the active framework configuration.
5. Architecture Requirements
Use the existing project architecture and conventions.
Maintain separation between:

```

```


```
Domain models
Repositories
Services
Validation schemas
Permission guards
Audit logging
Server actions or route handlers
Presentation components
```

A suitable structure may include:

```

```


```
modules/
  reviews/
    domain/
    repositories/
    services/
    validation/
    types/
    constants/
    errors/
    tests/

lib/
  permissions/
  audit/
  logging/
  errors/
```

Adapt to the repository’s existing structure rather than creating duplicate abstractions.
Do not place scoring calculations directly in:

*  React components 
*  Server actions 
*  Route handlers 
*  Prisma calls embedded in pages 
6. Database Review
Inspect the current models for concepts equivalent to:

*  Programme 
*  Cohort 
*  ReviewStage 
*  ReviewTemplate 
*  ReviewCriterion 
*  CriterionScale 
*  Review 
*  ReviewScore 
*  Application 
*  User 
*  AuditLog 
Do not store criterion scores as JSON.
Scores must remain relational and queryable.
A review score should be traceable to:

*  One review 
*  One criterion 
*  The score awarded 
*  Any permitted comment 
*  The scorer 
*  The criterion configuration used 
*  The relevant framework version 
Where necessary, make only minimal schema changes and create a new migration.
Do not edit previously applied migrations.
7. Review Framework Model
The system must support a configurable review framework with the following concepts.
7.1 Review Stage
Examples may include:

*  Application Review 
*  Interview 
*  Committee Assessment 
A review stage must be associated with the appropriate programme and cohort configuration.
Recommended attributes include:

*  ID 
*  Programme ID 
*  Cohort ID, where stage configuration is cohort-specific 
*  Name 
*  Code 
*  Description 
*  Maximum total score 
*  Status 
*  Sequence order 
*  Opening date 
*  Closing date 
*  Whether comments are required 
*  Whether all criteria are mandatory 
*  Whether partial draft saving is permitted 
*  Created by 
*  Updated by 
*  Created date 
*  Updated date 
*  Soft-delete fields where consistent with the schema 
Use the approved database design where equivalent structures already exist.
7.2 Review Framework or Template
A framework must define the criteria and rules governing one review stage.
It should support:

*  Draft 
*  Published 
*  Retired or archived status 
*  Version number 
*  Effective date 
*  Programme association 
*  Cohort association where required 
*  Stage association 
*  Total configured score 
*  Publication validation 
*  Immutability after use 
Once a framework has been used in a submitted review, it must not be silently altered.
Changes must be handled through versioning or another controlled mechanism.
7.3 Review Criterion
Each criterion must support, where required:

*  Name 
*  Code 
*  Description 
*  Reviewer guidance 
*  Evidence guidance 
*  Display order 
*  Minimum score 
*  Maximum score 
*  Weight 
*  Whether the criterion is mandatory 
*  Whether a comment is mandatory 
*  Whether whole numbers only are allowed 
*  Whether decimal scores are allowed 
*  Active status 
*  Framework association 
Criterion codes must be unique within the relevant framework.
7.4 Rating Scale
Where the programme documents define rating bands, the system must support configurable scales such as:

*  Score value 
*  Label 
*  Description 
*  Behavioural anchor 
*  Evidence expectation 
*  Display order 
Do not assume that every criterion uses the same scale.
Support criterion-specific or framework-level scales where justified by the approved documents.
8. Framework Validation Rules
A framework must not be publishable unless it passes validation.
At minimum, validate:

*  It has at least one active criterion. 
*  Criterion codes are unique. 
*  Display order is valid. 
*  Minimum score is not greater than maximum score. 
*  Maximum score is positive. 
*  Weights are valid. 
*  The configured total matches the declared review-stage total. 
*  Required rating scales exist where applicable. 
*  No criterion has an invalid scale range. 
*  No retired criterion is included in a published framework. 
*  Programme and cohort relationships are valid. 
*  The framework is not already locked by submitted reviews. 
*  Required guidance fields are present where mandated by the programme documents. 
Return structured validation errors rather than one generic error.
9. Scoring Methods
The engine must support the scoring method required by the approved PAM-P framework and allow future extension.
Potential supported methods may include:

*  Direct score 
*  Weighted score 
*  Rating-scale score 
*  Percentage-normalised score 
Do not activate methods that are not needed, but structure the service so additional methods can be introduced without rewriting the core review model.
The score calculation must be deterministic.
The same inputs must always produce the same output.
10. Scoring Calculation Service
Create a dedicated scoring service.
It should expose functions equivalent to:

```

```


```
calculateCriterionScore(...)
calculateReviewRawScore(...)
calculateReviewWeightedScore(...)
calculateReviewTotal(...)
validateCriterionScore(...)
validateReviewScores(...)
recalculateReview(...)
getReviewScoreBreakdown(...)
```

The exact names may differ, but one authoritative scoring implementation must exist.
Do not duplicate formulas across modules.
Use a suitable decimal strategy.
Do not rely on unsafe binary floating-point arithmetic for authoritative score totals where decimal weights or scores are permitted.
Clearly document:

*  Rounding precision 
*  Rounding mode 
*  When rounding occurs 
*  How displayed values differ, if at all, from stored values 
11. Review Lifecycle
Support at least the following review statuses, aligned with the existing schema where possible:

*  Not started 
*  Draft 
*  In progress 
*  Submitted 
*  Reopened 
*  Superseded or cancelled, where required 
The lifecycle must enforce valid transitions.
Example:

```

```


```
NOT_STARTED
→ IN_PROGRESS
→ SUBMITTED
```

A submitted review must be locked against ordinary editing.
Reopening must require:

*  An authorised user 
*  A documented reason 
*  An audit entry 
*  A controlled status transition 
Do not allow arbitrary status changes.
Implement a central transition validator.
12. Draft and Submission Behaviour
The engine must distinguish between draft saving and final submission.
Draft
A reviewer may save partial scores where permitted.
Draft validation may allow:

*  Missing criterion scores 
*  Missing optional comments 
Draft validation must still reject:

*  Scores outside permitted ranges 
*  Invalid criterion IDs 
*  Criteria from another framework 
*  Duplicate criterion scores 
*  Invalid data types 
Submission
A review may be submitted only when:

*  Every mandatory criterion has a valid score. 
*  Required criterion comments are present. 
*  Required overall comments are present. 
*  The framework is active and valid. 
*  The review belongs to the correct reviewer and application. 
*  The review period is open, unless an authorised override applies. 
*  The calculated total matches the persisted score entries. 
*  The review has not already been submitted. 
*  The application remains eligible for that review stage. 
Submission must be transactional.
Either the complete submission succeeds or no submission state is changed.
13. Review Locking and Immutability
Once submitted:

*  Criterion scores must not be directly edited. 
*  Review comments must not be directly altered. 
*  The total score must not be manually overwritten. 
*  The framework version used must remain identifiable. 
*  The submission timestamp must remain recorded. 
*  The reviewer identity must remain recorded. 
Where a review is reopened:

*  Record who reopened it. 
*  Record why. 
*  Record when. 
*  Preserve sufficient audit history to reconstruct the prior submitted state. 
*  Recalculate the total on resubmission. 
Do not silently mutate historical scoring records.
14. Review Score Persistence
Implement repository and service methods for:

*  Creating a review 
*  Loading a review 
*  Saving draft criterion scores 
*  Updating draft criterion scores 
*  Removing an optional draft score 
*  Calculating the score breakdown 
*  Submitting the review 
*  Reopening the review 
*  Recalculating the review total 
*  Retrieving submitted review results 
Use transactions for multi-record changes.
Prevent duplicate score records for the same review and criterion through both:

*  Database constraints 
*  Service validation 
15. Framework Publication
Implement a controlled publication process.
Publishing a framework must:

1.  Validate the complete framework. 
2.  Confirm the declared maximum score. 
3.  Confirm all criteria and scales are valid. 
4.  Assign or confirm the version. 
5.  Record the publishing user. 
6.  Record the publication timestamp. 
7.  Create an audit entry. 
8.  Prevent unauthorised modification after use. 
Only appropriately authorised users may publish a framework.
Use existing permissions or introduce narrowly scoped permissions such as:

```

```


```
review_frameworks.view
review_frameworks.create
review_frameworks.update
review_frameworks.publish
review_frameworks.retire
review_scores.view
review_scores.submit
review_scores.reopen
```

Keep the current code-based RBAC approach for this version.
Do not redesign RBAC into database-managed roles during this phase.
16. Permissions
Align permissions with the current RBAC architecture.
At minimum:
System Administrator
May:

*  View frameworks 
*  Create frameworks 
*  Edit draft frameworks 
*  Publish frameworks 
*  Retire frameworks 
*  Reopen reviews 
*  View score configuration 
Programme Director
May:

*  View frameworks 
*  Create or edit frameworks where approved 
*  Publish frameworks where authorised 
*  View scoring configuration 
*  View review results 
Programme Secretary
May:

*  View frameworks 
*  View scoring configuration 
*  View review status 
*  Perform administrative review actions explicitly permitted by policy 
Reviewer
May eventually:

*  View assigned framework 
*  Save own draft scores 
*  Submit own review 
The Reviewer Workspace itself is outside this phase.
Every mutation must enforce permissions server-side.
17. Audit Requirements
Audit at least:

*  Framework created 
*  Framework updated 
*  Criterion created 
*  Criterion updated 
*  Criterion retired 
*  Framework published 
*  Framework retired 
*  Review created 
*  Draft score saved where proportionate 
*  Review submitted 
*  Review reopened 
*  Review recalculated 
*  Score changed following reopening 
*  Administrative override 
Audit records should include:

*  Actor 
*  Action 
*  Entity type 
*  Entity ID 
*  Programme ID 
*  Cohort ID 
*  Review ID where applicable 
*  Framework version 
*  Previous values where appropriate 
*  New values where appropriate 
*  Reason 
*  Correlation ID where available 
*  Timestamp 
Never log passwords, session data or unrelated sensitive applicant data.
18. Concurrency and Data Integrity
The engine must protect against concurrent updates.
Consider:

*  Two browser tabs editing the same review 
*  Double submission 
*  Framework modification while a review is in progress 
*  Score recalculation during submission 
*  Duplicate criterion records 
*  Stale draft writes 
Use one or more appropriate controls such as:

*  Transactions 
*  Unique constraints 
*  Optimistic concurrency fields 
*  Updated-at checks 
*  Status conditions in update queries 
Document the chosen approach.
A double submission must not create duplicate audit entries or inconsistent totals.
19. Soft Delete and Historical Integrity
Follow the project’s established soft-delete strategy.
Do not soft-delete or retire records in a way that breaks historical reviews.
A criterion or framework used in a submitted review must remain retrievable for reporting and audit purposes.
Prefer retirement or archival over destructive deletion.
20. Seed the Approved PAM-P Application Review Framework
Create an idempotent seed mechanism for the approved PAM-P application review framework.
The seed must derive its content from the authoritative selection documents.
It must include:

*  Application Review stage 
*  Maximum score of 60 
*  Approved criteria 
*  Approved criterion maximums or weights 
*  Approved descriptions 
*  Reviewer guidance 
*  Rating scales where applicable 
*  Criterion order 
*  Framework version 
*  Programme and cohort association where available 
Do not guess any missing criterion values.
Where the authoritative documents do not provide enough information:

*  Stop that specific seed operation. 
*  Identify the missing information in the final report. 
*  Do not insert invented data. 
The seed must not duplicate frameworks, criteria or scales when run more than once.
21. No Interview Framework Yet Unless Structurally Necessary
The engine must be capable of supporting the future interview score of 40.
However, do not fully seed or implement the interview framework unless the authoritative interview guidelines provide complete approved configuration and doing so does not expand the phase beyond the shared engine.
The operational interview module remains out of scope.
22. Validation Schemas
Use Zod for all external input.
Create schemas for actions equivalent to:

*  Create review framework 
*  Update review framework 
*  Create criterion 
*  Update criterion 
*  Create rating scale 
*  Save draft scores 
*  Submit review 
*  Reopen review 
*  Publish framework 
*  Retire framework 
Do not trust client-supplied:

*  Calculated totals 
*  Weights 
*  Framework status 
*  Reviewer identity 
*  Programme ID 
*  Cohort ID 
*  Permission claims 
*  Submission timestamps 
Authoritative values must be derived server-side.
23. Error Model
Use the existing typed application error architecture.
Add domain-specific errors only where necessary, such as:

*  InvalidReviewFrameworkError 
*  FrameworkNotPublishedError 
*  FrameworkLockedError 
*  InvalidScoreError 
*  IncompleteReviewError 
*  ReviewAlreadySubmittedError 
*  InvalidReviewTransitionError 
*  ReviewPeriodClosedError 
*  DuplicateCriterionScoreError 
*  ReviewConcurrencyError 
Do not expose internal database details to the user.
24. Minimal Administrative Verification
Do not build a complete review administration interface.
A minimal internal verification mechanism may be created only where needed to confirm:

*  Framework retrieval 
*  Criterion configuration 
*  Framework validation 
*  Seeded PAM-P criteria 
*  Score calculation output 
Prefer tests, scripts or development-only inspection over premature UI.
Do not create the Reviewer Workspace.
25. Testing Requirements
Create comprehensive automated tests.
25.1 Unit Tests
Test:

*  Criterion range validation 
*  Weight validation 
*  Framework total validation 
*  Direct-score calculation 
*  Weighted-score calculation where applicable 
*  Decimal precision and rounding 
*  Required-comment validation 
*  Duplicate criterion detection 
*  Review status transitions 
*  Submission completeness rules 
*  Framework publication validation 
*  Review locking 
*  Reopening rules 
25.2 Integration Tests
Using the real test PostgreSQL approach established in Phase 2, test:

*  Creating a draft framework 
*  Adding criteria 
*  Publishing a valid framework 
*  Rejecting an invalid framework 
*  Creating a review against a published framework 
*  Saving partial draft scores 
*  Rejecting out-of-range scores 
*  Rejecting scores from another framework 
*  Submitting a complete review 
*  Rejecting incomplete submission 
*  Preventing edits after submission 
*  Authorised reopening 
*  Unauthorised reopening 
*  Recalculation after reopening 
*  Duplicate submission protection 
*  Audit records 
*  Programme and cohort isolation 
*  Soft-deleted records being excluded appropriately 
*  Historical criteria remaining available 
25.3 Permission Tests
Test:

*  Authorised user can create a framework. 
*  Unauthorised user is denied. 
*  Authorised user can publish. 
*  Reviewer cannot publish. 
*  Reviewer cannot reopen a submitted review. 
*  Client-supplied role data cannot bypass server checks. 
25.4 Data Integrity Tests
Test:

*  One score per review and criterion. 
*  Correct framework version persists. 
*  Stored totals equal calculated totals. 
*  Concurrent or repeated submission does not duplicate results. 
*  Frameworks in use cannot be destructively modified. 
26. Verification Commands
The phase is not complete until all applicable checks pass:

```

```


```
npx prisma validate
npx prisma migrate status
npx tsc --noEmit
npx eslint .
npx vitest run
npm run build
```

Where additional test commands are introduced, include their results.
27. Documentation Deliverables
Create or update:

```

```


```
docs/REVIEW_FRAMEWORK.md
docs/SCORING_ENGINE.md
docs/REVIEW_LIFECYCLE.md
docs/SCORE_CALCULATION_RULES.md
docs/PHASE_3A_IMPLEMENTATION_REPORT.md
docs/database.md
docs/architecture.md
docs/RBAC.md
docs/SEEDING.md
README.md
```

Documentation must explain:

*  Review domain model 
*  Framework versioning 
*  Criterion model 
*  Rating scales 
*  Calculation formulas 
*  Decimal and rounding strategy 
*  Draft and submission behaviour 
*  Review status transitions 
*  Locking and reopening 
*  Concurrency controls 
*  Permission model 
*  Audit behaviour 
*  Seeded PAM-P framework 
*  Schema changes 
*  Migration strategy 
*  Test strategy 
*  Known limitations 
*  Deferred work 
28. Acceptance Criteria
Phase 3A is complete only when:

*  A review framework can be created as a draft. 
*  Criteria can be configured relationally. 
*  Framework validation is implemented. 
*  A valid framework can be published. 
*  An invalid framework cannot be published. 
*  Published framework versions are protected from uncontrolled changes. 
*  Draft review scores can be saved. 
*  Invalid scores are rejected. 
*  Review totals are calculated by one authoritative scoring service. 
*  The PAM-P application-review framework totals 60. 
*  Submitted reviews are complete, transactional and locked. 
*  Submitted scores remain historically traceable. 
*  Reviews can be reopened only through an authorised, audited process. 
*  Recalculation works correctly. 
*  Programme and cohort isolation is enforced. 
*  Audit records are generated for sensitive actions. 
*  Unit and integration tests pass. 
*  Type checking passes. 
*  Linting passes. 
*  The production build passes. 
*  Documentation is complete. 
29. Explicitly Out of Scope
Do not build:

*  Reviewer Workspace 
*  Reviewer assignment engine 
*  Equal workload distribution 
*  Blind reviewer identity controls 
*  Third-reviewer divergence logic 
*  Interview scheduling 
*  Interview Workspace 
*  Committee Workspace 
*  Executive Approval 
*  Admissions 
*  Applicant import enhancements 
*  Notifications 
*  Full administrative framework UI 
*  Database-managed dynamic RBAC 
*  Fellow Portal 
*  Learning Portal 
Do not continue to Phase 3B automatically.
30. Required Final Response
When Phase 3A is complete, provide:

1.  Executive summary. 
2.  Files created and modified. 
3.  Schema changes. 
4.  Migration details. 
5.  Review framework architecture. 
6.  Criterion and rating-scale design. 
7.  Framework versioning approach. 
8.  Scoring formulas. 
9.  Decimal and rounding strategy. 
10.  Review lifecycle and transition rules. 
11.  Locking, reopening and historical-integrity controls. 
12.  Permission additions. 
13.  Audit implementation. 
14.  Seeded PAM-P review framework. 
15.  Unit and integration test results. 
16.  Prisma validation and migration status. 
17.  Type-check, lint and build results. 
18.  Security and concurrency considerations. 
19.  Known limitations. 
20.  Decisions requiring programme-owner confirmation. 
21.  Recommended scope for Phase 3B. 
Stop after Phase 3A and wait for explicit review and approval before beginning reviewer assignment or reviewer-facing interfaces.
```

---

## Entry 10 — 2026-07-18 23:52 UTC — Continuous-session gating discipline

**Response:** Established the "run all tests, fix failures, verify before moving to the next phase" discipline that has held for every phase and module since, including the just-completed Interview Scheduling module.

```text
Treat this as a continuous implementation session.
Complete each phase in order.
Before moving to the next phase:

* run all tests,
* fix failures,
* refactor where appropriate,
* update documentation,
* create an Architecture Decision Record (ADR),
* verify the application builds successfully.
Do not skip phases.
Do not begin a later phase until the current phase is internally complete.
If a later phase requires changing an earlier implementation, refactor it first rather than adding duplicate logic.
Produce a comprehensive implementation report only after all assigned phases are complete.PHASE 3B – REVIEW ASSIGNMENT ENGINE & BLIND REVIEW ORCHESTRATION
This is arguably the most critical part of the PAM-P selection process because it implements your core business rules:

* Equal workload distribution
* Blind review
* Two independent reviewers
* Automatic third reviewer
* Conflict-of-interest detection
* Review reassignment
* Reviewer workload analytics
* Review progress tracking
This engine will power every future reviewer screen.
CLAUDE CODE PROMPT
PAM-P FELLOWSHIP MANAGEMENT SYSTEM
PHASE 3B — REVIEW ASSIGNMENT ENGINE & BLIND REVIEW ORCHESTRATION
The Review Framework and Scoring Engine (Phase 3A) has been completed and approved.
Proceed to Phase 3B: Review Assignment Engine and Blind Review Orchestration.
Do not build the Reviewer Workspace UI, Interview Workspace, Committee Workspace, Executive Approval or Admissions modules during this phase.
This phase is entirely about implementing the business engine that manages reviewer allocation, blind review, workload balancing, conflicts of interest, reassignment and automatic third-review escalation.
1. Objective
Develop a reusable assignment engine that automatically manages application allocation to reviewers while ensuring:

* Fair workload distribution
* Reviewer independence
* Blind assessment
* Conflict-of-interest protection
* Review progress monitoring
* Automatic third-review assignment
* Full auditability
* Transactional integrity
The engine must be reusable for future programmes and review stages.
2. Authoritative Business Rules
The following PAM-P rules are mandatory:

* Every eligible application is initially assigned to two reviewers.
* Reviewers must not see each other's scores or comments until the review cycle is complete.
* Applications must be distributed as evenly as possible across reviewers.
* A reviewer must never review the same application twice.
* Reviewer assignments must be auditable.
* If the score difference between Reviewer 1 and Reviewer 2 exceeds the configured threshold (currently 13 percentage points), the system automatically assigns a third reviewer.
* The final score becomes the average of:
   * Reviewer 3's score
   * The lower of Reviewer 1 and Reviewer 2's scores
* Third reviewers must not know they are resolving a disagreement unless programme policy explicitly requires this.
* The Programme Secretary may manually reassign reviews with an audit trail.
* No reviewer may assign work to themselves.
All threshold values must be configurable.
3. Scope
Implement:

* Assignment engine
* Reviewer availability model
* Reviewer capacity management
* Workload balancing algorithm
* Blind-review controls
* Assignment lifecycle
* Third-review engine
* Reassignment workflow
* Assignment audit logging
* Assignment analytics
* Assignment validation
* Services
* Tests
* Documentation
Do not build reviewer-facing pages.
4. Assignment Model
Review the existing schema before introducing changes.
Support concepts equivalent to:

* Reviewer Assignment
* Assignment Status
* Assignment History
* Assignment Batch
* Reviewer Capacity
* Conflict of Interest
* Escalation Record
If equivalent models already exist, reuse them.
Only introduce minimal schema changes where necessary.
5. Assignment Lifecycle
Support statuses such as:

* Pending
* Assigned
* Accepted
* In Progress
* Submitted
* Escalated
* Reassigned
* Cancelled
* Completed
Define a single authoritative transition validator similar to the Review Lifecycle implementation.
6. Workload Balancing Algorithm
Implement an assignment service that:

* Calculates each reviewer's active workload.
* Considers reviewer availability.
* Considers reviewer capacity.
* Prevents significant imbalance.
* Supports future weighted capacities.
* Supports future specialist reviewers.
Where workloads are equal, distribute randomly or round-robin while maintaining deterministic auditability.
Document the chosen algorithm.
7. Blind Review Controls
Implement server-side controls ensuring:

* Reviewer identities remain hidden from other reviewers.
* Reviewer comments remain hidden until the workflow permits disclosure.
* Reviewer scores remain hidden during active review.
* APIs return only information appropriate to the requesting reviewer.
No client-side filtering should be relied upon for blindness.
8. Conflict-of-Interest Management
Provide support for:

* Manual conflict declaration.
* Administrative conflict recording.
* Automatic exclusion from assignment.
* Conflict reason capture.
* Conflict expiry where applicable.
A conflicted reviewer must never receive the affected application.
9. Third Review Engine
Implement a dedicated service that:

1. Detects when the difference between Reviewer 1 and Reviewer 2 exceeds the configured threshold.
2. Selects the next eligible reviewer.
3. Creates the third-review assignment.
4. Prevents assigning Reviewer 1 or Reviewer 2.
5. Prevents assigning conflicted reviewers.
6. Records an audit event.
7. Prevents duplicate third reviews.
The threshold must be configurable, not hardcoded.
10. Reassignment
Support controlled reassignment.
Requirements:

* Only authorised users.
* Mandatory reason.
* Audit record.
* Preserve assignment history.
* Preserve original reviewer.
* Preserve timestamps.
* Preserve review status.
* Do not silently overwrite assignments.
11. Reviewer Capacity
Support:

* Maximum concurrent assignments.
* Temporary suspension.
* Leave/unavailable status.
* Programme-specific eligibility.
* Stage-specific eligibility.
The engine must not assign work beyond reviewer capacity.
12. Assignment Analytics
Implement services that calculate:

* Active assignments per reviewer.
* Completed assignments.
* Average turnaround.
* Reviewer utilisation.
* Assignment backlog.
* Escalation rate.
* Third-review frequency.
No dashboard UI yet.
13. Security
All assignment operations must:

* Enforce RBAC.
* Be server-authorised.
* Use transactions.
* Prevent duplicate assignments.
* Prevent self-assignment.
* Prevent assignment to inactive reviewers.
* Prevent assignment outside authorised programmes.
14. Audit
Audit:

* Assignment creation.
* Assignment acceptance.
* Assignment reassignment.
* Conflict declaration.
* Escalation.
* Third-review assignment.
* Assignment cancellation.
* Capacity changes.
15. Testing
Create comprehensive unit and integration tests covering:

* Equal distribution.
* Capacity enforcement.
* Conflict detection.
* Blind review enforcement.
* Third-review assignment.
* Reassignment.
* Duplicate prevention.
* Concurrent assignment.
* Transaction rollback.
* Audit generation.
* Permission enforcement.
16. Documentation
Create:

```

```


```
docs/REVIEW_ASSIGNMENT_ENGINE.md
docs/BLIND_REVIEW.md
docs/THIRD_REVIEW_ENGINE.md
docs/REVIEWER_WORKLOAD.md
docs/PHASE_3B_IMPLEMENTATION_REPORT.md
```

Explain:

*  Assignment algorithm 
*  Blind-review implementation 
*  Conflict handling 
*  Third-review calculation 
*  Capacity model 
*  Concurrency controls 
*  Audit model 
*  Known limitations 
17. Acceptance Criteria
This phase is complete only when:

*  Applications can be assigned automatically. 
*  Workloads remain balanced. 
*  Reviewer blindness is enforced server-side. 
*  Conflicts prevent assignment. 
*  Third reviewers are automatically assigned when thresholds are exceeded. 
*  Reassignment preserves history. 
*  Audit records are complete. 
*  Transactions guarantee consistency. 
*  Unit and integration tests pass. 
*  Type checking passes. 
*  Linting passes. 
*  Production build succeeds. 
*  Documentation is complete. 
18. Out of Scope
Do not build:

*  Reviewer dashboard 
*  Reviewer scoring screens 
*  Interview module 
*  Committee module 
*  Executive approval 
*  Admissions 
*  Email notifications 
*  Calendar integration 
*  Analytics dashboard UI 
Stop after completing Phase 3B.
One additional recommendation
From this point onward, ask Claude to include an Architecture Decision Record (ADR) with every phase.
For example, require a file like:

```

```


```
docs/adr/ADR-0007-review-assignment-algorithm.md
```

Each ADR should document:

*  The decision made. 
*  Alternatives considered. 
*  Why the chosen approach was selected. 
*  Consequences. 
*  Future implications. 
As the project grows, these ADRs will become invaluable for understanding and maintaining the system, especially if other developers join or the platform expands beyond PAM-P.
```

---

## Entry 11 — 2026-07-18 23:52 UTC — Phase 3B brief: Review Assignment Engine

**Response:** See `docs/PHASE_3B_IMPLEMENTATION_REPORT.md`, `docs/REVIEW_ASSIGNMENT_ENGINE.md`, `docs/BLIND_REVIEW.md`, `docs/THIRD_REVIEW_ENGINE.md`, `docs/adr/ADR-0007-review-assignment-algorithm.md`, `docs/adr/ADR-0008-third-review-divergence-and-reassignment-history.md`.

```text
Phase 3B — Review Assignment Engine

* Assignment engine
* Equal workload distribution
* Blind review
* Third-review logic
* Conflict-of-interest engine
* Reviewer workload management
* Assignment audit trail
Deliverables

* Code
* Tests
* Documentation
* ADR
Phase 3C — Reviewer Workspace
After the assignment engine is complete:
Build:

* Reviewer dashboard
* Assigned reviews
* Draft reviews
* Submitted reviews
* Scoring forms
* Criterion comments
* Progress indicators
* Autosave
* Review submission
* Accessibility
* Responsive layout
No interview functionality yet.
Phase 3D — Programme Secretariat Workspace
Build:

* Assignment monitoring
* Review progress
* Reassignment
* Third-review monitoring
* Review statistics
* Eligibility progression
* Reviewer workload analytics
* Administrative controls
Phase 4A — Interview Engine
Implement:

* Interview scheduling
* Panel management
* Interview questions
* Interview scoring (/40)
* Panel comments
* Average calculation
* Tie-breaking
* Audit
* Reports
Phase 4B — Interview Workspace
Build:

* Interview panel dashboard
* Candidate profile
* Question scoring interface
* Panel completion tracking
* Live score aggregation
* Interview reports
Phase 5 — Committee & Executive Approval
Implement:

* Top-70 ranking
* Committee workspace
* Cohort balancing
* Final 30 selection
* Reserve list
* Executive approval workflow
* Offer generation
* Admission decisions
Phase 6 — Notifications & Reporting
Implement:

* Email templates
* In-app notifications
* Applicant status updates
* Panel notifications
* Excel export
* CSV export
* Executive reports
* Programme analytics
Phase 7 — Production Readiness
Complete:

* Security review
* Performance optimisation
* Caching
* Database indexing review
* Accessibility review
* UI consistency
* Test coverage improvements
* Playwright end-to-end tests
* CI/CD pipeline
* Docker support
* Production deployment guide
At the beginning of the master prompt, include these instructions
Treat this as a continuous implementation session.
Complete each phase in order.
Before moving to the next phase:

* run all tests,
* fix failures,
* refactor where appropriate,
* update documentation,
* create an Architecture Decision Record (ADR),
* verify the application builds successfully.
Do not skip phases.
Do not begin a later phase until the current phase is internally complete.
If a later phase requires changing an earlier implementation, refactor it first rather than adding duplicate logic.
Produce a comprehensive implementation report only after all assigned phases are complete.
```

---

## Entry 12 — 2026-07-19 10:05 UTC — Phase 3B.1 brief: Role Vocabulary, Permission and Navigation Reconciliation

**Response:** See `docs/PHASE_3B1_IMPLEMENTATION_REPORT.md`, `docs/ROLE_AND_NAVIGATION_RECONCILIATION.md`, `docs/adr/ADR-0009-role-vocabulary-and-navigation-taxonomy.md` — split the original REVIEWER role into ELIGIBILITY_REVIEWER / APPLICATION_REVIEWER and reconciled the 12-item navigation taxonomy. Note: this brief was pasted twice in immediate succession (10:05 and 10:15 UTC, identical text) — a resend, not two separate instructions; only captured once here.

```text
PAM-P FELLOWSHIP MANAGEMENT SYSTEM

PHASE 3B.1 — ROLE VOCABULARY, PERMISSION AND NAVIGATION RECONCILIATION

The following implementation phases have been completed:

- Phase 0: Authentication, RBAC and application shell
- Sequence 1: Applicant import, eligibility engine and preliminary reviewer automation
- Database foundation
- Phase 2: Authentication, RBAC and audit logging foundation
- Phase 3A: Review framework and scoring engine
- Phase 3B: Review assignment engine and blind-review orchestration

Before building the Reviewer Workspace, resolve the two open architecture items recorded in docs/architecture.md:

1. The role vocabulary in the codebase differs from the approved PAM-P operational roles.
2. The navigation taxonomy differs from the frozen EFMS prototype and the approved selection workflow.

Do not build the Reviewer Workspace until this reconciliation is complete.

OBJECTIVE

Create one authoritative role, permission and navigation model aligned with the approved PAM-P workflow and existing implementation.

APPROVED STAFF ROLES

The authoritative operational roles are:

- System Administrator
- Programme Director
- Programme Secretary/Admin
- Eligibility Reviewer
- Application Reviewer
- Interviewer
- Selection Committee Member
- Executive
- Fellow — future phase

Review whether the current generic REVIEWER role must be split into:

- ELIGIBILITY_REVIEWER
- APPLICATION_REVIEWER

Do not retain duplicate or overlapping role concepts without documented justification.

The Programme Secretary/Admin role is the operational Secretariat role.

The Observer role must not remain unless there is an approved business requirement. Where read-only oversight is required, express it through permissions assigned to an approved role rather than introducing an unsupported role.

APPROVED WORKFLOW TAXONOMY

Navigation and permissions must align with:

1. Dashboard
2. Applicant Import
3. Eligibility Screening
4. Application Review
5. Interview Management
6. Selection Committee
7. Executive Approval
8. Admissions
9. Reports
10. Notifications
11. Audit Trail
12. Administration

Future modules may remain hidden or marked as unavailable, but the taxonomy must not conflict with the approved workflow.

TASKS

1. Inspect:
   - Prisma schema
   - role enums
   - permission catalogue
   - role-permission matrix
   - navigation configuration
   - route guards
   - seed data
   - tests
   - frozen EFMS prototype references
   - docs/architecture.md
   - docs/RBAC.md

2. Produce a discrepancy matrix showing:
   - current role or nav item
   - approved equivalent
   - required action
   - migration or compatibility impact

3. Reconcile role vocabulary.

4. Reconcile the permission catalogue.

5. Reconcile the role-permission matrix.

6. Reconcile navigation groups and labels.

7. Update server-side guards and route access.

8. Preserve existing users safely where role enum changes are required.

9. Create a safe migration if database enum changes are necessary.

10. Update seed scripts idempotently.

11. Update tests.

12. Update documentation.

ROLE MIGRATION REQUIREMENTS

Where a generic REVIEWER role currently exists:

- Determine whether existing users are eligibility reviewers or application reviewers.
- Do not silently assign both roles.
- Where the existing data does not establish the correct role, document the affected users and use the least-privilege option.
- Preserve auditability.
- Do not delete user accounts.
- Do not rewrite previously applied migrations.

NAVIGATION REQUIREMENTS

The application shell must remain:

- responsive
- navy and gold
- accessible
- mobile compatible
- collapsible
- permission-driven

Navigation visibility must not be treated as authorisation. Server-side permissions remain authoritative.

DOCUMENTATION

Create or update:

- docs/ROLE_AND_NAVIGATION_RECONCILIATION.md
- docs/RBAC.md
- docs/architecture.md
- docs/PHASE_3B1_IMPLEMENTATION_REPORT.md
- docs/adr/ADR-role-vocabulary-and-navigation-taxonomy.md

TESTS

Test:

- each approved role receives the correct permissions
- eligibility reviewers cannot perform application reviews unless separately authorised
- application reviewers cannot modify eligibility decisions
- interviewers cannot access committee or executive actions
- executives have read-only access except for authorised approval actions
- unsupported Observer access is removed
- navigation matches permissions
- direct URL access remains server-protected
- migrated users retain valid access
- inactive and suspended users remain blocked

VERIFICATION

Run:

npx prisma validate
npx prisma migrate status
npx tsc --noEmit
npx eslint .
npx vitest run
npm run build

ACCEPTANCE CRITERIA

This phase is complete only when:

- one authoritative role vocabulary exists
- one permission catalogue exists
- one navigation taxonomy exists
- role and nav naming matches approved PAM-P terminology
- unsupported roles are removed or formally justified
- existing users are safely migrated
- server-side permission enforcement remains intact
- all tests pass
- documentation is complete

Stop after Phase 3B.1 if any unresolved role mapping requires programme-owner confirmation.

If no unresolved governance decision remains and all verification commands pass, proceed to Phase 3C.
```

---

## Entry 13 — 2026-07-19 12:09 UTC — Phase 3D brief: Programme Secretariat Review Operations Workspace

**Response:** See `docs/PHASE_3D_IMPLEMENTATION_REPORT.md`, `docs/PROGRAMME_SECRETARIAT_WORKSPACE.md`, `docs/adr/ADR-0011-review-operations-read-model.md`, `docs/adr/ADR-0012-operational-export-controls.md`. Note: this brief says "Proceed only after Phase 3C has passed all verification" — no separate Phase 3C brief exists in this history; it was built as a natural continuation under Entry 10's gating instruction, not from a distinct user prompt. See `docs/PHASE_3C_IMPLEMENTATION_REPORT.md`, `docs/REVIEWER_WORKSPACE.md`, `docs/adr/ADR-0010-reviewer-workspace-autosave-and-serialization.md` for what was built.

```text
PAM-P FELLOWSHIP MANAGEMENT SYSTEM

PHASE 3D — PROGRAMME SECRETARIAT REVIEW OPERATIONS WORKSPACE

Proceed only after Phase 3C has passed all verification commands.

Build the operational workspace used by the Programme Secretary/Admin to manage the application-review stage.

The Secretariat must have visibility and operational control without compromising blind-review independence.

OBJECTIVE

Provide the Programme Secretariat with tools to:

- monitor reviewer assignments
- monitor review progress
- identify overdue or stalled reviews
- manage conflicts and recusals
- reassign reviews
- monitor third-review escalation
- inspect reviewer workloads
- view authorised comments and results
- track stage completion
- export operational data
- preserve a complete audit trail

SCOPE

Build:

- Review operations dashboard
- Assignment monitoring table
- Reviewer workload view
- Application review status view
- Conflict and recusal queue
- Reassignment workflow
- Third-review monitoring
- Overdue-review monitoring
- Review completion analytics
- Operational export
- Administrative notes
- Audit visibility
- Responsive layouts
- Tests
- Documentation

Do not build:

- Interview module
- Committee module
- Executive Approval
- Admissions
- Applicant notifications
- Email delivery
- Final selection functionality

SECRETARIAT ACCESS RULES

The Programme Secretary/Admin may:

- view assignment status
- view reviewer identities for administrative purposes
- view submitted reviewer comments
- view submitted scores where approved
- initiate authorised reassignment
- record administrative notes
- monitor divergence and third-review status
- export authorised operational data

The Programme Secretary/Admin must not:

- alter a reviewer’s submitted score directly
- impersonate a reviewer
- submit a review on behalf of a reviewer except through a separately approved emergency override
- modify a published framework
- reveal one reviewer’s work to another reviewer
- manually overwrite calculated aggregate scores

DASHBOARD

Display:

- total eligible applications
- applications assigned
- applications awaiting assignment
- reviews not started
- reviews in progress
- reviews submitted
- reviews overdue
- recusals
- reassignments
- third reviews triggered
- third reviews outstanding
- stage completion percentage
- reviewer utilisation

Use DashboardService or an equivalent central query service.

Do not place aggregate query logic directly in page components.

ASSIGNMENT MONITORING

Provide server-paginated tables with:

- application number
- pathway
- assigned reviewers
- assignment status
- review progress
- assigned date
- due date
- submitted date
- conflict status
- third-review status

Support filters for:

- reviewer
- status
- pathway
- overdue
- conflict
- third review
- assignment batch

REASSIGNMENT

Use the Phase 3B reassignment engine.

Require:

- replacement reviewer
- reason
- confirmation
- permission check
- transaction
- audit record

Do not overwrite assignment history.

The system must prevent:

- assigning the same reviewer again
- assigning a conflicted reviewer
- assigning an inactive reviewer
- exceeding reviewer capacity
- assigning an unauthorised reviewer
- Secretariat self-assignment where prohibited

THIRD-REVIEW MONITORING

Show:

- applications that triggered third review
- configured threshold
- first two submitted scores
- absolute or percentage divergence
- third reviewer assignment status
- third review completion
- final aggregated score

Do not disclose this information to reviewers.

Use the dedicated aggregation service. Do not recalculate formulas in the UI.

COMMENTS AND SCORE VISIBILITY

The Secretariat may view submitted reviewer comments and scores where approved.

Keep Reviewer 1 and Reviewer 2 blind to each other.

Clearly distinguish:

- reviewer score
- reviewer comment
- aggregate score
- third-review score
- final calculated score
- administrative note

ADMINISTRATIVE NOTES

Support notes that are:

- timestamped
- attributed
- non-destructive
- auditable
- separate from reviewer comments

Do not allow administrative notes to modify scoring outcomes.

EXPORT

Support CSV and Excel-compatible export for authorised operational data.

Export must respect:

- permissions
- programme boundaries
- cohort boundaries
- data-minimisation rules

Include an export audit event.

Do not expose password, session, secret or unrelated sensitive fields.

PERMISSIONS

Use narrowly scoped permissions, such as:

- review_operations.view
- review_assignments.view
- review_assignments.reassign
- review_conflicts.manage
- review_escalations.view
- review_results.view
- reviewer_workload.view
- review_operations.export
- administrative_notes.create
- audit.view

All mutations require server-side checks.

AUDIT

Audit:

- reassignment
- conflict handling
- third-review assignment
- administrative note creation
- review reopening
- operational export
- emergency override, where implemented
- stage configuration changes

TESTING

Add unit, integration and Playwright tests.

Test:

- authorised Secretariat access
- unauthorised access denial
- correct dashboard totals
- programme and cohort isolation
- reassignment validation
- assignment-history preservation
- conflict exclusion
- capacity enforcement
- third-review status display
- score aggregation accuracy
- reviewer blindness remains intact
- export permissions
- export audit record
- mobile and desktop usability
- pagination and filters

DOCUMENTATION

Create or update:

- docs/PROGRAMME_SECRETARIAT_WORKSPACE.md
- docs/REVIEW_OPERATIONS.md
- docs/REVIEW_REASSIGNMENT.md
- docs/REVIEW_MONITORING_AND_ESCALATION.md
- docs/PHASE_3D_IMPLEMENTATION_REPORT.md
- docs/adr/ADR-review-operations-read-model.md
- docs/adr/ADR-operational-export-controls.md

VERIFICATION

Run:

npx prisma validate
npx prisma migrate status
npx tsc --noEmit
npx eslint .
npx vitest run
npx playwright test
npm run build

ACCEPTANCE CRITERIA

Phase 3D is complete only when:

- Secretariat can monitor the complete application-review stage
- reviewer workloads are visible
- conflicts and recusals can be managed
- reviews can be reassigned safely
- third reviews can be monitored
- aggregate scores are accurate
- reviewer independence remains protected
- exports are permission-controlled and audited
- responsive layouts work
- tests pass
- documentation is complete

Stop after Phase 3D.

Do not begin the Interview Engine automatically.

Provide a consolidated overnight implementation report covering Phases 3B.1, 3C and 3D, including:

1. commits created
2. schema changes
3. migrations
4. role and navigation reconciliation
5. Reviewer Workspace
6. Secretariat Workspace
7. test results
8. build results
9. security findings
10. accessibility findings
11. known limitations
12. recommended Interview Engine scope
```

---

## Entry 14 — 2026-07-19 12:10 UTC — Sequencing/gating clarification

**Response:** Reaffirmed the gated-phase discipline from Entry 10.

```text
Complete these prompts sequentially. Treat each as a mandatory gated phase. Do not begin a later phase unless the earlier phase passes its tests, type-check, lint and production build. Stop immediately if a governance decision or destructive migration requires my approval.
```

---

## Entry 15 — 2026-07-19 13:28 UTC — Release 1.5 brief: Enterprise Configuration Centre & Operational Governance

**Response:** See `docs/PHASE_RELEASE_1_5_IMPLEMENTATION_REPORT.md`, `docs/CONFIGURATION_CENTRE_GUIDE.md`, `docs/CONFIGURATION_REFERENCE.md`, `docs/ELIGIBILITY_QA_GOVERNANCE.md`, `docs/OPERATIONAL_GOVERNANCE_GUIDE.md`, `docs/FEATURE_FLAGS.md`, `docs/adr/ADR-0013-configuration-centre-storage.md`, `docs/adr/ADR-0014-audit-context-async-local-storage.md`. Delivered: Configuration Centre (7 categories), Eligibility Reviewer QA governance model, Secretariat Risk Dashboard, AsyncLocalStorage-based audit context, feature flags, axe-core accessibility tooling, and the repo's first GitHub Actions CI workflow.

```text
Yes. Below is a direct implementation prompt you can give Claude immediately after Phase 3D. It is written in the same enterprise style as the previous prompts.
PAM-P Fellowship Management System
Release 1.5 – Enterprise Configuration Centre & Operational Governance
Implementation Prompt for Claude
You are continuing development of the PAM-P Fellowship Management System.
The existing architecture, coding standards, documentation standards, testing discipline, RBAC model, service layer, repository pattern, ADR process and gated implementation workflow must be preserved exactly.
Do not redesign existing architecture.
Do not introduce shortcuts.
Do not modify completed phases except where explicitly required.
Objective
Implement a comprehensive Enterprise Configuration Centre and resolve the final outstanding governance decisions before development of the Interview Engine begins.
This phase is intended to eliminate hard-coded operational settings and provide Programme Administrators with complete control over programme configuration without requiring code changes.
This phase is a governance and platform administration phase—not an interview phase.
Phase 1 — Configuration Centre
Create a new administration module:

```
Administration
    └── Configuration Centre

```

The Configuration Centre must be permission protected.
Only the following roles may access it:

* Director
* Programme Administrator
* System Administrator
All configuration changes must be fully audited.
Configuration Categories
Implement the following configuration modules.
1. Programme Configuration
Administrators must be able to configure:

* Programme Name
* Programme Code
* Cohort Name
* Cohort Year
* Application Opening Date
* Application Closing Date
* Eligibility Review Window
* Application Review Window
* Interview Window
* Executive Approval Window
* Offer Window
Changing these values must update the entire system automatically.
No hardcoded dates may remain.
2. Review Configuration
Allow administrators to configure:

* Number of reviewers
* Third review threshold
* Blind review enabled
* Maximum reviewer workload
* Reviewer reassignment rules
* Automatic assignment enabled
* Review completion deadline
* Review reminder frequency
The current implementation must continue to function exactly as before using configurable values instead of constants.
3. Interview Configuration
Prepare for the Interview Engine.
Allow configuration of:

* Number of interview panellists
* Interview duration
* Passing score
* Interview weighting
* Tie-break rules
* Reserve list size
* Interview scheduling window
No interview functionality should be built yet.
Only configuration.
4. Scoring Configuration
Allow administrators to configure:

* Total score
* Stage weightings
* Passing thresholds
* Ranking method
* Third-review calculation strategy
* Minimum qualifying score
No calculation logic should be duplicated.
Existing scoring services must consume configuration values.
5. Notification Configuration
Create configuration for:

* Reminder intervals
* Notification timing
* Email sender name
* Email reply address
* Escalation timing
* Notification enable/disable
Do not build the notification engine.
Only configuration.
6. File Upload Configuration
Allow administrators to configure:

* Maximum upload size
* Allowed file types
* Maximum documents
* Virus scan requirement flag
* Image compression
* Document retention period
7. Security Configuration
Allow configuration of:

* Session timeout
* Password policy
* Failed login threshold
* Account lock duration
* MFA requirement (future flag)
* Audit retention period
Phase 2 — Governance Resolution
Resolve the outstanding Eligibility Reviewer governance decision.
Implement the following governance model:
Eligibility Screening remains fully automated.
Eligibility Reviewer becomes a Quality Assurance role.
Capabilities:

* View eligibility decisions
* Review automated eligibility outcomes
* Flag questionable cases
* Recommend override
* Submit recommendation
Cannot:

* Approve applicants
* Reject applicants
* Edit applicant data
* Change eligibility result directly
Only Programme Secretariat may execute an approved override.
Every recommendation and override must be fully audited.
Phase 3 — Operational Dashboard
Extend the Secretariat Dashboard with a Risk Dashboard.
Include:
Applications approaching deadline
Overloaded reviewers
Third-review rate
Conflict declarations
Pending escalations
Review backlog
Average completion time
Applications stalled
Applications awaiting reassignment
Applications requiring attention
Display these as operational metrics.
No new business logic.
Only aggregate existing data.
Phase 4 — Audit Enhancement
Extend every audit record with:
Correlation ID
Request ID
User Session ID
IP Address (where available)
User Agent
Timestamp
Every multi-step action must share the same Correlation ID.
Phase 5 — Feature Flags
Implement enterprise feature flags.
Create a Feature Flag service.
Allow enabling/disabling:
Interview Module
Notifications
Executive Dashboard
Exports
Analytics
Future AI Assistant
No feature should require code removal to disable.
Phase 6 — Accessibility
Integrate automated accessibility validation.
Include:
axe-core
CI accessibility checks
WCAG validation
Keyboard navigation verification
Colour contrast verification
Document any accessibility failures.
Phase 7 — Documentation
Produce:
Configuration Centre Guide
Operational Governance Guide
Eligibility QA Governance
Feature Flag Documentation
Configuration Reference
Administrator Guide
Update all ADRs.
Update architecture diagrams.
Update navigation documentation.
Phase 8 — Testing
Add comprehensive tests.
Include:
Unit tests
Integration tests
Configuration validation tests
RBAC tests
Audit tests
Accessibility tests
Migration tests
Regression tests
Existing tests must continue passing.
Coverage must not decrease.
Acceptance Criteria
This phase is complete only if:

* No operational values remain hardcoded.
* Programme configuration requires no code changes.
* Governance decisions are fully documented.
* Configuration changes are audited.
* Existing functionality remains unchanged.
* All automated tests pass.
* Build passes.
* Lint passes.
* TypeScript passes.
* Migrations succeed.
* Documentation is updated.
* ADRs are completed.
Scope Restrictions
Do NOT begin:

* Interview Engine
* Interview Scheduling
* Notification Engine
* Executive Approval
* Offer Management
* AI Features
Those belong to subsequent phases.
Deliverables
Provide:

1. Implementation Summary
2. Architecture Decisions (ADRs)
3. Database Changes
4. API Changes
5. RBAC Changes
6. UI Screens Added
7. Documentation Added
8. Test Results
9. Accessibility Results
10. Known Limitations
11. Readiness Assessment for the Interview Engine
Target quality: Enterprise-grade, production-ready implementation consistent with all previous PAM-P phases.
```

---

## Entry 16 — 2026-07-19 16:11 UTC — CI failure report: accessibility job seed step

**Response:** Root cause: the new CI workflow's `env:` block never set the three SEED_ADMIN_* variables `prisma/seed.ts` correctly requires. Fixed with isolated, `.test`-domain, CI-only bootstrap credentials — production seed security unchanged. Commit `cd55249`.

```text
The GitHub Actions accessibility job is failing during:

npx prisma db seed

The error is:

SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, and SEED_ADMIN_PASSWORD must be set to seed the bootstrap System Administrator.

Diagnose and fix this CI failure without weakening production security.

Requirements:

1. Inspect the GitHub Actions workflow responsible for the accessibility job.

2. Confirm that the failure occurs before the accessibility tests because the Prisma seed script requires:
   - SEED_ADMIN_NAME
   - SEED_ADMIN_EMAIL
   - SEED_ADMIN_PASSWORD

3. Configure isolated CI-only bootstrap administrator values for the accessibility test environment.

4. Do not use real production, staging, developer, or personal credentials.

5. The CI credentials must:
   - Use a clearly non-production `.test` email address.
   - Use a test-only password.
   - Be available only to the CI job.
   - Never be written into production configuration.
   - Never change the production seed security requirements.

6. Preserve the current behaviour of prisma/seed.ts:
   - It must continue to fail clearly when required bootstrap credentials are absent in a real environment.
   - Do not introduce an insecure default administrator password.
   - Do not silently skip administrator creation in production.

7. Prefer defining the test-only environment variables at the GitHub Actions job level so that they are available to migration, seeding, application startup, Playwright and accessibility test steps where necessary.

8. Confirm that the CI database is isolated from staging and production.

9. Review the seed script for idempotency:
   - Re-running the seed must not create duplicate administrator accounts.
   - It should safely upsert or detect the existing CI administrator.
   - It must not overwrite an existing administrator password unless that behaviour is explicitly intended and documented.

10. Run and report:
    - npx prisma validate
    - npx prisma migrate status
    - npx prisma db seed
    - npx tsc --noEmit
    - npx eslint .
    - npm run build
    - the accessibility test command
    - the relevant Playwright tests

11. Do not begin or modify unrelated platform features.

12. Commit the fix separately with a message similar to:

fix(ci): provide isolated bootstrap credentials for accessibility tests

Provide a completion report containing:
- Root cause
- Files changed
- Exact security approach used
- Test results
- Accessibility results
- Any remaining warnings
- Confirmation that no production credentials or insecure defaults were introduced
```

---

## Entry 17 — 2026-07-19 21:47 UTC — Release 1 Overnight Autonomous Development Prompt (superseded)

**Response:** The original 10-module plan for Release 1 (Interview Assignment Engine through Production Hardening). Modules 1 (Interview Assignment Engine, commit `4fbb78d`) and 2 (Interview Workspace, commit `c84f87c`) were built against this brief. Entry 19 below then explicitly superseded this brief's Modules 3-10 with a much more detailed specification — see `handoff/DECISIONS_LOG.md` for how the two were reconciled (they turned out not to conflict on the numbers that mattered).

```text
PAM-P Fellowship Management System
Overnight Autonomous Development Prompt
Complete Release 1 – Core Selection Engine
You are continuing development of the PAM-P Fellowship Management System.
You have successfully completed:

* Phase 0 – Authentication & RBAC
* Phase 1 – Database Foundation
* Phase 2 – Review Framework
* Phase 3A – Review Framework & Scoring
* Phase 3B – Assignment Engine
* Phase 3B.1 – Role & Navigation Reconciliation
* Phase 3C – Reviewer Workspace
* Phase 3D – Programme Secretariat Review Operations
* Enterprise Configuration Centre
* CI/CD stabilisation
* Accessibility pipeline
The platform architecture is now considered stable.
Do not redesign existing architecture.
Maintain all existing architectural decisions, documentation standards, testing discipline, ADR process, RBAC model, service layer, repository pattern and coding conventions.
Mission
Continue autonomous implementation until Release 1 is functionally complete.
Implement the remaining modules sequentially.
Do not stop after each module unless a genuine programme governance decision is required.
Proceed continuously through the night.
Module 1
Interview Assignment Engine
Build an enterprise Interview Assignment Engine.
Requirements:

* Assign Top 70 applicants to interview panels.
* Four panellists per applicant.
* Equal workload distribution.
* Conflict-of-interest checking.
* Capacity management.
* Reassignment.
* Audit logging.
* Complete history preservation.
* No schema shortcuts.
Reuse the existing Assignment Engine architecture wherever appropriate.
Module 2
Interview Workspace
Build the Interview Workspace.
Features:

* Interview queue
* Scheduled interviews
* Teams/meeting placeholder
* Applicant summary
* Interview question framework
* Individual scoring
* Panel comments
* Draft save
* Submission
* Autosave
* Accessibility
* Mobile responsiveness
Each panellist submits independently.
Scores remain hidden until all four have submitted.
Module 3
Interview Scoring Engine
Implement:

* Configurable interview framework
* Question weighting
* Mandatory questions
* Score validation
* Automatic averaging
* Tie-breaking support
* Final interview score generation
No hard-coded scoring rules.
Consume Configuration Centre values.
Module 4
Interview Operations Workspace
For Programme Secretariat:

* Interview schedule
* Attendance tracking
* Missing submissions
* Reassignment
* Rescheduling
* Interview completion dashboard
* Workload analytics
* CSV export
* Audit history
Module 5
Final Ranking Engine
Implement:

* Combine review score and interview score
* Weighting from Configuration Centre
* Automatic ranking
* Reserve list generation
* Top 30 selection
* Tie-breaking rules
* Ranking lock
* Audit
No manual calculations.
Module 6
Selection Committee Workspace
Build workspace for:

* Dr Izuchukwu Anyanwu
* Dr Danjuma
* Prof Temitayo
Capabilities:

* Review ranked applicants
* View complete applicant profile
* Compare scores
* Record committee comments
* Approve ranking
* Recommend adjustments
* Lock recommendations
No score editing.
Module 7
Executive Approval Workspace
Roles:

* Founder
* Chancellor
* Managing Director
Capabilities:

* Read-only review
* Final approval
* Conditional approval
* Return for reconsideration
* Reject
* Digital approval record
* Audit trail
No modification of scores.
Module 8
Offer & Admission Engine
Implement:

* Offer generation
* Reserve list activation
* Acceptance tracking
* Decline workflow
* Automatic reserve promotion
* Status transitions
* Audit
Module 9
Programme Dashboard
Executive dashboards including:

* Applications received
* Eligibility rate
* Review completion
* Interview completion
* Ranking progress
* Offer status
* Cohort composition
* Gender balance
* Geographic distribution
* Reviewer workload
* Secretariat workload
* Operational alerts
Module 10
Production Hardening
Review entire Release 1.
Check:

* RBAC
* Security
* Architecture
* API consistency
* Database consistency
* Documentation
* Accessibility
* Mobile responsiveness
* Performance
Resolve any issues discovered.
Required Discipline
Every module must complete:

* Architecture review
* ADR update
* Documentation
* Unit tests
* Integration tests
* Playwright tests
* Accessibility review
* Build verification
* Migration verification
* Security review
before the next module begins.
Do not accumulate unfinished work.
If a Governance Decision Is Required
Only stop if:

* Programme rules are genuinely undefined.
* A business rule would have to be invented.
* Multiple interpretations are equally valid.
Otherwise make no unnecessary pauses.
Completion Report
At the end of the session produce:

1. Executive Summary
2. Modules Completed
3. Commits
4. Database Changes
5. Architecture Changes
6. Documentation Added
7. ADRs Added
8. Test Results
9. Accessibility Results
10. Security Review
11. Known Limitations
12. Remaining Work Before Version 1.0
13. Overall Production Readiness Assessment
```

---

## Entry 18 — 2026-07-19 21:47 UTC — Governance-stop criteria clarification

**Response:** "Continue until Release 1 is complete, or a genuine governance decision requires input, or a logical checkpoint depends on unresolved business rules." Honored once so far: applicant interview-booking access (no Fellow Portal exists) — see `handoff/DECISIONS_LOG.md` §3.

```text
continue until either:

* Release 1 is complete, or
* it reaches a genuine governance decision that requires your input, or
* it reaches a logical architectural checkpoint where another implementation would depend on unresolved business rules.
```

---

## Entry 19 — 2026-07-19 22:51 UTC — Enterprise Functional Specification Addendum (current, authoritative)

**Response:** Full verbatim text preserved separately at `handoff/ENTERPRISE_FUNCTIONAL_SPECIFICATION_ADDENDUM.md` (not repeated here to avoid duplication). Supersedes the old Entry 17 brief's Modules 3-10. Module 1 (Interview Scheduling) is built and committed (`36fef5a`, see `docs/INTERVIEW_SCHEDULING.md`, `docs/adr/ADR-0017-interview-booking-token-access.md`). Modules 2-9 remain — see `handoff/REMAINING_WORK.md`. Note: the user re-pasted this identical text again at 2026-07-20 08:14 UTC as a mid-session reminder/confirmation — same content, not a new instruction.

```text
PAM-P Fellowship Management System
Release 1.0 – Interview Engine, Final Ranking & Admissions
Enterprise Functional Specification (Implementation Addendum)
Context
You are continuing development of the PAM-P Fellowship Management System.
The existing architecture, coding standards, ADRs, Prisma schema, RBAC model, audit framework, testing strategy and Reviewer Workspace patterns must remain unchanged.
This document supersedes any previous assumptions regarding Interview Scheduling, Interview Scoring, Final Ranking and Admissions.
Implement the following business rules exactly.
Do not invent workflows or simplify governance.
MODULE 1 — INTERVIEW SCHEDULING
1.1 Interview Configuration
Programme Secretariat shall configure:

* Interview period
* Interview dates
* Daily schedule
* Interview duration
* Buffer duration
* Maximum interviews per day
1.2 Panel Availability
Interview Panelists shall submit:

* Available dates
* Available time windows
* Temporary unavailability
* Leave periods
Every modification shall be audited.
1.3 Interview Slot Generation
The scheduling engine shall generate interview slots only where all assigned panelists are simultaneously available.
Configuration:

* Interview Duration = 30 minutes
* Mandatory Buffer = 5 minutes
* Scheduling Block = 35 minutes
The scheduling engine shall prevent overlapping interviews.
1.4 Daily Capacity
Maximum confirmed interviews:
4 applicants per day
The scheduling engine shall:

* Prevent overbooking
* Mark full interview days
* Display remaining capacity
* Prevent accidental Secretariat overrides
1.5 Applicant Booking
Programme Secretariat publishes available interview slots.
Applicants may:

* View available slots
* Select one preferred slot
* Submit booking request
Applicants may never hold multiple interview bookings.
1.6 Secretariat Confirmation
Applicant booking does not confirm the interview.
Programme Secretariat must:

* Confirm
* Decline
* Request another slot
Only confirmed interviews become official.
1.7 Microsoft Teams Link
Immediately after confirmation:
The system shall prompt:
Paste Microsoft Teams Meeting Link
Requirements:

* Mandatory before invitations can be sent.
* Secretariat pastes externally generated Teams link.
* Validate URL.
* Store securely.
Version 1 shall not implement Microsoft Graph integration.
1.8 Interview Invitations
After Teams link entry:
System sends invitations to:

* Applicant
* Four Interview Panelists
* Programme Secretariat
Invitation includes:

* Applicant Name
* Application ID
* Leadership Pathway
* Interview Date
* Interview Time
* Microsoft Teams Link
* Joining Instructions
1.9 Automatic Reminders
Applicants:

* 24 hours before interview
* 1 hour before interview
Panelists:

* 24 hours before interview
* 1 hour before interview
Reminder intervals shall be configurable.
MODULE 2 — INTERVIEW SCORING
2.1 Interview Panel
Each interview consists of:
4 Panelists
2.2 Independent Scoring
All four panelists interview the applicant together.
Each panelist:

* Completes an independent electronic score sheet
* Cannot view another panelist's scores
* Cannot view another panelist's comments
* May save draft scores
* May submit independently
After submission:

* Score becomes locked
* Panelist may only view their own submission
2.3 Interview Comments
Each panelist records:

* Overall assessment
* Strengths
* Concerns
* Recommendation
Comments become read-only after submission.
2.4 Visibility Rules
Interview Panelists
Can view:

* Their own score
* Their own comments
Cannot view:

* Other panelists' scores
* Other panelists' comments
After all required submissions:
Can additionally view:

* Final averaged interview score only
Programme Secretariat
Can view:

* All interview scores
* All comments
* Final average
Final Selection Committee
Can view:

* All interview scores
* All interview comments
* Final average
Executive Approval Panel
Can view:

* All interview scores
* All interview comments
* Final average
Applicants
Cannot view interview scores or comments.
2.5 Minimum Submission Rule
Normal operation:
4 panelists submit
Minimum valid threshold:
3 submissions
If:

* 3 or 4 panelists submit
Interview proceeds.
If:

* fewer than 3 submit
Interview remains incomplete.
2.6 Secretariat Override
Where one panelist fails to submit:
Programme Secretariat may invoke:
Close Interview with Three Valid Scores
System shall require:

* Mandatory reason
* Automatic recording of missing panelist
* Audit entry
Final Interview Score:
Average of the valid submitted scores only.
No averaging is permitted using fewer than three submissions.
2.7 Interview Score Calculation
System calculates:

```

```


```
Average Interview Score

=

Sum of valid interview totals

÷

Number of valid submissions
```

No manual editing of averages.
MODULE 3 — INTERVIEW QUESTIONS
The interview shall use a hybrid questioning model.
Mandatory Questions
Every applicant answers the same mandatory questions.
Mandatory questions cannot be skipped.
Pathway Questions
System automatically displays pathway-specific questions.
Supported pathways:

*  Entrepreneurship & Enterprise 
*  Public & Private Sector Leadership 
*  Academia & Advanced Studies 
Additional Questions
Panelists may choose additional questions only from the approved question bank.
Panelists may not create ad hoc questions.
System records:

*  Every question asked 
*  Panelist selecting additional question 
*  Interview start time 
*  Interview end time 
MODULE 4 — FINAL RANKING
System calculates:

```

```


```
Application Review (/60)

+

Interview (/40)

=

Final Score (/100)
```

The platform shall:

*  Calculate automatically 
*  Prevent manual editing 
*  Rank highest to lowest 
*  Audit every recalculation 
MODULE 5 — TIE BREAKING
Tie Level 1
Higher Interview Score wins.
Tie Level 2
If still tied:
Higher Application Review Score wins.
Tie Level 3
If still tied:
Final Selection Committee reviews:

*  Interview comments 
*  Review comments 
*  Leadership pathway suitability 
*  Cohort balance 
Committee records mandatory justification.
MODULE 6 — FINAL SELECTION COMMITTEE
Committee SHALL NOT:

*  Modify review scores 
*  Modify interview scores 
*  Recalculate applicant scores 
Scores are final.
Committee SHALL:

*  Confirm Top 30 Fellows 
*  Confirm Reserve List 
*  Resolve unresolved ties 
*  Ensure pathway balance 
*  Ensure cohort diversity 
*  Record cohort balancing reasons 
Where Committee departs from the strict ranking:
System requires:

*  Mandatory justification 
*  Committee member 
*  Timestamp 
*  Full audit trail 
Platform preserves:

*  Original System Ranking 
*  Final Approved Cohort 
MODULE 7 — RESERVE LIST
Committee approves:
Ranked Reserve List.
Reserve list size shall be configurable.
Where a selected Fellow:

*  Declines 
*  Withdraws 
*  Fails to accept 
*  Becomes ineligible 
System recommends the next highest-ranked reserve.
System prevents reserves from being skipped without recorded justification.
MODULE 8 — OFFER MANAGEMENT
Offer validity:
7 calendar days
Countdown begins immediately after offer issuance.
Automatic reminders:

*  Day 3 
*  Day 6 
*  Day 7 (Expiry) 
If applicant fails to respond:
Offer expires automatically.
Programme Secretariat notified.
Next reserve becomes eligible.
MODULE 9 — AUDIT
Audit every event including:
Scheduling

*  Availability submitted 
*  Availability updated 
*  Slot generated 
*  Slot booked 
*  Slot confirmed 
*  Teams link added 
*  Invitation sent 
*  Reminder sent 
Interview

*  Draft created 
*  Draft saved 
*  Submission 
*  Missing panelist 
*  Secretariat override 
*  Average calculated 
Ranking

*  Final ranking generated 
*  Tie resolved 
*  Committee decision 
*  Cohort balancing 
Admissions

*  Offer issued 
*  Reminder sent 
*  Offer accepted 
*  Offer declined 
*  Offer expired 
*  Reserve promoted 
IMPLEMENTATION REQUIREMENTS
Reuse existing Reviewer Workspace architecture wherever appropriate, including:

*  Server Component pattern 
*  Thin Server Actions 
*  Service-layer authorization 
*  Repository scoping 
*  Decimal serialization strategy (ADR-0010) 
*  Draft autosave behaviour 
*  Typed AppErrors 
*  Audit framework 
*  Accessibility standards 
*  Existing testing conventions 
Do not duplicate Review Workspace code unnecessarily. Extract shared components and utilities where appropriate while respecting the current architecture.
ACCEPTANCE CRITERIA
This implementation is complete only when:

*  Interview scheduling functions end-to-end. 
*  Applicants self-book interview slots. 
*  Secretariat confirms bookings. 
*  Teams links are required before invitations. 
*  Automatic reminders function correctly. 
*  Independent interview scoring is enforced. 
*  A minimum of three valid submissions is required. 
*  Secretariat override functions correctly with mandatory justification. 
*  Interview averages are calculated automatically. 
*  Final scores (/100) are calculated automatically. 
*  Tie-breaking rules are fully implemented. 
*  Final Selection Committee permissions and restrictions are enforced. 
*  Reserve list workflow is operational. 
*  Seven-day offer management is operational. 
*  Every workflow is fully audited. 
*  Existing architecture, RBAC, coding standards, ADRs, documentation and tests remain intact. 
Final Instruction
Implement these requirements incrementally, preserving architectural quality and production readiness. Do not introduce assumptions where the specification is explicit. If an implementation conflict arises between this specification and an earlier design assumption, this specification takes precedence. After implementation, update the architecture documentation, ADRs (where applicable), and regression tests to reflect the completed functionality.
```

---

