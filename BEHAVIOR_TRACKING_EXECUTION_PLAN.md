# Behavior Tracking Execution Plan

This document is an additive implementation plan for a real-time ABA behavior tracking and session summary system in this workspace. It is grounded in the current Expo app, Firebase auth layer, Context-based client state, and the local/API server patterns already used by attendance, mood tracking, uploads, and directory sync.

## 1. High-Level Architecture Overview

### Current Architectural Baseline

The app today is a React Native / Expo application with:

- Navigation defined in `App.js` using React Navigation native stacks.
- Authentication and special-access logic in `src/AuthContext.js`.
- Shared app data state in `src/DataContext.js`.
- API access split between:
  - Firebase client reads/writes in `src/Api.js`
  - REST endpoints in `scripts/api-server.js`, `scripts/api-server-pg.js`, and `scripts/api-mock.js`
- Parent-facing child detail/report rendering in `src/screens/MyChildScreen.js`.
- Therapist-facing child detail rendering in `src/screens/ChildDetailScreen.js`.
- Existing additive care-data patterns for attendance and mood tracking.

### Recommended End-State

Implement a dedicated session tracking domain with two primary records:

- `eventLog`: append-only raw session events created by tap tracking.
- `summary`: therapist-approved final session summary generated from raw events and editable before submission.

The full flow should be:

1. Therapist starts a session.
2. App creates a draft session record and begins collecting raw `eventLog` entries.
3. Therapist uses a tap grid to log behaviors, programs, meals, toileting, mood, and notable events in real time.
4. Therapist ends the session.
5. Server or shared summarization service converts `eventLog` + session metadata into a structured summary shaped like `SessionSummary.txt`.
6. Therapist reviews and edits the generated summary.
7. Therapist submits the approved summary.
8. Backend stores:
   - normalized structured summary data
   - a generated `SessionSummary.txt` artifact
   - a denormalized parent-report projection for fast rendering
9. Parent-facing progress report surfaces read the approved summary and display it in `MyChildScreen`.

### Recommended Folder Layout

Add a feature slice instead of scattering logic across existing general-purpose files.

```text
src/
  features/
    sessionTracking/
      components/
        StartSessionCard.js
        BehaviorTapGrid.js
        SessionEventChip.js
        SessionTimerBar.js
        SessionSummaryEditor.js
        SummarySectionCard.js
      hooks/
        useActiveSession.js
        useSessionEventLog.js
        useSessionSummaryDraft.js
        useParentProgressReport.js
      services/
        sessionTrackingApi.js
        sessionSummaryGenerator.js
        sessionSummaryMappers.js
        sessionSummaryText.js
        sessionStorageQueue.js
      types/
        sessionTracking.types.ts
      utils/
        behaviorCatalog.js
        eventAggregation.js
        summaryValidation.js
      constants/
        sessionSummarySchema.js
```

Recommended screen additions:

```text
src/screens/
  TherapistSessionStartScreen.js
  TherapistSessionTrackingScreen.js
  TherapistSessionSummaryReviewScreen.js
```

### Data Flow: Tap -> eventLog -> SessionSummary.txt -> Parent View

```text
Therapist tap
  -> local event buffer (optimistic)
  -> eventLog persistence API
  -> summary generator
  -> summary draft
  -> therapist review/edit
  -> approved summary save
  -> SessionSummary.txt generation/storage
  -> parent report projection
  -> MyChildScreen progress report render
```

### Storage Strategy

Use structured storage as the system of record. Treat `SessionSummary.txt` as a generated artifact, not the only source of truth.

- System of record: database tables / collections for session, eventLog, summary.
- Generated artifact: `SessionSummary.txt` content created from the stored summary.
- Parent rendering source: approved summary record or a light projection table/document derived from it.

This avoids parsing text files to reconstruct app state later.

## 2. Gap Analysis

### What Currently Exists

#### App Structure and Navigation

