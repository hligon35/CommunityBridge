# CommunityBridge Implementation Plan

## Source Of Truth

This plan maps the attached CommunityBridge edits document onto the current BuddyBoard workspace and records what is already implemented versus what still needs follow-through.

## Completed In This Slice

- Added a document-aligned admin workspace split in `AdminControlsScreen` for:
  - Office Operations
  - Clinical Operations
- Promoted document-matching entry points already present in the app:
  - User Roles & Permissions
  - Scheduling
  - Export Center
  - Compliance & Alerts
  - Organization Settings
  - Broadcast Center
  - Data & Reports
  - Tap Tracker
  - Summary Review
  - Attendance
  - Programs & Goals
  - Communication Threads
- Updated `ManagePermissionsScreen` to present the permission matrix as grouped admin permissions:
  - Office
  - Clinical
  - Family
- Added office-managed password reset guidance inside user management so the admin permissions workflow matches the document’s reset-account expectations.

## Completed In This Follow-Up Slice

- Added a dedicated `ImportCenterScreen` route with:
  - JSON payload guidance
  - file selection
  - import execution via existing directory merge API
  - import-related audit activity preview
- Expanded `AdminAlertsScreen` into document-aligned tabs for:
  - urgent alerts
  - compliance review
  - audit activity
- Expanded `FacultyDirectoryScreen` into a staff roster with search, role filters, and caseload counts.
- Expanded `ProgramDirectoryScreen` into three BCBA-facing work modes:
  - Library
  - Student Programs
  - Editor
- Expanded `ScheduleCalendarScreen` with day, week, staff, and student scheduling views.
- Split `ReportsScreen` into:
  - Clinical Reports
  - Operational Reports
- Expanded `InsuranceBillingScreen` with authorization, session verification, and role-aware billing access messaging.

## Completed In This Persistence Slice

- Added persistent staff workspace APIs for:
  - credentials
  - availability
  - documents
- Expanded `FacultyDetailScreen` into a tabbed staff profile with persistent:
  - overview
  - credentials
  - caseload
  - availability
  - documents
- Persisted BCBA program editor drafts in `ProgramDirectoryScreen` using local storage keyed to organization and program context.
- Added Firestore-backed export job APIs and connected them to:
  - `ExportDataScreen`
  - `InsuranceBillingScreen`
- Added recent export-job history so export and billing workflows now share a persistent audit trail at the app level.

## Completed In This Finalization Slice

- Export Center now generates deliverable artifacts, uploads them, stores artifact metadata, and exposes recent job download links.
- Billing workflow now surfaces completed and failed export status directly from the shared job history.
- Program editor now saves to both local draft storage and shared Firestore-backed program workspaces for cross-session continuity.
- Compliance status now propagates into the staff roster and alert center from persistent staff workspace records.
- Firestore rules and composite index configuration were added for:
  - `staffWorkspaces`
  - `exportJobs`
  - `programEditorWorkspaces`

## Already Implemented Before This Slice

- Dedicated therapist workflow screens:
  - Tap Tracker
  - Summary Review
  - Reports
- Shared therapy session workspace and reporting engine.
- Tablet navigation shell and iPad support flag.
- Parent reports entry point from `MyChildScreen`.
- Admin alerts, memos, privacy defaults, chat monitor, and export screen routes.

## Remaining Work

### Admin redesign follow-through

- Expand admin hub cards into deeper destination screens for:
  - Staff roster and profile tabs
  - Compliance credential tracker
  - Billing and authorizations
  - Import center with import history and validation receipts
- Add route-level badges or summaries for pending compliance, expiring credentials, and export jobs.

### Therapist and BCBA path changes

- Align therapist-facing launcher language and card order with the document.
- Add BCBA-specific program/goals editing surfaces instead of routing only through general directories.
- Add richer scheduling views for staff, student, and room perspectives.

### Import/export engine

- Replace placeholder export behavior with server-backed export jobs.
- Extend import beyond raw directory merge to:
  - validation summary
  - duplicate detection
  - import receipt/audit trail

### Reset password experience

- Restyle the login-side forgot-password surface to match the office-managed recovery language used in admin tools.
- Add clearer handoff between self-service reset and office-assisted reset.

### Reporting and operational modules

- Separate BCBA clinical reports from office operational reports in the report UI.
- Add billing/authorization and compliance dashboards that reuse existing report aggregation patterns.

## Guardrails

- Preserve dev/demo/reviewer access and the existing dev role switcher behavior.
- Reuse current routes and screens where possible instead of creating duplicate admin flows.
- Keep new behavior compatible with tablet navigation and current Expo native config.
