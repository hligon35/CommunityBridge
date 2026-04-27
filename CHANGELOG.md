# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres loosely to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- `scripts/preflight-expo-start.js` and `prestart:expo` package script: clears
  stale web-export artifacts under `public/_expo` and `public/assets` before
  every `npm run start:expo`, preventing Metro "Asset not found" errors and
  marketing-shell renders when web is opened against the native dev server.
- `.github/workflows/pr-checks.yml`: runs `check:secrets` and the smoke E2E
  against the in-memory mock API on every PR and push to `master`/`main`.
- `screens/_archive/`: parked 10 unreferenced legacy screen files
  (`AdminScreen`, `CalendarScreen`, `ComposeMessageScreen`,
  `ForgotPasswordScreen`, `HomeScreen`, `MessageDetailScreen`,
  `MessagesScreen`, `SettingsScreen`, `SignUpScreen`, `UrgentMemosScreen`).
  `LoginScreen.js` and `TwoFactorScreen.js` remain in `screens/` because
  `App.js` still imports them from there.
- README "Web vs native dev — which task to run" section.
- `APP_COMPLETION_REPORT.txt`: 10-layer audit summary.
- `docs/API.md`: top-level inventory of HTTP endpoints exposed by the local
  API server / mock.
- `.prettierrc.json`: shared Prettier defaults (no automatic formatting; only
  applied when contributors run `npx prettier`).

### Changed
- _None — this changelog is being introduced retroactively for the audit
  pass on 2026-04-27. Prior history lives in git._

### Notes
- Existing `eas-testflight.yml` and `eas-android-internal.yml` workflows are
  unchanged; the new `pr-checks.yml` is independent and does not run EAS.