- `App.js` already has separate role-based stacks for home/community, controls/admin, my-child, chats, and settings.
- `RoleDashboardScreen.js` already routes parents to `MyChild` and therapists to `ChildDetail` / schedule views.
- `MyChildScreen.js` already acts as the parent-facing progress report surface.
- `ChildDetailScreen.js` already acts as a therapist/admin-facing child profile surface.

#### State Management

- State is Context-based, not Redux/Zustand.
- `src/AuthContext.js` owns auth, role overrides, MFA state, and reviewer/dev handling.
- `src/DataContext.js` owns shared domain state such as posts, messages, memos, directory data, attendance/mood refresh, and fetch orchestration.

#### Existing Care/Tracking Patterns Worth Reusing

- `AttendanceScreen.js` + `Api.getAttendanceForDate`, `saveAttendance`, `getAttendanceHistory` already demonstrate:
  - child-scoped data capture
  - REST-backed persistence
  - local optimistic UI
  - role-aware write permissions
- `MoodTrackerCard.js` + `Api.getMoodHistory`, `saveMoodEntry` already demonstrate:
  - therapist/staff entry flows
  - child-specific historical reads
  - compact additive UI pattern
- `ScopedDocumentsScreen.js` + `uploadMedia` already demonstrate:
  - file upload patterns
  - auth-backed API calls

#### Parent Progress Data Surface

- `MyChildScreen.js` already renders a review/report-like experience using child fields such as:
  - `notes`
  - `monthlyGoal`
  - `successCriteria`
  - `programCurriculum`
  - `behaviorNotes`
- `RoleDashboardScreen.js` already exposes a `progress-report` card that navigates into the parent/child report path.

#### Backend and Database Patterns

- The backend supports both SQLite (`scripts/api-server.js`) and Postgres (`scripts/api-server-pg.js`).
- Both servers already implement additive care-data tables/endpoints for attendance and mood.
- The mock server (`scripts/api-mock.js`) mirrors the same pattern for local development.

#### Demo/Seed Summary Data

- `src/seed/demoModeSeed.js` contains `progressReportsRaw` and maps those records into seeded child text fields and posts.
- This is the closest current analogue to a session summary, but it is seed/demo data only.

### What Is Missing

The repository does not currently contain:

- a formal session domain model
- a start/end session lifecycle
- an append-only behavior/event log model
- a therapist tap-tracking screen
- a summary generation service
- a therapist summary review/edit screen
- storage for final approved session summaries
- a `SessionSummary.txt` generation pipeline
- parent-facing rendering sourced from real approved summary records
- offline queueing for in-progress session events

### What Needs Refactoring

Refactor only by extraction, not by disruptive rewrite.

1. `DataContext.js`
   - It already owns many unrelated concerns.
   - Do not expand it much further.
   - Add a feature-specific provider or hook layer and expose only minimal integration methods through `DataContext` if needed.

2. `MyChildScreen.js`
   - It currently renders report sections from loosely shaped child properties.
   - It should be updated to prefer approved session summary data first, with current child-field fallbacks preserved.

3. `ChildDetailScreen.js`
   - It should gain an entry point into session tracking for therapist/staff users, but existing detail behavior should stay intact.

4. `demoModeSeed.js`
   - Keep demo data, but stop treating it as the conceptual model for production summaries.
   - Move future summary mapping logic into a real feature service.

### What Must Be Created From Scratch

- Session tables/collections and APIs
- Event log APIs
- Summary generation logic
- Summary editor/review screen
- Parent progress report integration helpers
- `SessionSummary.txt` builder and storage conventions
- offline draft/event queue support

## 3. Execution Plan

### Recommended Delivery Order

#### Phase 1: Define the Domain and Storage

1. Create the session tracking feature folder under `src/features/sessionTracking`.
2. Add canonical schema definitions based on the `SessionSummary.txt` JSON shape provided in the workspace.
3. Add TypeScript interface definitions for:
   - session
   - eventLog entry
   - summary draft
   - approved summary
   - parent report projection
