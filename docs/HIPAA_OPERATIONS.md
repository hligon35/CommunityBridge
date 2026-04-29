# HIPAA Operations Checklist

This repository now enforces stricter data access, notification, export, and telemetry defaults, but deployment is not HIPAA-ready until the operational controls below are completed and maintained.

## Required Before Production Use

- Execute Business Associate Agreements for every service that stores, relays, or can access regulated data.
- Verify Firebase, Cloud Run, Postgres hosting, email delivery, SMS delivery, Sentry, and push-notification providers are approved for the intended workload.
- Set and rotate these secrets before production startup:
  - `CB_JWT_SECRET`
  - `CB_MFA_CODE_SECRET`
  - `CB_SMTP_URL`
  - `CB_EMAIL_FROM`
  - `CB_TWILIO_ACCOUNT_SID`
  - `CB_TWILIO_AUTH_TOKEN`
  - `CB_TWILIO_FROM` or `CB_TWILIO_MESSAGING_SERVICE_SID`
- Keep public signup disabled unless an approved enrollment process exists.
- Keep MFA enabled for privileged and PHI-accessing roles.

## Access Review

- Review all admin, org-admin, campus-admin, and super-admin accounts at least monthly.
- Review audit log volume and unexpected privileged changes at least weekly.
- Remove dormant privileged accounts immediately.
- Verify scoped roles still match organization, campus, and program assignments after staff changes.

## Logging And Incident Response

- Retain server audit logs in a protected system with restricted access.
- Alert on repeated failed login, password-reset, and MFA delivery events.
- Alert on privileged changes to organization settings, permissions configuration, and managed users.
- Document incident triage, containment, breach review, and notification steps.

## Device And Session Controls

- Enforce device-level passcodes and remote-wipe policy for managed devices.
- Treat shared-device/browser access as high risk and restrict where appropriate.
- Review session timeout and re-authentication requirements before broad production rollout.

## Change Management

- Re-run the security audit after any change to auth, messaging, notifications, exports, storage, or Firestore rules.
- Re-run deployment readiness checks whenever a provider, region, or environment variable changes.