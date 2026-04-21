# CommunityBridge (Expo)

This Expo React Native app reproduces the CommunityBridge web app UX with Home, Chats, Urgent Memos, media uploads, auth, and persistence.

Note: This repository still contains legacy technical identifiers (bundle/package IDs, Firebase project IDs, hosting site IDs, Docker service names, etc.) that include "BuddyBoard" for compatibility. This README uses **CommunityBridge** for product branding, while leaving identity-critical identifiers unchanged unless explicitly migrated.

Setup

```powershell
cd BuddyBoard
npm install
npm start
# Android emulator: npm run android
# iOS (mac): npm run ios
# Web: npm run web
```

If you see `PluginError: Failed to resolve plugin for module "expo-notifications"`, install deps then restart Metro:

```powershell
npx expo install expo-notifications expo-device
npx expo start -c
```

Configuration

- Set `EXPO_PUBLIC_API_BASE_URL` in your environment to change the API base URL (recommended).
- On Android emulator, if your backend runs on localhost, use `10.0.2.2` as the host.
- (Optional) For address autocomplete in Admin → Arrival Detection Controls, set `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` in your environment.
- For Google sign-in, set these environment variables:
	- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
	- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
	- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
	- For EAS builds: set them in the EAS dashboard (recommended) or in `eas.json` under the build profile `env`, then rebuild the binary.
- By default in dev (including Expo Go), the app auto-logs in with a dev token. To test the real login flow in Expo Go, set `EXPO_PUBLIC_DISABLE_DEV_AUTOLOGIN=1`.

Notes

- Auth uses token-based approach persisted in `AsyncStorage`.
- DataContext persists posts and messages in `AsyncStorage` and performs optimistic updates.
- Media uploads use Firebase Storage in the app; legacy API uploads exist at `/api/media/upload` (served under `/uploads/*`).
- Link previews use `/api/link/preview?url=`.
- Urgent memos are fetched on app start and acknowledged via `/api/urgent-memos/read`.

Local API + smoke tests (Windows)
-------------------------------

This repo includes two backends you can run locally:

- Real API server: `scripts/api-server.js` (SQLite) — default port `3005`
- Real API server (Postgres): `scripts/api-server-pg.js` — enabled when `CB_DATABASE_URL` (preferred) or `BB_DATABASE_URL` (legacy) is set
- Mock API server: `scripts/api-mock.js` (in-memory) — default port `3006`

The end-to-end smoke runner calls auth → posts/comments/reactions → urgent memos → time changes → link preview → push/arrival → media upload and prints a color-coded PASS/FAIL summary.

### Mock API (fastest)

Terminal 1:

```powershell
npm run api:mock
```

Terminal 2:

```powershell
npm run smoke:mock
```

### Real API server (SQLite)

Terminal 1 (enable signup + return a dev 2FA code so the smoke test can complete automatically):

```powershell
$env:PORT='3005'
$env:CB_JWT_SECRET='dev-secret'
$env:CB_ALLOW_SIGNUP='1'
$env:CB_REQUIRE_2FA_ON_SIGNUP='1'
$env:CB_DEBUG_2FA_RETURN_CODE='1'
npm run api:server
```

Terminal 2:

```powershell
npm run smoke:server
```

### Point the Expo app at your local API

For the real server:

```powershell
$env:EXPO_PUBLIC_API_BASE_URL='http://127.0.0.1:3005'
npm start
```

For the mock server:

```powershell
$env:EXPO_PUBLIC_API_BASE_URL='http://127.0.0.1:3006'
npm start
```

Server env vars (self-hosted)
----------------------------
For local dev and self-hosted servers, put runtime config in a `.env` file in the repo root (do not commit it). The Node API server loads `.env.local` then `.env` automatically.

Required (recommended):
- `EXPO_PUBLIC_API_BASE_URL` — API base URL the mobile app will call.
	- For a physical device, this must be reachable from the device (LAN IP or public URL), not `localhost`.

Optional:
- `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` — enables address autocomplete.

API server DB settings:
- `CB_DATA_DIR` — preferred host directory where CommunityBridge stores runtime data (defaults to `./.data`).
- Uploads are stored under `${CB_DATA_DIR}/uploads` (or `${BB_DATA_DIR}/uploads`) and served at `/uploads/*` from the API.
	- In production, `/uploads/*` is protected by default (`CB_REQUIRE_UPLOAD_AUTH=1`) and requires a short-lived signed URL token (`?t=...`) or an API bearer token.
	- `POST /api/media/upload` returns tokenized URLs automatically when upload auth is required.