4. Add new backend tables in both SQLite and Postgres servers:
   - `therapy_sessions`
   - `therapy_session_events`
   - `therapy_session_summaries`
   - optional `therapy_session_artifacts`
5. Mirror the same shapes in `scripts/api-mock.js`.

#### Phase 2: Build the API Layer

Add new API methods in `src/Api.js` or a feature wrapper service:

- `startTherapySession(payload)`
- `getActiveTherapySession(childId)`
- `appendTherapySessionEvent(sessionId, event)`
- `appendTherapySessionEventsBulk(sessionId, events)`
- `endTherapySession(sessionId)`
- `generateTherapySessionSummary(sessionId)`
- `getTherapySessionSummaryDraft(sessionId)`
- `updateTherapySessionSummaryDraft(sessionId, payload)`
- `approveTherapySessionSummary(sessionId, payload)`
- `getChildSessionSummaries(childId, options)`
- `getLatestChildSessionSummary(childId)`
- `getSessionSummaryArtifact(sessionId)`

Backend route groups:

```text
POST   /api/therapy-sessions
GET    /api/therapy-sessions/active?childId=...
POST   /api/therapy-sessions/:id/events
POST   /api/therapy-sessions/:id/events/bulk
POST   /api/therapy-sessions/:id/end
POST   /api/therapy-sessions/:id/generate-summary
GET    /api/therapy-sessions/:id/summary
PUT    /api/therapy-sessions/:id/summary
POST   /api/therapy-sessions/:id/summary/approve
GET    /api/children/:childId/session-summaries
GET    /api/children/:childId/session-summaries/latest
GET    /api/therapy-sessions/:id/artifacts/session-summary.txt
```

#### Phase 3: Build the Therapist Session Flow

1. Add `TherapistSessionStartScreen.js`
   - therapist selects child
   - selects session type / AM / PM / ad hoc
   - starts session

2. Add `TherapistSessionTrackingScreen.js`
   - timer/header bar
   - child/session context
   - tap grid for behaviors and programs
   - quick controls for meals, toileting, mood, notes
   - recent event list
   - end-session CTA

3. Add `TherapistSessionSummaryReviewScreen.js`
   - loads auto-generated summary draft
   - editable structured form sections matching `SessionSummary.txt`
   - preview of final text artifact
   - submit/approve button

4. Add entry points from existing screens:
   - therapist child detail
   - therapist dashboard
   - therapist schedule/caseload views

#### Phase 4: Build the Real-Time Tracking Grid

Components to build:

- `BehaviorTapGrid`
- `ProgramTapGrid`
- `SessionTimerBar`
- `LiveEventFeed`
- `QuickPickChips`
- `EndSessionButton`

Tracking UX requirements:

- one-tap logging for common events
- optional second tap for intensity/frequency modifiers when needed
- haptic/visual confirmation
- undo last event
- collapse low-value controls behind accordions

#### Phase 5: Build Summary Generation

Add `sessionSummaryGenerator.js` and `eventAggregation.js`.

Responsibilities:

- aggregate event counts by type/intensity/frequency
- derive likely summary suggestions from raw eventLog data
- map mood/meal/toileting/program data into the summary shape
- prefill daily recap fields
- create a text version for `SessionSummary.txt`

Recommendation:

- keep generation deterministic and rule-based first
- avoid introducing LLM dependence for v1
- optionally layer AI summarization later behind a feature flag

#### Phase 6: Parent Progress Report Integration

1. Add a parent report selector/hook such as `useParentProgressReport(childId)`.
2. Update `MyChildScreen.js` to read the latest approved session summary.
3. Map approved summary fields into existing report sections:
   - session recap
   - monthly goal
   - success criteria met
   - programs worked on
   - interfering behaviors
4. Preserve existing child-field fallbacks for backward compatibility.
5. Optionally add a history list of prior submitted summaries.

#### Phase 7: Offline and Reliability Layer

