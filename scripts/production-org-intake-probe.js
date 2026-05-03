#!/usr/bin/env node

const crypto = require('crypto');
const { execSync } = require('child_process');

function safeString(value) {
  try {
    if (value == null) return '';
    return String(value);
  } catch (_) {
    return '';
  }
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input || '')).digest('hex');
}

function toFirestoreString(value) {
  return { stringValue: safeString(value) };
}

function toFirestoreTimestamp(value) {
  return { timestampValue: new Date(value).toISOString() };
}

function getAccessToken() {
  return execSync('gcloud auth print-access-token', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
}

async function firestoreRequest(url, accessToken, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  return body ? JSON.parse(body) : null;
}

function buildProbeDocument({ submissionId, tokenHash, email, timestamp }) {
  const orgName = `Approval Link Probe ${timestamp}`;
  const orgId = `approval-link-probe-${timestamp}`;
  const programId = 'early-intervention';
  const locationId = 'north-campus';

  return {
    fields: {
      status: toFirestoreString('pending'),
      organization: {
        mapValue: {
          fields: {
            id: toFirestoreString(orgId),
            name: toFirestoreString(orgName),
            directoryName: toFirestoreString(orgName),
            slug: toFirestoreString(orgId),
            shortCode: toFirestoreString('ALP'),
            phone: toFirestoreString('(555) 555-1111'),
            email: toFirestoreString(email),
            address1: toFirestoreString('100 Approval Way'),
            address2: toFirestoreString(''),
            city: toFirestoreString('Austin'),
            state: toFirestoreString('TX'),
            zipCode: toFirestoreString('78701'),
            website: toFirestoreString('https://communitybridge.app'),
          },
        },
      },
      contact: {
        mapValue: {
          fields: {
            name: toFirestoreString('Approval Probe'),
            title: toFirestoreString('Executive Director'),
            email: toFirestoreString(email),
            phone: toFirestoreString('(555) 555-2222'),
            role: toFirestoreString('superAdmin'),
          },
        },
      },
      programs: {
        arrayValue: {
          values: [
            {
              mapValue: {
                fields: {
                  id: toFirestoreString(programId),
                  name: toFirestoreString('Early Intervention'),
                  slug: toFirestoreString(programId),
                  type: toFirestoreString('centerBasedAba'),
                  description: toFirestoreString(''),
                },
              },
            },
          ],
        },
      },
      locations: {
        arrayValue: {
          values: [
            {
              mapValue: {
                fields: {
                  id: toFirestoreString(locationId),
                  programName: toFirestoreString('Early Intervention'),
                  programSlug: toFirestoreString(programId),
                  programType: toFirestoreString('centerBasedAba'),
                  programId: toFirestoreString(programId),
                  name: toFirestoreString('North Campus'),
                  slug: toFirestoreString(locationId),
                  campusType: toFirestoreString('Center'),
                  phone: toFirestoreString('(555) 555-3333'),
                  email: toFirestoreString(email),
                  address1: toFirestoreString('200 North St'),
                  address2: toFirestoreString(''),
                  city: toFirestoreString('Austin'),
                  state: toFirestoreString('TX'),
                  zipCode: toFirestoreString('78702'),
                  enrollmentCode: toFirestoreString('ALP78702'),
                  enrollmentCodes: {
                    arrayValue: {
                      values: [toFirestoreString('ALP78702'), toFirestoreString('78702')],
                    },
                  },
                },
              },
            },
          ],
        },
      },
      notes: toFirestoreString('Automated approval-link production probe.'),
      reviewTokenHash: toFirestoreString(tokenHash),
      reviewTokenExpiresAt: toFirestoreTimestamp(Date.now() + (7 * 24 * 60 * 60 * 1000)),
      submittedAt: toFirestoreTimestamp(Date.now()),
      updatedAt: toFirestoreTimestamp(Date.now()),
      applicantEmail: toFirestoreString(email),
    },
  };
}

function extractMapFields(document, key) {
  return document?.fields?.[key]?.mapValue?.fields || {};
}

function extractString(fields, key) {
  return safeString(fields?.[key]?.stringValue).trim();
}

function extractBoolean(fields, key) {
  return typeof fields?.[key]?.booleanValue === 'boolean' ? fields[key].booleanValue : null;
}

async function waitForAuditFields({ docUrl, accessToken, timeoutMs = 30000 }) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    const document = await firestoreRequest(docUrl, accessToken, { method: 'GET' });
    const applicantDecisionEmail = extractMapFields(document, 'applicantDecisionEmail');
    if (Object.keys(applicantDecisionEmail).length) return document;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return firestoreRequest(docUrl, accessToken, { method: 'GET' });
}

async function main() {
  const projectId = safeString(process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'communitybridge-26apr').trim();
  const orgIntakeSecret = safeString(process.env.ORG_INTAKE_SECRET || process.env.CB_ORG_INTAKE_SECRET).trim();
  const publicBaseUrl = safeString(process.env.PUBLIC_BASE_URL || 'https://communitybridge.app').trim().replace(/\/$/, '');
  if (!orgIntakeSecret) throw new Error('ORG_INTAKE_SECRET or CB_ORG_INTAKE_SECRET is required');

  const timestamp = Date.now();
  const submissionId = `probe-${timestamp}`;
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256Hex(`${submissionId}:${token}:${orgIntakeSecret}`);
  const email = `primary-contact-${timestamp}@alphazonelabs.com`;
  const accessToken = getAccessToken();
  const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/organizationIntakeSubmissions/${submissionId}`;

  await firestoreRequest(docUrl, accessToken, {
    method: 'PATCH',
    body: JSON.stringify(buildProbeDocument({ submissionId, tokenHash, email, timestamp })),
  });

  const actionUrl = `${publicBaseUrl}/organizations-intake-action?submission=${encodeURIComponent(submissionId)}&token=${encodeURIComponent(token)}&action=approve`;
  const approvalResponse = await fetch(actionUrl, { redirect: 'manual' });

  const document = await waitForAuditFields({ docUrl, accessToken });
  const applicantDecisionEmail = extractMapFields(document, 'applicantDecisionEmail');
  const primaryContactInvite = extractMapFields(document, 'primaryContactInvite');

  console.log(JSON.stringify({
    submissionId,
    email,
    actionUrl,
    approvalStatus: approvalResponse.status,
    approvalLocation: approvalResponse.headers.get('location') || '',
    applicantDecisionEmail: {
      status: extractString(applicantDecisionEmail, 'status'),
      primaryContactEmailStatus: extractString(applicantDecisionEmail, 'primaryContactEmailStatus'),
      primaryContactIncludedInvite: extractBoolean(applicantDecisionEmail, 'primaryContactIncludedInvite'),
      primaryContactInviteError: extractString(applicantDecisionEmail, 'primaryContactInviteError'),
    },
    primaryContactInvite: {
      status: extractString(primaryContactInvite, 'status'),
      error: extractString(primaryContactInvite, 'error'),
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});