# BuddyBoard — Marketing & Product Audit (Workspace Evidence)

**Scope:** This report is based only on artifacts present in this workspace (code, config, and static site files). Where behavior depends on runtime config or external services, it is labeled **Unclear** rather than inferred.

**Workspace note (important):** The workspace contains duplicated app roots (top-level and nested). The nested folder appears more complete (it contains iOS project files and the hosted web pages), so this report primarily cites evidence under:
- [BuddyBoard/](BuddyBoard/) (nested app root)

---

## #1 — Executive Summary

BuddyBoard appears to be a family–provider coordination product with:
- A React Native / Expo mobile app with role-based navigation (admin/therapist/parent) and features for posts, private chats, urgent memos, directory views, and arrival detection. Role-based route exposure is implemented in the app entrypoint and uses `user.role`. See [BuddyBoard/App.js](BuddyBoard/App.js) and [BuddyBoard/src/AuthContext.js](BuddyBoard/src/AuthContext.js).
- A static marketing/distribution website that includes download links and Privacy/Terms/Support pages.
- A Firebase-backed architecture for the mobile client (Authentication/Firestore/Storage/Functions), with additional Node/Express API server scripts also present (usage by the current mobile client is **Mixed/Unclear**).

High-signal findings for marketing readiness:
- iOS distribution link is currently a placeholder (TestFlight URL includes `REPLACE_ME`). See [BuddyBoard/public/download.html](BuddyBoard/public/download.html).
- Android distribution via direct APK download is present in repo. See [BuddyBoard/public/downloads/](BuddyBoard/public/downloads/).

Direct file evidence: [BuddyBoard/public/downloads/buddyboard-android.apk](BuddyBoard/public/downloads/buddyboard-android.apk).
- Privacy/Terms/Support pages exist, include “not an emergency service” language, and mention use of third-party services like Firebase. See [BuddyBoard/public/privacy.html](BuddyBoard/public/privacy.html), [BuddyBoard/public/terms.html](BuddyBoard/public/terms.html), [BuddyBoard/public/support.html](BuddyBoard/public/support.html).

High-signal findings for product/compliance risk:
- The web “app login” page includes a hard-coded Firebase config (not a secret, but it anchors the public identity of the project). See [BuddyBoard/public/app-login.html](BuddyBoard/public/app-login.html).
- The repository includes a file named [BuddyBoard/google-play-service-account.json](BuddyBoard/google-play-service-account.json) (potentially sensitive; contents not inspected in this report).

---

## #2 — Product Positioning & Target Users (Evidence-Based)

**What the product does (supported):**
- Coordinates posts (“Post Board”), comments/replies, reactions, and sharing (mobile feed). Evidence concentrates in the client API layer and screens/components. See [BuddyBoard/src/Api.js](BuddyBoard/src/Api.js) and the screen folder [BuddyBoard/src/screens/](BuddyBoard/src/screens/).
- Supports private messaging (“Chats” / threads). See [BuddyBoard/src/Api.js](BuddyBoard/src/Api.js).
- Supports “Urgent Memos” workflows including acknowledgement and response. See [BuddyBoard/src/Api.js](BuddyBoard/src/Api.js).
- Supports “Arrival Detection” using location permissions and server pings. See [BuddyBoard/src/screens/HelpScreen.js](BuddyBoard/src/screens/HelpScreen.js) and [BuddyBoard/src/screens/SettingsScreen.js](BuddyBoard/src/screens/SettingsScreen.js).

**Implied audiences (supported by role vocabulary and navigation patterns):**
- Parents/caregivers (parent directory features; “My Child” help copy). See [BuddyBoard/src/screens/HelpScreen.js](BuddyBoard/src/screens/HelpScreen.js) and [BuddyBoard/src/screens/ParentDirectoryScreen.js](BuddyBoard/src/screens/ParentDirectoryScreen.js).
- Therapists/staff (“Faculty” directory; therapist list in data context). See [BuddyBoard/src/screens/FacultyDirectoryScreen.js](BuddyBoard/src/screens/FacultyDirectoryScreen.js).
- Admins (moderation and controls features; an admin-only “Controls” stack is conditionally exposed by role). Evidence exists for moderation UI. See [BuddyBoard/App.js](BuddyBoard/App.js) and [BuddyBoard/src/screens/ModeratePostsScreen.js](BuddyBoard/src/screens/ModeratePostsScreen.js).

