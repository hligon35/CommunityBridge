# Archived legacy screens

These files predate the refactor that moved screens to `src/screens/`. They
are not referenced from `App.js` or anywhere in the active source tree
(verified by import grep on 2026-04-27). They are kept here for git history
and reference; safe to delete entirely once you're sure nothing in your
local branches still imports them.

The two screens that **are** still imported from `screens/` —
`LoginScreen.js` and `TwoFactorScreen.js` — remain at `screens/` (not in this
archive), because `App.js` lines 52–53 import them from there.
