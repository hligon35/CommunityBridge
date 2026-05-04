const test = require('node:test');
const assert = require('node:assert/strict');

const { __testables } = require('../scripts/organization-intake-routes');

const {
  normalizeIntakeSubmission,
  buildApplicantDecisionEmailHtml,
  buildApplicantDecisionEmailText,
  buildPrimaryContactMembership,
  hasDeliverablePrimaryContactInvite,
} = __testables;

function buildPayload() {
  return {
    organizationName: 'Sunrise Learning Center',
    organizationShortCode: 'slc',
    organizationPhone: '(555) 555-1000',
    organizationEmail: 'hello@sunrise.example',
    organizationAddress1: '100 Main St',
    organizationCity: 'Austin',
    organizationState: 'tx',
    organizationZipCode: '78701',
    contactName: 'Alex Carter',
    contactTitle: 'Executive Director',
    contactEmail: 'alex@sunrise.example',
    contactPhone: '(555) 555-2000',
    locations: [
      {
        programName: 'Early Intervention',
        campusName: 'North Campus',
        campusType: 'Clinic',
        phone: '(555) 555-3000',
        email: 'north@sunrise.example',
        address1: '200 North St',
        city: 'Austin',
        state: 'tx',
        zipCode: '78702',
        enrollmentCode: 'NORTH-101',
      },
    ],
  };
}

test('normalizeIntakeSubmission assigns the primary contact as org admin', () => {
  const submission = normalizeIntakeSubmission(buildPayload());
  assert.equal(submission.contact.role, 'orgAdmin');
  assert.equal(submission.organization.id, 'slc');
});

test('buildPrimaryContactMembership scopes the primary contact to the organization as org admin', () => {
  assert.deepEqual(buildPrimaryContactMembership('org-123', 'orgAdmin'), [
    {
      organizationId: 'org-123',
      programId: '',
      campusId: '',
      role: 'orgAdmin',
    },
  ]);
});

test('approved applicant decision email includes the single-use login details and destination', () => {
  const submission = normalizeIntakeSubmission(buildPayload());
  const invite = {
    email: 'alex@sunrise.example',
    accessCode: '482901',
    approvalLink: 'https://communitybridge.app/login?token=abc123',
    loginUrl: 'https://communitybridge.app/login',
  };

  const text = buildApplicantDecisionEmailText({
    submission,
    decision: 'approved',
    publicBaseUrl: 'https://communitybridge.app',
    primaryContactInvite: invite,
  });
  const html = buildApplicantDecisionEmailHtml({
    submission,
    decision: 'approved',
    publicBaseUrl: 'https://communitybridge.app',
    primaryContactInvite: invite,
  });

  assert.match(text, /Login email \/ username: alex@sunrise\.example/);
  assert.match(text, /One-time access code: 482901/);
  assert.match(text, /Open CommunityBridge: https:\/\/communitybridge\.app\/login\?token=abc123/);
  assert.match(text, /Admin Staff Management/);

  assert.match(html, /Open CommunityBridge/);
  assert.match(html, /One-time access code:<\/strong> 482901/);
  assert.match(html, /Backup login:<\/strong> <a href="https:\/\/communitybridge\.app\/login">/);
});

test('hasDeliverablePrimaryContactInvite requires both access code and approval link', () => {
  assert.equal(hasDeliverablePrimaryContactInvite({ accessCode: '482901', approvalLink: 'https://communitybridge.app/login?token=abc123' }), true);
  assert.equal(hasDeliverablePrimaryContactInvite({ accessCode: '482901', approvalLink: '' }), false);
  assert.equal(hasDeliverablePrimaryContactInvite({ accessCode: '', approvalLink: 'https://communitybridge.app/login?token=abc123' }), false);
  assert.equal(hasDeliverablePrimaryContactInvite(null), false);
});