- By default, the API uses SQLite at `${CB_DATA_DIR}/buddyboard.sqlite` (legacy filename preserved).
- To use Postgres instead, set `CB_DATABASE_URL` (preferred).

Legacy compatibility:
- All `BB_*` env vars are still supported; `CB_*` is preferred and takes precedence when both are set.
- `CB_PUBLIC_BASE_URL` — optional; forces the base URL used in uploaded media links (useful behind a reverse proxy/HTTPS).
- `CB_JWT_SECRET` — required for real logins; set a long random value.
- `CB_CORS_ORIGINS` — optional; comma-separated allowlist for browser `Origin` (recommended in production). If unset, a safe default allowlist is used in production.
- `CB_REQUIRE_UPLOAD_AUTH` — optional; set to `0` to temporarily keep `/uploads/*` public (not recommended).
- `CB_ADMIN_EMAIL` / `CB_ADMIN_PASSWORD` / `CB_ADMIN_NAME` — optional admin seed on first run.
- `CB_ALLOW_SIGNUP=1` (or `true`) — optional; enables `/api/auth/signup`.
- `CB_REQUIRE_2FA_ON_SIGNUP=1` (default) — requires 2FA for signup.
- `CB_DEBUG_2FA_RETURN_CODE=1` — DEV ONLY; returns `devCode` in the signup response and logs it server-side.
- `CB_ALLOW_DEV_TOKEN=1` (or `true`) — optional; enables accepting `Bearer dev-token` for local/dev only. Default is enabled when `NODE_ENV` is not `production`.

Rate limiting (best-effort, in-memory):
- `CB_AUTH_RATE_WINDOW_MS` / `CB_AUTH_RATE_MAX` — auth endpoints.
- `CB_UPLOAD_RATE_WINDOW_MS` / `CB_UPLOAD_RATE_MAX` — upload endpoints.

Secrets hygiene:
- `npm run check:secrets` scans tracked files for obvious private keys/tokens.
- The repo includes a pre-commit hook in `.githooks/pre-commit`; `setup.ps1` / `setup.sh` configures `git config core.hooksPath .githooks`.

2FA delivery

Email 2FA (default; recommended for now):
- `CB_ENABLE_EMAIL_2FA=1` (default)
- `CB_SMTP_URL` — e.g. `smtp://user:pass@smtp.example.com:587`
- `CB_EMAIL_FROM` — e.g. `CommunityBridge <no-reply@example.com>`
- Optional: `CB_EMAIL_2FA_SUBJECT`

SMS 2FA (currently disabled by default; code paths remain for later):
- `CB_ENABLE_SMS_2FA=1`
- `CB_TWILIO_ACCOUNT_SID`
- `CB_TWILIO_AUTH_TOKEN`
- Either `CB_TWILIO_FROM` (a Twilio phone number in E.164 format) or `CB_TWILIO_MESSAGING_SERVICE_SID`

If `CB_ALLOW_SIGNUP=1` and `CB_REQUIRE_2FA_ON_SIGNUP=1`, and you do NOT set `CB_DEBUG_2FA_RETURN_CODE=1`, signup will fail unless a 2FA delivery method is configured (email SMTP by default; SMS requires explicitly enabling `CB_ENABLE_SMS_2FA=1`).

2FA code timing:
- Codes expire after 5 minutes.
- You can request a new code at most once every 5 minutes.

Example `.env`:

```env
EXPO_PUBLIC_API_BASE_URL=http://YOUR_SERVER_IP:3005
EXPO_PUBLIC_GOOGLE_PLACES_API_KEY=
CB_DATA_DIR=/mnt/bigdrive/communitybridge
CB_DATABASE_URL=
CB_JWT_SECRET=replace-with-long-random
CB_ALLOW_SIGNUP=0
CB_REQUIRE_2FA_ON_SIGNUP=1
CB_DEBUG_2FA_RETURN_CODE=0
CB_ALLOW_DEV_TOKEN=0
CB_ENABLE_EMAIL_2FA=1
CB_SMTP_URL=
CB_EMAIL_FROM=
CB_EMAIL_2FA_SUBJECT=
CB_ENABLE_SMS_2FA=0
CB_TWILIO_ACCOUNT_SID=
CB_TWILIO_AUTH_TOKEN=
CB_TWILIO_FROM=
CB_TWILIO_MESSAGING_SERVICE_SID=
CB_ADMIN_EMAIL=
CB_ADMIN_PASSWORD=
CB_ADMIN_NAME=Admin
```

