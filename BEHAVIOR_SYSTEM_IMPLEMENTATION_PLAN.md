# Behavior System Implementation Plan

## Summary Of What Was Added Or Modified

- Added dedicated therapist routes for `Tap Tracker`, `Summary Review`, and `Reports` so therapist workflows are no longer forced through `ChildDetailScreen` alone.
- Added a shared therapy workspace layer for session lifecycle management, preview mode, live event queueing, note capture, draft saving, and summary approval.
- Added a modular reporting engine that derives learner-level and school-wide analytics from therapy summaries, attendance history, mood history, and communication activity.
- Added a tablet/iPad-oriented application shell with a collapsible left drawer, sectioned navigation groups, and a top workspace bar.
- Updated therapist dashboard session cards to route to the dedicated tracker and summary screens and added a new reports card.
- Simplified `ChildDetailScreen` into a learner profile and therapist launcher so there is no second embedded session workflow to keep in sync.
- Added a direct parent/mobile entry point from `MyChildScreen` into the new reporting surface.
- Added unit coverage for the new reporting engine service.

## New Components Created

- `src/features/sessionTracking/components/TherapySessionPanel.js`
- `src/features/reporting/components/ReportMetricCard.js`
- `src/features/reporting/components/MiniBarChart.js`
- `src/features/reporting/components/HeatmapGrid.js`
- `src/components/TabletNavigationShell.js`

## New Hooks And Services Created

- `src/features/sessionTracking/hooks/useTherapySessionWorkspace.js`
- `src/features/sessionTracking/utils/previewWorkspace.js`
- `src/features/reporting/hooks/useBehaviorSystemReports.js`
- `src/features/reporting/services/reportingEngine.js`
- `src/hooks/useIsTabletLayout.js`

## Updated Navigation Flow

### Therapist Workflow

1. Dashboard card: `Tap Tracker` opens `TapTrackerScreen`
2. Dashboard card: `Summary Review` opens `SummaryReviewScreen`
3. Dashboard or drawer: `Reports` opens `ReportsScreen`
4. `TapTrackerScreen` and `SummaryReviewScreen` cross-link to each other
5. Preview mode remains available when no learner is selected
6. `ChildDetailScreen` acts as a profile host and launcher for therapist tools instead of duplicating tracker and summary state
7. `MyChildScreen` can open `ReportsScreen` directly for the selected learner

### iPad Drawer Groups

- Daily Operations
  - Dashboard
  - Tap Tracker
  - Summary Review
  - Attendance (admin)
- Programs & Data
  - Reports
  - Program Directory (admin)
- Communication
  - Messages
- Scheduling
  - Schedule
- Admin / Workspace
  - Student Directory (admin)
  - Settings

### Stack Updates

- `CommunityStack`
  - added `TapTracker`
  - added `SummaryReview`
  - added `Reports`
- `ControlsStack`
  - added `TapTracker`
  - added `SummaryReview`
  - added `Reports`
  - added `ScheduleCalendar`
- `MyChildStack`
  - added `Reports`

## Updated Data Models

### Therapy Workspace State

- `activeSession`
- `draftSummary`
- `latestApprovedSummary`
- `queuedEvents`
- `recentEvents`
- `sessionNote`
- `summaryNarrative`
- preview equivalents for the same fields

### Reporting Aggregates

- behavior trend series by month
- mood trend series by month
- program mastery table
- reinforcer effectiveness summary
- monthly utilization summary
- attendance totals
- learner behavior heatmap
- school-wide behavior heatmap
- school-wide parent engagement totals

## Reporting Engine Architecture

### Data Sources

- `getChildSessionSummaries(childId, limit)`
- `getMoodHistory(childId, limit)`
- `getAttendanceHistory(childId, limit)`
- directory and memo data from `DataContext`

### Processing Layers

1. API fetch layer in `useBehaviorSystemReports`
2. aggregation layer in `reportingEngine.js`
3. presentation layer in `ReportMetricCard`, `MiniBarChart`, and `HeatmapGrid`
4. screen composition in `ReportsScreen`

### Current Output Types

- parent-facing learner summaries
- therapist-facing progress and behavior snapshots
- admin-facing school-wide heatmaps and engagement summaries

## TODOs And Follow-Up Tasks

1. Remove any leftover legacy navigation paths that still target `ChildDetailScreen` with therapist-specific assumptions.
2. Add report date-range filters and persisted filter state.
3. Add API endpoints for organization-wide session summary queries so school-wide reporting does not need per-child fan-out requests.
4. Expand reporting visuals with richer charting once the team decides whether to keep custom cards or add a chart library.
5. Add integration or smoke coverage for `TapTrackerScreen`, `SummaryReviewScreen`, and the tablet shell navigation paths.
6. Add role-specific access controls for report sections if certain analytics should be hidden from parents or limited staff roles.