1. Add AsyncStorage-backed local draft state for the active session.
2. Add queued event flush for intermittent connectivity.
3. Support bulk append to reduce network chatter.
4. Guard against duplicate session creation and double-submit.
5. Add idempotency keys to event writes and summary approval.

#### Phase 8: Validation and Rollout

1. Add API smoke coverage for session/event/summary routes.
2. Add fixture-based summary generation tests.
3. Add therapist flow QA checklist.
4. Add parent report regression validation.
5. Keep feature behind a tenant/program flag until stable.

## 4. Data Model Definitions

### eventLog Entry Format

Recommended event entry shape:

```ts
export interface SessionEventLogEntry {
  id: string;
  sessionId: string;
  childId: string;
  therapistId: string;
  organizationId?: string | null;
  programId?: string | null;
  campusId?: string | null;
  eventType:
    | 'behavior'
    | 'program'
    | 'mood'
    | 'meal'
    | 'toileting'
    | 'note'
    | 'milestone'
    | 'session_marker';
  eventCode: string;
  label: string;
  value?: string | number | boolean | null;
  intensity?: 'none' | 'precursor' | 'low' | 'moderate' | 'high' | 'detracting' | 'hazardous' | null;
  frequencyDelta?: number | null;
  metadata?: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
  source: 'tap-grid' | 'editor' | 'system';
  clientEventId?: string;
}
```

### Session Record Format