**Unclear (not evidenced in files reviewed):**
- Pricing model, subscription/billing, or purchase flow.
- Whether the product is sold to schools, clinics, or direct-to-consumer (copy suggests org usage, but no explicit pricing/plan content found).

---

## #3 — Core User Journeys (From App + Site Artifacts)

**Onboarding / Account access**
- Web: Email/password sign-in and password reset via Firebase Auth from a browser login page. See [BuddyBoard/public/app-login.html](BuddyBoard/public/app-login.html).
- Mobile: Login screen exists (not re-cited here; referenced in repo search results). See [BuddyBoard/screens/](BuddyBoard/screens/).

**Install / Distribution**
- Web download page offers:
  - iOS TestFlight link (currently placeholder)
  - Android APK download
  See [BuddyBoard/public/download.html](BuddyBoard/public/download.html).

**Day-to-day usage (supported)**
- Parents: view child info (help copy), participate in chats, and manage notifications/location settings. See [BuddyBoard/src/screens/HelpScreen.js](BuddyBoard/src/screens/HelpScreen.js), [BuddyBoard/src/screens/SettingsScreen.js](BuddyBoard/src/screens/SettingsScreen.js).
- Staff: directory features (faculty directory). See [BuddyBoard/src/screens/FacultyDirectoryScreen.js](BuddyBoard/src/screens/FacultyDirectoryScreen.js).
- Admin: moderate posts/comments and block users (local effect in client). See [BuddyBoard/src/screens/ModeratePostsScreen.js](BuddyBoard/src/screens/ModeratePostsScreen.js).

---

## #4 — Feature Inventory (Mobile App)

This list is restricted to what is directly evidenced in the workspace.

**Content & social**
- Posts with `title`/`body`, author attribution, and timestamps (moderation view shows these fields). See [BuddyBoard/src/screens/ModeratePostsScreen.js](BuddyBoard/src/screens/ModeratePostsScreen.js).
- Comments and replies (moderation view can enumerate comments authored by a user and delete comments). See [BuddyBoard/src/screens/ModeratePostsScreen.js](BuddyBoard/src/screens/ModeratePostsScreen.js).

**Messaging**
- Threaded private messages and message sending via client API layer. See [BuddyBoard/src/Api.js](BuddyBoard/src/Api.js).

**Urgent memos / alerts**
- Urgent memo retrieval, acknowledgement, and responses via API layer. See [BuddyBoard/src/Api.js](BuddyBoard/src/Api.js).

**Directories**
- Student directory list with avatar/name/age/room/care plan fields. See [BuddyBoard/src/screens/StudentDirectoryScreen.js](BuddyBoard/src/screens/StudentDirectoryScreen.js).
- Parent directory list and navigation to parent detail; displays associated children names. See [BuddyBoard/src/screens/ParentDirectoryScreen.js](BuddyBoard/src/screens/ParentDirectoryScreen.js).
- Faculty directory list with phone/email quick actions. See [BuddyBoard/src/screens/FacultyDirectoryScreen.js](BuddyBoard/src/screens/FacultyDirectoryScreen.js).

**Settings / device features**
- Location-based “Arrival Detection” toggle and “business location” storage (AsyncStorage) for a business address/lat/lng. See [BuddyBoard/src/screens/SettingsScreen.js](BuddyBoard/src/screens/SettingsScreen.js).
- Push notification enable/disable plus granular preferences (chats, timeline posts, mentions, tags, replies, updates, other) persisted in AsyncStorage and synced to backend. See [BuddyBoard/src/screens/SettingsScreen.js](BuddyBoard/src/screens/SettingsScreen.js).
- OTA update check via `expo-updates` (checks, fetch, and reload). See [BuddyBoard/src/screens/SettingsScreen.js](BuddyBoard/src/screens/SettingsScreen.js).