After changing `.env`, restart the `expo` service so Metro rebundles with the new values.
After changing `.env`, restart your dev servers (Expo/Metro and the API) so they pick up the new values.

EAS internal distribution builds
-------------------------------
This repo is configured for EAS builds with internal distribution (useful for installing on testers' devices without going through the public stores).

Prereqs:
- Install EAS CLI: `npm i -g eas-cli`
- Log in: `eas login`

Recommended profiles:
- `internal` (Android APK, easy sideload / testers)
- `testflight-internal` (iOS TestFlight internal testing)
- `preview` (Android App Bundle)
- `production` (store-ready)

Build examples:

```sh
# Android APK for internal testing
eas build -p android --profile internal

# iOS internal build (requires Apple Developer account + device provisioning)
eas build -p ios --profile internal

# iOS TestFlight internal build (App Store Connect upload)
eas build -p ios --profile testflight-internal
```

Submit (TestFlight):

```sh
# Submit the latest TestFlight internal build to App Store Connect
eas submit -p ios --profile testflight-internal --latest
```

Notes:
- The app reads the API host from `EXPO_PUBLIC_API_BASE_URL` (see `eas.json`).
- For web builds, if `EXPO_PUBLIC_API_BASE_URL` is not set, the app falls back to the current browser origin (so accessing the site via an IP/alternate hostname still works when `/api/*` is reverse-proxied).

Firebase Hosting (marketing + app SPA)
------------------------------------

This repo is set up for a single Firebase Hosting site (see `firebase.json`):

- **Site**: `communitybridge-26apr` (serves `public/`)

The Expo web app is published under `/dashboard` on the same origin.

Build the web app bundle:

```sh
npm run build:web
```

Before deploying, update `firebase.json` and ensure the Cloud Run serviceId is correct for the `/api/**` and `/uploads/**` rewrites.

Deploy examples:

```sh
# Hosting (marketing + /dashboard SPA)
firebase deploy --only hosting:communitybridge-26apr
```

After connecting custom domains in Firebase Hosting, add them to Firebase Auth **Authorized domains** (needed for `/app-login`).

Minimal migration path (keeps app working)
-----------------------------------------

1. **Firebase Hosting serves the SPA** on the app subdomain, while `/api/*` and `/uploads/*` are rewritten to the existing Cloud Run backend.
2. **Keep Cloud Run as the API** while you validate web + mobile against production.
3. **Migrate endpoints incrementally**: move a small set of server endpoints to Cloud Functions + Firestore, keeping the same external `/api/*` shape.
4. **Retire Cloud Run + the SQL store** after all required endpoints/data are on Firebase.

EAS Update (OTA) from ARM64 Linux
--------------------------------
If you're running on ARM64 Linux (e.g. Raspberry Pi), `eas update` can fail because React Native's bundled `hermesc` binary in `node_modules` is x86_64.

This repo includes an ARM64-friendly helper that exports iOS bundles with `--no-bytecode` and then publishes them with `--skip-bundler`:

```sh
# Publish an iOS OTA update to the preview channel (ARM64-safe)
npm run update:ios:preview:arm -- -m "Testing ready"

# Or publish to production
npm run update:ios:production:arm -- -m "Hotfix"

# Publish to ad-hoc/internal distribution builds (channel: internal)
npm run update:ios:internal:arm -- -m "Internal hotfix"

# Publish to TestFlight internal builds (channel: testflight-internal)
npm run update:ios:testflight-internal:arm -- -m "TestFlight hotfix"
```

Under the hood this runs `npx expo export --no-bytecode` and then `eas update --skip-bundler --input-dir dist`.

If you need to publish Android or both platforms from ARM64, use:

```sh
# Publish an Android OTA update (ARM64-safe)
npm run update:android:production:arm -- -m "Hotfix"

# Publish both iOS + Android (ARM64-safe)
npm run update:production:arm -- -m "Hotfix"
```

Crash reporting (Sentry) for internal builds
-------------------------------------------
For near-real-time debugging while testing internal iOS builds, the app supports Sentry crash/error reporting.

How it works:
- If `EXPO_PUBLIC_SENTRY_DSN` is set at build time, the app initializes Sentry and attaches an Event ID to captured errors.
- If the DSN is not set, Sentry is a no-op (safe for dev/local).

Setup (recommended: use EAS secrets)

1) Create a Sentry project (React Native).
2) Set the DSN as an EAS secret:

```sh
eas secret:create --name EXPO_PUBLIC_SENTRY_DSN --value "https://...@o0.ingest.sentry.io/123" --type string
```

Optional (helps separate environments in Sentry):

```sh
eas secret:create --name EXPO_PUBLIC_SENTRY_ENVIRONMENT --value "internal" --type string
```

3) Rebuild your internal iOS binary:

```sh
eas build -p ios --profile internal
```

What to send when something breaks

Ask testers to send:
- The Sentry Event ID (or the Sentry issue link)
- Approx timestamp
- Exact steps to reproduce (screen name + taps)

Where it’s wired:
- Sentry init: `src/sentry.js`
- App wrapper: `App.js`

Production HTTPS (recommended)
------------------------------
For App Store / Play Store builds (and iOS reliability), use a stable HTTPS domain.

This repo includes a minimal Caddy reverse-proxy setup:
- [Caddyfile](Caddyfile) proxies `https://buddy-board.com` to the `api` service.
- Install Caddy on your server and run the API as a normal OS service.

DNS / networking requirements:
- Create a DNS A record for `buddy-board.com` pointing to your *public/WAN* IPv4 address (not the server's `10.x.x.x` LAN IP).
- Forward ports `80` and `443` on your router/firewall to the server.

Add these to your server `.env`:

```env
EXPO_PUBLIC_API_BASE_URL=https://buddy-board.com
CB_PUBLIC_BASE_URL=https://buddy-board.com
BB_PUBLIC_BASE_URL=https://buddy-board.com
```

Start production services (no Docker):

- Use a service manager to run the API (Windows: NSSM; Linux: systemd).
- Point Caddy at the local API (default `127.0.0.1:3005`).

To keep your server checkout matching GitHub, use a `git fetch`/`reset --hard` deployment and then restart the OS service.

GitHub Actions auto-deploy (push-to-master)
------------------------------------------
This repo includes a workflow [deploy-server.yml](.github/workflows/deploy-server.yml) that can deploy on every push to `master`.

Add these repository secrets:
- `DEPLOY_HOST` (example: `1.2.3.4`)
- `DEPLOY_USER` (example: `creator`)
- `DEPLOY_SSH_KEY` (private key for SSH)
- `DEPLOY_PATH` (example: `/srv/apps/BuddyBoard`)
- `DEPLOY_PORT` (optional; default is 22)
# CommunityBridge (React Native scaffold)

This folder contains a scaffolded React Native (Expo) version of the CommunityBridge web app. It's an approximate, hybrid-native shell with placeholder screens and navigation mirroring the web app structure. This scaffold is not installed — run the included `setup.sh` or `setup.ps1` scripts after moving the directory to your target machine to install dependencies and initialize the project.

Files included:
- `App.js` — entry point with navigation
- `/screens` — placeholder screens (Home, Login, Messages, Calendar, Settings, Admin)
- `package.json` — scripts and minimal dependencies
- `setup.sh` / `setup.ps1` — install & bootstrap scripts

Backend integration
-------------------
This scaffold can be wired to your CommunityBridge backend. Prefer setting `EXPO_PUBLIC_API_BASE_URL` to the base URL for your API (example: `https://communitybridge.example.com` or `http://10.0.0.5:3000`) rather than editing code. The mobile app expects the following endpoints (examples):

- `GET  /api/messages` -> returns an array of messages: [{id,title,body,date,sender,read}]
- `POST /api/messages` -> accepts {title,body,sender}, returns the created message with `id` and `date`.
- `GET  /api/urgent-memos` -> returns an array of urgent memos: [{id,title,body,date,ack}]
- `POST /api/urgent-memos` -> accepts {title,body}, returns the created memo with `id` and `date`.
- `POST /api/urgent-memos/:id/ack` -> acknowledge an urgent memo.
- `POST /api/auth/login` -> accepts {email,password}, returns user/session info (optional for demo).

The client implementation is in `src/Api.js`. The `DataContext` uses these methods to hydrate data on startup and to forward created messages/memos to the backend. If the backend is unreachable the app will continue to run using its in-memory seed data.

Run the app
----------
After setting your environment variables:
1. Run `./setup.sh` or `.\setup.ps1` to install dependencies.
2. Run `npm start` or `expo start`.


How to install (on target machine):
1. Move this directory to the desired location.
2. Run `./setup.sh` (Linux/macOS) or `.\setup.ps1` (Windows PowerShell) to install dependencies and initialize Expo.
3. Run `npm start` or `expo start` to launch the app.