```ts
export interface TherapySession {
  id: string;
  childId: string;
  therapistId: string;
  sessionDate: string;
  sessionType: 'AM' | 'PM' | 'custom';
  startedAt: string;
  endedAt?: string | null;
  status: 'active' | 'ended' | 'summary_draft' | 'submitted';
  organizationId?: string | null;
  programId?: string | null;
  campusId?: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### Summary Schema

Use the provided workspace schema as the approved contract, but normalize it into a single object instead of the current example array wrapper.

Recommended stored summary shape:

```ts
export interface TherapySessionSummary {
  session: {
    sessionId: string;
    date: string;
    student: {
      id: string;
      name: string;
    };
  };
  moodScore: {
    selectedValue?: 1 | 2 | 3 | 4 | 5 | null;
    selectedLabel?: string | null;
    scale: Array<{
      value: 1 | 2 | 3 | 4 | 5;
      label: string;
      rangeDescription: string;
    }>;
  };
  dailyRecap: {
    progressLevel: 'Significant progress' | 'Moderate progress' | 'Minimal progress' | 'No progress' | 'Regression observed' | null;
    interferingBehaviorLevel: 'None' | 'Minimal' | 'Moderate' | 'High' | null;
    independenceLevel: 'Significant increase' | 'Moderate increase' | 'Slight increase' | 'No change' | 'Decrease' | null;
    therapistNarrative?: string;
  };
  monthlyGoal: {
    category: 'Communication' | 'Social Skills' | 'Play Skills' | 'Daily Living Skills' | 'Emotional Regulation' | 'Tolerance Skills' | 'Transitions' | 'Motor Skills' | 'Academic Readiness' | 'Safety Skills' | null;
    description: string;
    targetCriteria: string;
  };
  successCriteriaMet: string[];
  programsWorkedOn: string[];
  interferingBehaviors: Array<{
    behavior: string;
    frequency: number;
    intensity: 'None' | 'Precursor' | 'Low' | 'Moderate' | 'High' | 'Detracting' | 'Hazardous';
  }>;
  meals: Array<{
    type: 'Breakfast' | 'Snack' | 'Lunch' | 'Dinner';
    note: 'Ate all' | 'Ate most' | 'Ate some' | 'Refused' | 'Tried new food';
  }>;
  toileting: Array<{
    status: 'Independent' | 'Prompted' | 'Assisted' | 'Accident – Urine' | 'Accident – Bowel' | 'Successful void' | 'No attempt';
  }>;
  generatedFromEventLog: boolean;
  therapistEdited: boolean;
  approvedByTherapistId?: string | null;
  approvedAt?: string | null;
}
```

### Recommended Summary Storage Schema

Database-level summary row:

```ts
export interface TherapySessionSummaryRecord {
  id: string;
  sessionId: string;
  childId: string;
  therapistId: string;
  summaryJson: TherapySessionSummary;
  summaryText: string;
  version: number;
  status: 'draft' | 'approved';
  generatedAt: string;
  updatedAt: string;
  approvedAt?: string | null;
}
```

### Structure of SessionSummary.txt

Recommend storing `SessionSummary.txt` as pretty-printed JSON that matches the approved summary object.

Example:

```json
{
  "session": {
    "sessionId": "sess_123",
    "date": "2026-04-29",
    "student": {
      "id": "child_123",
      "name": "Student Name"
    }
  },
  "moodScore": {
    "selectedValue": 4,
    "selectedLabel": "Happy",
    "scale": [ ... ]
  },
  "dailyRecap": {
    "progressLevel": "Moderate progress",
    "interferingBehaviorLevel": "Minimal",
    "independenceLevel": "Slight increase",
    "therapistNarrative": "..."
  },
  "monthlyGoal": {
    "category": "Communication",
    "description": "...",
    "targetCriteria": "..."
  },
  "successCriteriaMet": [ ... ],
  "programsWorkedOn": [ ... ],
  "interferingBehaviors": [ ... ],
  "meals": [ ... ],
  "toileting": [ ... ],
  "generatedFromEventLog": true,
  "therapistEdited": true,
  "approvedAt": "2026-04-29T15:10:00.000Z"
}
```

Recommendation:

- keep `.txt` because it is a hard requirement
- use JSON content inside the text file because the supplied schema is already JSON-shaped

## 5. Integration Requirements

### How SessionSummary.txt Is Generated

Recommended process:

1. Therapist presses End Session.
2. Backend fetches all `therapy_session_events` for the session.
3. Generator aggregates events into the normalized summary object.
4. Summary object is stored as a draft.
5. Summary text builder serializes the object into pretty JSON.
6. Therapist edits the structured draft.
7. On approve, regenerate `summaryText` from the final edited object.

Do not generate the final artifact only on the client. A server-side generation step gives one authoritative result for web, mobile, and exports.

### How It Is Stored

Store three layers:

1. `therapy_session_events`
   - immutable raw event log
2. `therapy_session_summaries`
   - structured draft/approved summary JSON + text
3. optional artifact storage
   - file path or blob reference for `SessionSummary.txt`

Recommended artifact strategies:

- simplest: store `summaryText` in DB and expose it as downloadable text
- richer: also upload a generated text file using existing media/upload patterns if export/download is needed

### How It Populates the Parent-Facing Progress Report Path

The current parent progress path is `RoleDashboardScreen -> MyChildScreen`.

Recommended integration:

1. Add `getLatestChildSessionSummary(childId)`.
2. In `MyChildScreen.js`, fetch the latest approved summary for the selected child.
3. Map that summary into the existing review cards:
   - Session Summary -> `dailyRecap.therapistNarrative`
   - Monthly Focus -> `monthlyGoal`
   - Milestones Met -> `successCriteriaMet`
   - Programs Covered -> `programsWorkedOn`
   - Behavior Tracking -> `interferingBehaviors`
4. Preserve the old child-property fallback for records that predate the new feature.

### How Edits Overwrite or Update Stored Summary

Use versioned upserts.

- Draft edits update the draft summary row.
- Approval marks the latest version as `approved`.
- The parent surface reads only the latest approved version.
- Optional: retain prior versions for audit history.

Recommended approval semantics:

- `PUT /summary` updates draft
- `POST /summary/approve` performs final validation, stamps `approvedAt`, regenerates `summaryText`, and locks the record unless an explicit reopen action is supported later

## 6. Optimization Recommendations

### Performance

1. Batch event writes.
   - Do not POST every tap individually when connectivity is poor.
   - Buffer locally and flush in small batches.

2. Keep the tap grid data-driven.
   - Build behavior/program button definitions from configuration arrays instead of hardcoding UI branches.

3. Keep summary generation incremental.
   - During tracking, maintain lightweight aggregates in memory so end-session generation is fast.

4. Add parent report projection fields.
   - Parent screens should not recompute summary text from event logs.

### Code Cleanup

1. Avoid pushing this domain deeper into `DataContext.js`.
2. Add a dedicated `sessionTrackingApi.js` wrapper so `src/Api.js` does not become harder to maintain.
3. Keep mappers separate:
   - API <-> DB
   - DB <-> UI
   - summary JSON <-> parent view cards

### Reusable Abstractions

1. Reuse the attendance/mood pattern for child-scoped writes.
2. Reuse the upload pattern if exported text artifacts need file storage.
3. Reuse AsyncStorage scoped keys for in-progress drafts and unsynced events.
4. Reuse tenant feature flags to roll out session tracking by program type.

### Error Handling

1. Distinguish between:
   - event sync failed
   - summary generation failed
   - summary approval failed
2. Never lose the local event buffer on failure.
3. Surface recoverable retry states in the UI.
4. Validate the summary object before submission against the known schema.

### Offline Support

Recommended because the app already uses AsyncStorage and mobile use is session-based.

Minimum offline strategy:

- cache active session metadata locally
- queue unsent eventLog entries locally
- restore active session after app restart
- allow therapist to keep tracking offline
- sync when connectivity returns
- block final approval if local and remote copies diverge until reconciliation succeeds

## 7. Final Checklist

### Audit-Driven Build Checklist

- Add `src/features/sessionTracking` feature slice
- Add canonical summary schema constants based on `SessionSummary.txt`
- Add TypeScript interface file for session/event/summary contracts
- Add SQLite tables for sessions, session events, and summaries
- Add Postgres tables for sessions, session events, and summaries
- Add mock-server in-memory equivalents
- Add REST endpoints for session lifecycle, event append, summary draft, and approval
- Add client API wrappers for session lifecycle and summary reads/writes
- Add `TherapistSessionStartScreen`
- Add `TherapistSessionTrackingScreen`
- Add `TherapistSessionSummaryReviewScreen`
- Add `BehaviorTapGrid` and supporting data-driven catalogs
- Add local draft/offline queue support with AsyncStorage
- Add deterministic summary generator from event logs
- Add `SessionSummary.txt` builder
- Add text artifact download endpoint or artifact storage reference
- Add therapist entry points from `ChildDetailScreen` and therapist dashboard/caseload flows
- Add parent summary retrieval hook
- Update `MyChildScreen` to prefer latest approved summary while keeping current fallbacks
- Add API smoke coverage for the new routes
- Add summary generation fixture tests
- Add feature flag for staged rollout

### Recommended First Implementation Slice

The safest first vertical slice is:

1. backend schema + routes
2. start session screen
3. tap tracker with a small behavior catalog
4. end session + deterministic summary generation
5. therapist review/edit screen
6. parent display in `MyChildScreen`

This gives a full end-to-end path before expanding the catalog breadth.

## Current Codebase Findings Summary

This plan is based on the following observed repository realities:

- The app is JavaScript-first today; TypeScript interfaces should be introduced as contracts for the new feature slice, not as a whole-repo migration.
- The parent progress report path already exists in `MyChildScreen.js`, but it is backed by child text fields rather than dedicated session summary records.
- Therapist/staff tracking patterns already exist for attendance and mood, making them the best additive model for session tracking.
- No dedicated behavior event logging or session summary persistence currently exists.
- The backend already supports SQLite, Postgres, and mock modes, so the new domain should be added consistently across all three.

## Idempotency Note

This plan is intentionally additive and idempotent.

- Re-running the audit should refine file placement, endpoint details, and rollout order.
- It should not require deleting the existing parent progress flow.
- It should not remove current demo or fallback behavior unless a later implementation task explicitly replaces it.