---

## #5 — Admin & Moderation Capabilities

**Moderation UI (supported):**
- Remove posts (delete) from moderation list. See [BuddyBoard/src/screens/ModeratePostsScreen.js](BuddyBoard/src/screens/ModeratePostsScreen.js).
- Block user action is present, but the on-screen confirmation states effects are local: “remove their posts and messages locally.” See [BuddyBoard/src/screens/ModeratePostsScreen.js](BuddyBoard/src/screens/ModeratePostsScreen.js).
- Delete comments authored by a user (across posts, including replies). See [BuddyBoard/src/screens/ModeratePostsScreen.js](BuddyBoard/src/screens/ModeratePostsScreen.js).

**Unclear / needs validation:**
- Whether user blocking is enforced server-side (the UI language suggests local-only behavior; server enforcement not verified).
- Whether admin actions are audited/logged (no explicit audit log evidence found in reviewed files).

---

## #6 — Notifications & Engagement

**Push notifications (supported):**
- Push enable flow obtains an Expo push token and stores it in AsyncStorage under `push_expo_token_v1`.
- Push preferences are assembled into a `preferences` object and sent to backend via `Api.registerPushToken(...)`.
- Disabling push calls `Api.unregisterPushToken(...)`.
Evidence: [BuddyBoard/src/screens/SettingsScreen.js](BuddyBoard/src/screens/SettingsScreen.js).

**User-facing help copy (supported):**
- Help explains push controls (chats, timeline posts, mentions, comments, reminders). See [BuddyBoard/src/screens/HelpScreen.js](BuddyBoard/src/screens/HelpScreen.js).

**Unclear:**
- Actual push provider for delivery (Expo token suggests Expo Notifications pipeline, but server-side delivery mechanism is not evidenced here).

---

## #7 — Data Types, PII, and Sensitive Content Surface

**Directly evidenced data fields and categories include:**
- Identity/contact fields displayed in UI: email/phone (faculty and parent directory screens include phone/email actions). See [BuddyBoard/src/screens/FacultyDirectoryScreen.js](BuddyBoard/src/screens/FacultyDirectoryScreen.js), [BuddyBoard/src/screens/ParentDirectoryScreen.js](BuddyBoard/src/screens/ParentDirectoryScreen.js).
- Child/student fields displayed: name, age, room, care plan, avatar. See [BuddyBoard/src/screens/StudentDirectoryScreen.js](BuddyBoard/src/screens/StudentDirectoryScreen.js).
- User-generated content categories: posts, messages, urgent memos, comments/replies. See [BuddyBoard/public/privacy.html](BuddyBoard/public/privacy.html).
- Location data: arrival detection relies on device location permissions (help copy) and settings store business location coordinates. See [BuddyBoard/src/screens/HelpScreen.js](BuddyBoard/src/screens/HelpScreen.js), [BuddyBoard/src/screens/SettingsScreen.js](BuddyBoard/src/screens/SettingsScreen.js).

**Privacy page acknowledges sensitive context (supported):**
- The Privacy Policy explicitly flags “Potentially sensitive information” including minors and therapy schedules depending on what users share. See [BuddyBoard/public/privacy.html](BuddyBoard/public/privacy.html).

---

## #8 — Security Model & Access Control (Evidence)

**Client-side / UX controls (supported):**
- Some privacy-like toggles exist (show/hide email/phone/IDs) stored in AsyncStorage and used to set module-level visibility behavior. See [BuddyBoard/src/screens/SettingsScreen.js](BuddyBoard/src/screens/SettingsScreen.js).

**Firebase access control artifacts (supported):**
- Firestore and Storage rules exist in the nested app root:
  - [BuddyBoard/firestore.rules](BuddyBoard/firestore.rules)
  - [BuddyBoard/storage.rules](BuddyBoard/storage.rules)

