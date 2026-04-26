# Multi-Tenant Audit

## Current constraints

- The app is Expo/React Native with Firebase, not Flutter.
- Global top-level collections and AsyncStorage keys in `src/DataContext.js` assume one shared tenant.
- `src/Api.js` currently stores users in a global `users/{uid}` profile without required org, branch, or campus membership.
- `screens/SignUpScreen.js` previously created a parent account with no organization routing or enrollment validation.
- `firestore.rules` currently guard single-tenant collections and do not isolate organization-scoped data.

## Phase-one changes in this branch

- Added tenant models, repositories, and a `TenantProvider` under `src/core/tenant`.
- Added public callable functions for organization, branch, campus, and enrollment-code resolution.
- Refactored signup to require organization, branch, and enrollment code before account creation.
- Added top-level user membership fields plus an org-scoped user record at `organizations/{orgId}/users/{uid}`.
- Added a multi-tenant Firestore rules example for the new organization hierarchy without breaking current production rules.

## Remaining work

- Move chat, posts, students, parents, and therapist data from top-level collections into organization-scoped collections.
- Filter `DataContext` reads and writes by the active tenant context.
- Add admin management screens for organizations, branches, campuses, enrollment codes, and role assignments.
- Add server-side migration scripts to backfill memberships and tenant ownership for existing users and data.
