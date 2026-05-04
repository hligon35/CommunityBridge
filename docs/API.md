# API surface

This is a hand-curated inventory of the HTTP routes exposed by the in-repo
backends. The authoritative source is the route table in
[`scripts/api-server.js`](../scripts/api-server.js) (SQLite),
[`scripts/api-server-pg.js`](../scripts/api-server-pg.js) (Postgres variant
selected when `CB_DATABASE_URL` is set), and
[`scripts/api-mock.js`](../scripts/api-mock.js) (in-memory mock used by smoke
tests and the CI workflow). When the route lists drift, the production code
wins; please update this file in the same PR.

All routes live under the `/api` prefix when reached through the Cloud Run
service. In Firebase Hosting, `/api/**` is rewritten to the Cloud Run
service `communitybridge` (us-central1).

## Health

| Method | Path          | Description                                |
| ------ | ------------- | ------------------------------------------ |
| GET    | `/api/health` | Liveness probe. Returns `{ ok, uptime }`.  |

## Authentication

- `POST /api/auth/signup` — Create user. Rate-limited (5/15m/IP).
- `POST /api/auth/login` — Email + password. Rate-limited.
- `POST /api/auth/invite-login` — First-login exchange for managed invites.
- `POST /api/auth/approval-link-login` — One-time approval-link exchange for managed access.
- `POST /api/auth/forgot-password` — Issue reset code.
- `POST /api/auth/reset-password` — Apply reset code + new password.
- `POST /api/auth/complete-invite-password` — Finish managed invite password setup.
- `GET /api/auth/me` — Current user from bearer token.
- `POST /api/auth/2fa/start` — Begin SMS / TOTP enrollment.
- `POST /api/auth/2fa/verify` — Verify enrollment or login challenge.
- `POST /api/auth/2fa/disable` — Disable 2FA after verification.

## Board (posts, comments, reactions)

- `GET /api/board` — List posts.
- `POST /api/board` — Create post.
- `POST /api/board/:postId/like` — Toggle like.
- `POST /api/board/:postId/share` — Track share.
- `POST /api/board/:postId/comments` — Add comment.
- `POST /api/board/:postId/comments/:commentId/replies` — Add reply.
- `POST /api/board/:postId/comments/:commentId/react` — Reaction on a comment.

## Messages

| Method | Path                       | Notes                              |
| ------ | -------------------------- | ---------------------------------- |
| GET    | `/api/messages`            | List threads/messages.             |
| POST   | `/api/messages`            | Send message.                      |

## Urgent memos

| Method | Path                                  | Notes                                   |
| ------ | ------------------------------------- | --------------------------------------- |
| GET    | `/api/urgent-memos`                   | List memos visible to caller.           |
| POST   | `/api/urgent-memos`                   | Create memo (admin role required).      |
| POST   | `/api/urgent-memos/:id/respond`       | Respond to memo.                        |
| POST   | `/api/urgent-memos/read`              | Mark memos read.                        |

## Directory + tenant

| Method | Path                          | Notes                                  |
| ------ | ----------------------------- | -------------------------------------- |
| GET    | `/api/directory`              | Tenant directory (org/program/campus). |
| GET    | `/api/org-settings`           | Read org settings (admin).             |
| PUT    | `/api/org-settings`           | Update org settings (admin).           |

## Time-change proposals (children)

| Method | Path                                                | Notes                          |
| ------ | --------------------------------------------------- | ------------------------------ |
| GET    | `/api/children/time-change-proposals`               | List proposals for caller.     |
| POST   | `/api/children/time-change-proposals`               | Propose time change.           |
| POST   | `/api/children/time-change-proposals/:id/respond`   | Respond to proposal.           |

## Misc

- `GET /api/link/preview` — Returns OG/twitter card metadata for a URL.
- `POST /api/push/register` — Register a push token for the caller.
- `DELETE /api/push/unregister` — Drop a push token.
- `GET /api/push/tokens` — Admin inspection of registered tokens.
- `POST /api/arrival/ping` — Pickup-arrival proximity ping.
- `POST /api/aba/refresh` — ABA integration trigger sync.
- `POST /api/media/upload` — Multipart upload; served back under `/uploads/*`.

## Authentication & rate limiting

- All non-public routes require `Authorization: Bearer <token>` where the
  token is issued by `/api/auth/login`, `/api/auth/invite-login`, or
  `/api/auth/approval-link-login`. Tokens are short-lived; the client
  refreshes via `/api/auth/me`.
- Public Google OAuth is no longer part of the documented auth surface.
- Rate limiting on auth routes is in-process (5 requests / 15 minutes /
  IP). Behind Cloud Run's autoscaler this is per-instance, so effective
  limits are higher than the literal number suggests. See
  `APP_COMPLETION_REPORT.txt` Layer 3 for the recommended replacement.

## Errors

Most routes return `{ ok: false, error: "<message>" }` with a 4xx/5xx
status code. Validation is per-route today; a Zod-based shared schema
layer is on the recommended-next-steps list.