**Unclear (not confirmed in this report):**
- Exact server-side enforcement semantics for all admin actions (some actions appear local).
- Whether there is organization-level isolation (multi-tenant separation) enforced purely via rules; rules exist but were not exhaustively evaluated line-by-line here.

---

## #9 — Compliance & Policy Surface (Public Web)

**What exists (supported):**
- Privacy Policy page with last-updated date and explicit mentions of:
  - Account info, user content (posts/messages/urgent memos), device/usage data, push tokens
  - Service providers (Firebase) and admin visibility within organizations
  See [BuddyBoard/public/privacy.html](BuddyBoard/public/privacy.html).
- Terms of Service page with:
  - Eligibility (18+), acceptable use restrictions
  - “Not an emergency service” and “no medical advice” disclaimers
  - Indiana governing law / venue language
  See [BuddyBoard/public/terms.html](BuddyBoard/public/terms.html).
- Support page with contact email and account deletion instruction (email request). See [BuddyBoard/public/support.html](BuddyBoard/public/support.html).

**Children/minors context (supported):**
- Privacy Policy states the product is not intended for children to use directly; adults/staff may include information about minors for coordination. See [BuddyBoard/public/privacy.html](BuddyBoard/public/privacy.html).

**Unclear / missing from reviewed artifacts:**
- Any explicit HIPAA/FERPA claims or compliance statements.
- A published data processing addendum (DPA) or security whitepaper.

---

## #10 — Marketing Website & Distribution Funnel

**Static site pages present (supported):**
- Home page and brand assets: see [BuddyBoard/public/index.html](BuddyBoard/public/index.html) (not exhaustively analyzed in this report).
- Download page: [BuddyBoard/public/download.html](BuddyBoard/public/download.html).
- Support, Privacy, Terms: [BuddyBoard/public/support.html](BuddyBoard/public/support.html), [BuddyBoard/public/privacy.html](BuddyBoard/public/privacy.html), [BuddyBoard/public/terms.html](BuddyBoard/public/terms.html).
- App login routes:
  - [BuddyBoard/public/app-login.html](BuddyBoard/public/app-login.html)
  - [BuddyBoard/public/app-login/](BuddyBoard/public/app-login/)

**Distribution specifics (supported):**
- iOS: TestFlight link is currently `https://testflight.apple.com/join/REPLACE_ME` (must be replaced before external marketing). See [BuddyBoard/public/download.html](BuddyBoard/public/download.html).
- Android: APK is hosted at `/downloads/buddyboard-android.apk`. See [BuddyBoard/public/downloads/](BuddyBoard/public/downloads/).

Direct file evidence: [BuddyBoard/public/downloads/buddyboard-android.apk](BuddyBoard/public/downloads/buddyboard-android.apk).

**Unclear:**
- App Store / Play Store listing pages (icons exist, but no store listing URLs found in reviewed static pages).

---

## #11 — Architecture & Backend Surface

**Mobile app runtime (supported):**
- Expo/React Native app using `expo-updates` for OTA update checks. See [BuddyBoard/src/screens/SettingsScreen.js](BuddyBoard/src/screens/SettingsScreen.js).

**Firebase usage (supported):**
- Firebase initialization reads Expo public env vars (with fallback behavior) and initializes Auth/Firestore/Storage/Functions. See [BuddyBoard/src/firebase.js](BuddyBoard/src/firebase.js).

**Additional backend scripts exist (supported):**
- Node API servers and utilities exist under:
  - [scripts/](scripts/)
  - [BuddyBoard/scripts/](BuddyBoard/scripts/)
- Docker compose files include a server stack and Postgres options. See [docker-compose.yml](docker-compose.yml), [docker-compose.server.yml](docker-compose.server.yml), [docker-compose.prod.yml](docker-compose.prod.yml) and duplicates under [BuddyBoard/](BuddyBoard/).

**Mixed/Unclear:**
- The current mobile client API layer in the nested app root appears Firebase-backed, while separate Express servers exist. It is unclear whether production uses Firebase-only, REST-only, or a hybrid.

---

## #12 — Configuration & Environment Variables (Evidence)

**Expo public vars referenced in client code/config:**
- `EXPO_PUBLIC_API_BASE_URL` (API base URL selection and warnings). See [BuddyBoard/src/config.js](BuddyBoard/src/config.js) and [BuddyBoard/eas.json](BuddyBoard/eas.json).
- `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` (address autocomplete use implied by config). See [BuddyBoard/src/config.js](BuddyBoard/src/config.js).
- `EXPO_PUBLIC_DISABLE_DEV_AUTOLOGIN`, `EXPO_PUBLIC_DEV_AUTO_LOGIN` (dev login behavior). See [BuddyBoard/src/config.js](BuddyBoard/src/config.js).
- `EXPO_PUBLIC_SUPPORT_EMAIL` (support email address used in help flow; fallback set). See [BuddyBoard/src/screens/HelpScreen.js](BuddyBoard/src/screens/HelpScreen.js).

**Firebase-related Expo public vars (client):**
- `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`, `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `EXPO_PUBLIC_FIREBASE_APP_ID`, `EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID`, `EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION`. See [BuddyBoard/src/firebase.js](BuddyBoard/src/firebase.js).

**Sentry (client + build tooling):**
- `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_ENVIRONMENT` are referenced. See [BuddyBoard/src/sentry.js](BuddyBoard/src/sentry.js) and [BuddyBoard/eas.json](BuddyBoard/eas.json).
- `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_ALLOW_FAILURE` are set in build profiles. See [BuddyBoard/eas.json](BuddyBoard/eas.json).

**Server-side env vars (Node scripts / docker):**
- Many `BB_*` variables exist for the Express server (JWT, signup/2FA flags, SMTP, Twilio, DB paths/URLs). Evidence appears in docker compose and scripts. See [docker-compose.yml](docker-compose.yml) and [BuddyBoard/scripts/api-server.js](BuddyBoard/scripts/api-server.js).

---

## #13 — Observability, Logging, and Supportability

**Sentry integration (supported):**
- Mobile app initializes Sentry when DSN is provided via build-time env. See [BuddyBoard/src/sentry.js](BuddyBoard/src/sentry.js).
- Build profiles include Sentry org/project info. See [BuddyBoard/eas.json](BuddyBoard/eas.json).

**Support contact (supported):**
- In-app help provides an email support button with configurable support email via `EXPO_PUBLIC_SUPPORT_EMAIL` fallback. See [BuddyBoard/src/screens/HelpScreen.js](BuddyBoard/src/screens/HelpScreen.js).
- Public site support page provides contact email and account deletion request method. See [BuddyBoard/public/support.html](BuddyBoard/public/support.html).

**Unclear:**
- Whether analytics (product usage tracking) exists beyond Sentry/error monitoring.

---

## #14 — Release Readiness & Store/Build Notes (Evidence)

**EAS configuration present (supported):**
- EAS build profiles exist. See [BuddyBoard/eas.json](BuddyBoard/eas.json) and [eas.json](eas.json).

**iOS build readiness (uncertain, but previously observed in this workspace):**
- Prior investigation indicated iOS build failures related to Xcode project parsing / SwiftPM resolution; additional root-cause work may be needed before TestFlight is reliably generated.
- The iOS TestFlight download link is currently placeholder regardless of build state. See [BuddyBoard/public/download.html](BuddyBoard/public/download.html).

**Android distribution (supported):**
- Android APK is present in the static hosting folder. See [BuddyBoard/public/downloads/](BuddyBoard/public/downloads/).

---

## #15 — Recommendations (Evidence-Driven, Prioritized)

1) **Replace the placeholder iOS TestFlight join link** before any marketing push.
- Evidence: [BuddyBoard/public/download.html](BuddyBoard/public/download.html).

2) **Decide (and document) the canonical backend architecture**: Firebase-only vs REST server vs hybrid.
- Evidence of mixed surface: [BuddyBoard/src/firebase.js](BuddyBoard/src/firebase.js), [BuddyBoard/src/Api.js](BuddyBoard/src/Api.js), and server scripts in [BuddyBoard/scripts/](BuddyBoard/scripts/).

3) **Treat potential secrets in-repo as a release blocker** (rotate/remove if needed).
- Evidence: file named [BuddyBoard/google-play-service-account.json](BuddyBoard/google-play-service-account.json) (contents not reviewed here).

4) **Clarify admin enforcement and moderation guarantees** in product messaging.
- Evidence: “Block user” described as local-only in UI confirmation text. See [BuddyBoard/src/screens/ModeratePostsScreen.js](BuddyBoard/src/screens/ModeratePostsScreen.js).

5) **Align public policy pages with actual implementation details** (data retention, deletion mechanics, role visibility).
- Evidence: [BuddyBoard/public/privacy.html](BuddyBoard/public/privacy.html) and [BuddyBoard/public/support.html](BuddyBoard/public/support.html).

---

# Top 20 Most Important Files for Marketing Review

1. [BuddyBoard/public/index.html](BuddyBoard/public/index.html) — Primary landing page content and messaging.
2. [BuddyBoard/public/download.html](BuddyBoard/public/download.html) — Install funnel; currently has placeholder iOS link.
3. [BuddyBoard/public/privacy.html](BuddyBoard/public/privacy.html) — Public privacy commitments and data categories.
4. [BuddyBoard/public/terms.html](BuddyBoard/public/terms.html) — Terms, disclaimers, governing law.
5. [BuddyBoard/public/support.html](BuddyBoard/public/support.html) — Support contact and account deletion instructions.
6. [BuddyBoard/public/app-login.html](BuddyBoard/public/app-login.html) — Web login experience; references Firebase Auth.
7. [BuddyBoard/src/screens/HelpScreen.js](BuddyBoard/src/screens/HelpScreen.js) — In-app help copy (product explanations).
8. [BuddyBoard/src/screens/SettingsScreen.js](BuddyBoard/src/screens/SettingsScreen.js) — Push + location + OTA update UX.
9. [BuddyBoard/src/screens/StudentDirectoryScreen.js](BuddyBoard/src/screens/StudentDirectoryScreen.js) — Student directory data fields (minors).
10. [BuddyBoard/src/screens/ParentDirectoryScreen.js](BuddyBoard/src/screens/ParentDirectoryScreen.js) — Parent directory UX and associations.
11. [BuddyBoard/src/screens/FacultyDirectoryScreen.js](BuddyBoard/src/screens/FacultyDirectoryScreen.js) — Staff directory + contact actions.
12. [BuddyBoard/src/screens/ModeratePostsScreen.js](BuddyBoard/src/screens/ModeratePostsScreen.js) — Moderation UX and claims.
13. [BuddyBoard/src/Api.js](BuddyBoard/src/Api.js) — Ground truth of client capabilities and backend calls.
14. [BuddyBoard/src/firebase.js](BuddyBoard/src/firebase.js) — Firebase initialization and environment dependency.
15. [BuddyBoard/firestore.rules](BuddyBoard/firestore.rules) — Evidence of access control policy.
16. [BuddyBoard/storage.rules](BuddyBoard/storage.rules) — Evidence of file upload permissions.
17. [BuddyBoard/eas.json](BuddyBoard/eas.json) — Build profiles, env wiring, release channels.
18. [BuddyBoard/app.json](BuddyBoard/app.json) — App identity, deep links, and Expo config surface.
19. [BuddyBoard/package.json](BuddyBoard/package.json) — Dependencies shaping capabilities and compliance.
20. [docker-compose.prod.yml](docker-compose.prod.yml) — Production server environment assumptions (if REST server is used).
