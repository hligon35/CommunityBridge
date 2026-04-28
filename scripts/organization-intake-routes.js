'use strict';

const crypto = require('crypto');

let firebaseAdmin = null;
function getAdmin() {
  if (firebaseAdmin) return firebaseAdmin;
  // eslint-disable-next-line global-require
  firebaseAdmin = require('firebase-admin');
  try {
    if (!firebaseAdmin.apps || !firebaseAdmin.apps.length) {
      const projectId = safeString(
        process.env.CB_FIREBASE_PROJECT_ID ||
        process.env.BB_FIREBASE_PROJECT_ID ||
        process.env.FIREBASE_PROJECT_ID ||
        process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ||
        process.env.GCLOUD_PROJECT ||
        process.env.GCP_PROJECT
      ).trim();
      firebaseAdmin.initializeApp(projectId ? { projectId } : undefined);
    }
  } catch (_) {
    // ignore duplicate initializeApp calls
  }
  return firebaseAdmin;
}

function safeString(value) {
  try {
    if (value == null) return '';
    return String(value);
  } catch (_) {
    return '';
  }
}

function slugify(value) {
  return safeString(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalizeEmail(value) {
  return safeString(value).trim().toLowerCase();
}

function normalizePhone(value) {
  return safeString(value).trim();
}

function normalizeProgramTypeValue(value) {
  const normalized = safeString(value).trim();
  if (normalized === 'earlyInterventionAcademy') return 'earlyInterventionAcademy';
  if (normalized === 'corporate') return 'corporate';
  return 'centerBasedAba';
}

function uniqueBy(items, getKey) {
  const seen = new Set();
  const out = [];
  (items || []).forEach((item) => {
    const key = safeString(getKey(item)).trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(item);
  });
  return out;
}

function htmlEscape(value) {
  return safeString(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderIntakeResultPage({ title, body, accent }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${htmlEscape(title)}</title>
    <style>
      :root { --accent: ${htmlEscape(accent || '#2563eb')}; }
      body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }
      main { max-width: 760px; margin: 64px auto; padding: 0 20px; }
      section { background: #fff; border: 1px solid rgba(15,23,42,0.1); border-radius: 24px; box-shadow: 0 18px 44px rgba(15,23,42,0.06); padding: 28px; }
      h1 { margin: 0 0 12px; font-size: 34px; line-height: 1.1; }
      p { color: #475569; line-height: 1.7; }
      a { color: var(--accent); }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${htmlEscape(title)}</h1>
        ${body}
      </section>
    </main>
  </body>
</html>`;
}

function getPublicBaseUrl(req) {
  const configured = safeString(process.env.CB_PUBLIC_BASE_URL || process.env.BB_PUBLIC_BASE_URL).trim();
  if (configured) return configured.replace(/\/$/, '');
  const proto = safeString(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim() || 'https';
  const host = safeString(req.headers['x-forwarded-host'] || req.headers.host).split(',')[0].trim() || 'communitybridge.app';
  return `${proto}://${host}`.replace(/\/$/, '');
}

function getMfaSecret() {
  const fromEnv = safeString(process.env.CB_MFA_CODE_SECRET || process.env.BB_MFA_CODE_SECRET).trim();
  if (fromEnv) return fromEnv;
  const fromProject = safeString(process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT).trim();
  return fromProject || 'bb_mfa_default_secret';
}

function getOrgIntakeSecret() {
  const fromEnv = safeString(process.env.CB_ORG_INTAKE_SECRET || process.env.BB_ORG_INTAKE_SECRET).trim();
  if (fromEnv) return fromEnv;
  return `${getMfaSecret()}_org_intake`;
}

function getOrgSignupInbox() {
  return safeString(process.env.CB_ORG_SIGNUP_TO || process.env.BB_ORG_SIGNUP_TO || 'org_signup@communitybridge.app').trim();
}

function getRecaptchaSiteKey() {
  return safeString(process.env.CB_RECAPTCHA_SITE_KEY || process.env.BB_RECAPTCHA_SITE_KEY).trim();
}

function getRecaptchaSecretKey() {
  return safeString(process.env.CB_RECAPTCHA_SECRET_KEY || process.env.BB_RECAPTCHA_SECRET_KEY).trim();
}

async function verifyRecaptchaToken({ token, remoteIp }) {
  const secret = getRecaptchaSecretKey();
  if (!secret) {
    const err = new Error('reCAPTCHA is not configured (missing CB_RECAPTCHA_SECRET_KEY/BB_RECAPTCHA_SECRET_KEY).');
    err.code = 'BB_RECAPTCHA_NOT_CONFIGURED';
    throw err;
  }
  const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret,
      response: safeString(token).trim(),
      remoteip: safeString(remoteIp).trim(),
    }),
  });
  const json = await response.json().catch(() => null);
  return { ok: Boolean(response.ok && json && json.success), response: json };
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input || '')).digest('hex');
}

function buildSubmissionToken(submissionId) {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: sha256Hex(`${submissionId}:${token}:${getOrgIntakeSecret()}`) };
}

function verifySubmissionToken({ submissionId, token, tokenHash }) {
  if (!submissionId || !token || !tokenHash) return false;
  return sha256Hex(`${submissionId}:${token}:${getOrgIntakeSecret()}`) === tokenHash;
}

function normalizeIntakeLocation(location, index) {
  const normalizedName = safeString(location?.name).trim();
  const normalizedProgramName = safeString(location?.programName).trim();
  const zipCode = safeString(location?.zipCode).trim();
  const enrollmentCode = safeString(location?.enrollmentCode).trim() || zipCode;
  return {
    id: slugify(`${normalizedName || `location-${index + 1}`}-${enrollmentCode || index + 1}`) || `location-${index + 1}`,
    programName: normalizedProgramName,
    programSlug: slugify(normalizedProgramName) || `program-${index + 1}`,
    programType: normalizeProgramTypeValue(location?.programType),
    name: normalizedName,
    slug: slugify(normalizedName) || `location-${index + 1}`,
    campusType: safeString(location?.campusType).trim() || 'Center',
    phone: normalizePhone(location?.phone),
    email: normalizeEmail(location?.email),
    address1: safeString(location?.address1).trim(),
    address2: safeString(location?.address2).trim(),
    city: safeString(location?.city).trim(),
    state: safeString(location?.state).trim().toUpperCase(),
    zipCode,
    enrollmentCode,
    enrollmentCodes: uniqueBy([enrollmentCode, zipCode].filter(Boolean), (item) => item),
  };
}

function normalizeIntakeSubmission(payload) {
  const organizationName = safeString(payload?.organizationName).trim();
  const organizationShortCode = safeString(payload?.organizationShortCode).trim().toUpperCase();
  const organizationId = slugify(organizationShortCode || organizationName) || 'organization';
  const locations = (Array.isArray(payload?.locations) ? payload.locations : []).map(normalizeIntakeLocation);
  const programs = uniqueBy(locations.map((location) => ({
    id: location.programSlug,
    name: location.programName,
    slug: location.programSlug,
    type: location.programType,
    description: '',
  })), (program) => program.id);
  const locationsWithProgramIds = locations.map((location) => ({
    ...location,
    programId: slugify(location.programName) || location.programSlug,
  }));

  return {
    honeypot: safeString(payload?.website).trim(),
    organization: {
      id: organizationId,
      name: organizationName,
      directoryName: organizationName,
      slug: organizationId,
      shortCode: organizationShortCode,
      phone: normalizePhone(payload?.organizationPhone),
      email: normalizeEmail(payload?.organizationEmail),
      address1: safeString(payload?.organizationAddress1).trim(),
      address2: safeString(payload?.organizationAddress2).trim(),
      city: safeString(payload?.organizationCity).trim(),
      state: safeString(payload?.organizationState).trim().toUpperCase(),
      zipCode: safeString(payload?.organizationZipCode).trim(),
      website: safeString(payload?.organizationWebsite).trim(),
    },
    contact: {
      name: safeString(payload?.contactName).trim(),
      title: safeString(payload?.contactTitle).trim(),
      email: normalizeEmail(payload?.contactEmail),
      phone: normalizePhone(payload?.contactPhone),
    },
    programs,
    locations: locationsWithProgramIds,
    notes: safeString(payload?.notes).trim(),
  };
}

function validateIntakeSubmission(submission) {
  const errors = [];
  if (submission.honeypot) errors.push('Spam check failed.');
  if (!submission?.organization?.id || !submission?.organization?.name) errors.push('Organization name is required.');
  if (!submission?.contact?.name) errors.push('Primary contact name is required.');
  if (!submission?.contact?.email) errors.push('Primary contact email is required.');
  if (!submission?.locations?.length) errors.push('At least one location is required.');
  (submission?.locations || []).forEach((location, index) => {
    if (!location.programName) errors.push(`Location ${index + 1}: program name is required.`);
    if (!location.name) errors.push(`Location ${index + 1}: campus name is required.`);
    if (!location.city || !location.state || !location.zipCode) errors.push(`Location ${index + 1}: city, state, and ZIP are required.`);
    if (!location.enrollmentCode) errors.push(`Location ${index + 1}: enrollment code is required.`);
  });
  return errors;
}

function formatIntakeAddress(item) {
  const line1 = [item?.address1, item?.address2].filter(Boolean).join(', ');
  const line2 = [item?.city, item?.state, item?.zipCode].filter(Boolean).join(', ');
  return [line1, line2].filter(Boolean).join(' | ');
}

function buildIntakeSummaryText(submission) {
  const lines = [];
  const organizationName = submission.organization.directoryName || submission.organization.name;
  lines.push(`Organization: ${organizationName}`);
  if (submission.organization.shortCode) lines.push(`Short code: ${submission.organization.shortCode}`);
  if (submission.organization.website) lines.push(`Website: ${submission.organization.website}`);
  if (submission.organization.email) lines.push(`Organization email: ${submission.organization.email}`);
  if (submission.organization.phone) lines.push(`Organization phone: ${submission.organization.phone}`);
  const organizationAddress = formatIntakeAddress(submission.organization);
  if (organizationAddress) lines.push(`Organization address: ${organizationAddress}`);
  lines.push(`Primary contact: ${submission.contact.name}${submission.contact.title ? ` (${submission.contact.title})` : ''}`);
  lines.push(`Contact email: ${submission.contact.email}`);
  if (submission.contact.phone) lines.push(`Contact phone: ${submission.contact.phone}`);
  lines.push(`Programs requested: ${(submission.programs || []).length}`);
  lines.push(`Locations requested: ${(submission.locations || []).length}`);
  lines.push('');
  lines.push('Requested locations:');
  (submission.locations || []).forEach((location, index) => {
    lines.push(`${index + 1}. ${location.name}`);
    lines.push(`   Program: ${location.programName}`);
    if (location.programType) lines.push(`   Program type: ${location.programType}`);
    lines.push(`   Enrollment code: ${location.enrollmentCode}`);
    if (location.campusType) lines.push(`   Campus type: ${location.campusType}`);
    if (location.phone) lines.push(`   Phone: ${location.phone}`);
    if (location.email) lines.push(`   Email: ${location.email}`);
    const locationAddress = formatIntakeAddress(location);
    if (locationAddress) lines.push(`   Address: ${locationAddress}`);
  });
  if (submission.notes) {
    lines.push('');
    lines.push(`Notes: ${submission.notes}`);
  }
  return lines.join('\n');
}

function buildIntakeLocationHtml(locations) {
  return (locations || []).map((location) => `
    <li style="margin-bottom:12px;">
      <strong>${htmlEscape(location.name)}</strong><br />
      Program: ${htmlEscape(location.programName)}<br />
      ${location.programType ? `Program type: ${htmlEscape(location.programType)}<br />` : ''}
      Enrollment code: ${htmlEscape(location.enrollmentCode)}<br />
      ${location.campusType ? `Campus type: ${htmlEscape(location.campusType)}<br />` : ''}
      ${location.phone ? `Phone: ${htmlEscape(location.phone)}<br />` : ''}
      ${location.email ? `Email: ${htmlEscape(location.email)}<br />` : ''}
      ${htmlEscape(formatIntakeAddress(location))}
    </li>`).join('');
}

function buildIntakeEmailHtml({ submission, approveUrl, rejectUrl }) {
  const locationItems = buildIntakeLocationHtml(submission.locations || []);
  const organizationAddress = formatIntakeAddress(submission.organization);

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.6;">
      <h2 style="margin-bottom:8px;">New organization intake submission</h2>
      <p><strong>Organization:</strong> ${htmlEscape(submission.organization.directoryName || submission.organization.name)}</p>
      ${submission.organization.shortCode ? `<p><strong>Short code:</strong> ${htmlEscape(submission.organization.shortCode)}</p>` : ''}
      ${submission.organization.website ? `<p><strong>Website:</strong> ${htmlEscape(submission.organization.website)}</p>` : ''}
      ${submission.organization.email ? `<p><strong>Organization email:</strong> ${htmlEscape(submission.organization.email)}</p>` : ''}
      ${submission.organization.phone ? `<p><strong>Organization phone:</strong> ${htmlEscape(submission.organization.phone)}</p>` : ''}
      ${organizationAddress ? `<p><strong>Organization address:</strong> ${htmlEscape(organizationAddress)}</p>` : ''}
      <p><strong>Primary contact:</strong> ${htmlEscape(submission.contact.name)}${submission.contact.title ? `, ${htmlEscape(submission.contact.title)}` : ''}</p>
      <p><strong>Contact email:</strong> ${htmlEscape(submission.contact.email)}</p>
      ${submission.contact.phone ? `<p><strong>Contact phone:</strong> ${htmlEscape(submission.contact.phone)}</p>` : ''}
      <p><strong>Programs requested:</strong> ${htmlEscape(String((submission.programs || []).length))}</p>
      <p><strong>Locations requested:</strong> ${htmlEscape(String((submission.locations || []).length))}</p>
      <p><strong>Requested locations:</strong></p>
      <ul>${locationItems}</ul>
      ${submission.notes ? `<p><strong>Notes:</strong> ${htmlEscape(submission.notes)}</p>` : ''}
      <p style="margin-top:24px;">
        <a href="${htmlEscape(approveUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:700;margin-right:10px;">Approve</a>
        <a href="${htmlEscape(rejectUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:700;">Reject</a>
      </p>
    </div>`;
}

function buildApplicantConfirmationEmailHtml({ submission }) {
  const locationItems = buildIntakeLocationHtml(submission.locations || []);

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.6;">
      <h2 style="margin-bottom:8px;">Your CommunityBridge organization intake was received</h2>
      <p>Thanks for submitting <strong>${htmlEscape(submission.organization.directoryName || submission.organization.name)}</strong> for review.</p>
      <p>CommunityBridge operations has received your intake and will review it before activation. When approved, your organization, programs, and campuses will be added directly into the app for enrollment.</p>
      <p><strong>Primary contact:</strong> ${htmlEscape(submission.contact.name)}${submission.contact.title ? `, ${htmlEscape(submission.contact.title)}` : ''}</p>
      <p><strong>Contact email:</strong> ${htmlEscape(submission.contact.email)}</p>
      <p><strong>Locations submitted:</strong></p>
      <ul>${locationItems}</ul>
      ${submission.notes ? `<p><strong>Your notes:</strong> ${htmlEscape(submission.notes)}</p>` : ''}
      <p style="margin-top:24px;">If you need to correct anything before approval, reply to this email and include your organization name.</p>
    </div>`;
}

function buildApplicantConfirmationEmailText({ submission }) {
  return [
    `Your CommunityBridge organization intake was received for ${submission.organization.directoryName || submission.organization.name}.`,
    '',
    'CommunityBridge operations has received your intake and will review it before activation.',
    'When approved, your organization, programs, and campuses will be added directly into the app for enrollment.',
    '',
    buildIntakeSummaryText(submission),
    '',
    'If you need to correct anything before approval, reply to this email and include your organization name.',
  ].join('\n');
}

function getOrganizationIntakeMailer() {
  const smtpUrl = safeString(process.env.CB_SMTP_URL || process.env.BB_SMTP_URL).trim();
  if (!smtpUrl) {
    const err = new Error('Organization intake email is not configured (missing CB_SMTP_URL/BB_SMTP_URL).');
    err.code = 'BB_ORG_INTAKE_EMAIL_NOT_CONFIGURED';
    throw err;
  }

  let nodemailer;
  try {
    // eslint-disable-next-line global-require
    nodemailer = require('nodemailer');
  } catch (_) {
    const err = new Error('Organization intake dependency missing (nodemailer).');
    err.code = 'BB_ORG_INTAKE_EMAIL_DEP_MISSING';
    throw err;
  }

  const from = safeString(process.env.CB_EMAIL_FROM || process.env.BB_EMAIL_FROM || process.env.CB_SMTP_FROM || process.env.BB_SMTP_FROM || 'info@communitybridge.app').trim();
  return { from, transporter: nodemailer.createTransport(smtpUrl) };
}

async function sendOrganizationIntakeEmail({ to, submission, approveUrl, rejectUrl }) {
  const { from, transporter } = getOrganizationIntakeMailer();
  const subject = `Organization intake: ${submission.organization.directoryName || submission.organization.name}`;
  const text = [
    buildIntakeSummaryText(submission),
    '',
    'Approve submission:',
    approveUrl,
    '',
    'Reject submission:',
    rejectUrl,
  ].join('\n');

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html: buildIntakeEmailHtml({ submission, approveUrl, rejectUrl }),
  });
}

async function sendOrganizationIntakeConfirmationEmail({ to, submission }) {
  if (!to) return;
  const { from, transporter } = getOrganizationIntakeMailer();
  const subject = `We received your CommunityBridge intake for ${submission.organization.directoryName || submission.organization.name}`;
  await transporter.sendMail({
    from,
    to,
    subject,
    text: buildApplicantConfirmationEmailText({ submission }),
    html: buildApplicantConfirmationEmailHtml({ submission }),
  });
}

function normalizedEnrollmentCodes(location) {
  return uniqueBy([location.enrollmentCode, location.zipCode].filter(Boolean), (item) => item);
}

async function activateApprovedSubmission(submissionRef, submissionData) {
  const admin = getAdmin();
  const data = submissionData && typeof submissionData === 'object' ? submissionData : {};
  const organization = data.organization && typeof data.organization === 'object' ? data.organization : {};
  const programs = Array.isArray(data.programs) ? data.programs : [];
  const locations = Array.isArray(data.locations) ? data.locations : [];
  const now = admin.firestore.FieldValue.serverTimestamp();
  const orgRef = admin.firestore().collection('organizations').doc(organization.id);
  const batch = admin.firestore().batch();

  batch.set(orgRef, {
    id: organization.id,
    name: organization.name,
    directoryName: organization.directoryName || organization.name,
    slug: organization.slug || organization.id,
    shortCode: organization.shortCode || '',
    phone: organization.phone || '',
    email: organization.email || '',
    address1: organization.address1 || '',
    address2: organization.address2 || '',
    city: organization.city || '',
    state: organization.state || '',
    zipCode: organization.zipCode || '',
    website: organization.website || '',
    active: true,
    sourceSubmissionId: submissionRef.id,
    updatedAt: now,
    approvedAt: now,
  }, { merge: true });

  const campusCountByProgram = {};
  locations.forEach((location) => {
    const key = safeString(location.programId).trim();
    if (!key) return;
    campusCountByProgram[key] = (campusCountByProgram[key] || 0) + 1;
  });

  programs.forEach((program) => {
    const programRef = orgRef.collection('programs').doc(program.id);
    batch.set(programRef, {
      id: program.id,
      organizationId: organization.id,
      name: program.name,
      slug: program.slug || program.id,
      type: program.type || 'centerBasedAba',
      description: program.description || '',
      active: true,
      sourceSubmissionId: submissionRef.id,
      updatedAt: now,
      approvedAt: now,
    }, { merge: true });

    const branchRef = orgRef.collection('branches').doc(program.id);
    batch.set(branchRef, {
      id: program.id,
      organizationId: organization.id,
      name: program.name,
      slug: program.slug || program.id,
      campusCount: Number(campusCountByProgram[program.id] || 0),
      active: true,
      sourceSubmissionId: submissionRef.id,
      updatedAt: now,
      approvedAt: now,
    }, { merge: true });
  });

  locations.forEach((location) => {
    const campusRef = orgRef.collection('campuses').doc(location.id);
    batch.set(campusRef, {
      id: location.id,
      organizationId: organization.id,
      programId: location.programId,
      name: location.name,
      slug: location.slug || location.id,
      phone: location.phone || '',
      email: location.email || '',
      address1: location.address1 || '',
      address2: location.address2 || '',
      city: location.city || '',
      state: location.state || '',
      zipCode: location.zipCode || '',
      enrollmentCode: location.enrollmentCode || '',
      enrollmentCodes: Array.isArray(location.enrollmentCodes) ? location.enrollmentCodes : normalizedEnrollmentCodes(location),
      campusType: location.campusType || 'Center',
      active: true,
      sourceSubmissionId: submissionRef.id,
      updatedAt: now,
      approvedAt: now,
    }, { merge: true });
  });

  batch.set(submissionRef, {
    status: 'approved',
    approvedAt: now,
    updatedAt: now,
    activatedOrganizationId: organization.id,
  }, { merge: true });

  await batch.commit();
}

function registerOrganizationIntakeRoutes(app) {
  if (!app || typeof app.post !== 'function' || typeof app.get !== 'function') {
    throw new Error('registerOrganizationIntakeRoutes requires an Express app');
  }

  app.post('/organizations-intake-submit', async (req, res) => {
    try {
      const admin = getAdmin();
      const submission = normalizeIntakeSubmission(req.body || {});
      const errors = validateIntakeSubmission(submission);
      if (errors.length) return res.status(400).json({ ok: false, errors });
      const forwardedFor = safeString(req.headers['x-forwarded-for']).split(',')[0].trim();
      const recaptcha = await verifyRecaptchaToken({ token: req.body?.recaptchaToken, remoteIp: forwardedFor || null });
      if (!recaptcha.ok) {
        return res.status(400).json({ ok: false, error: 'reCAPTCHA verification failed. Please try again.' });
      }

      const submissionRef = admin.firestore().collection('organizationIntakeSubmissions').doc();
      const { token, tokenHash } = buildSubmissionToken(submissionRef.id);
      const now = admin.firestore.Timestamp.now();
      const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + (7 * 24 * 60 * 60 * 1000));
      const baseUrl = getPublicBaseUrl(req);
      const approveUrl = `${baseUrl}/organizations-intake-action?submission=${encodeURIComponent(submissionRef.id)}&token=${encodeURIComponent(token)}&action=approve`;
      const rejectUrl = `${baseUrl}/organizations-intake-action?submission=${encodeURIComponent(submissionRef.id)}&token=${encodeURIComponent(token)}&action=reject`;

      await submissionRef.set({
        status: 'pending',
        organization: submission.organization,
        contact: submission.contact,
        programs: submission.programs,
        locations: submission.locations,
        notes: submission.notes,
        reviewTokenHash: tokenHash,
        reviewTokenExpiresAt: expiresAt,
        submittedAt: now,
        updatedAt: now,
        submittedFromIp: forwardedFor || null,
        applicantEmail: submission.contact.email,
        recaptchaVerifiedAt: now,
      });

      await sendOrganizationIntakeEmail({
        to: getOrgSignupInbox(),
        submission,
        approveUrl,
        rejectUrl,
      });

      let confirmationEmailStatus = 'skipped';
      let confirmationEmailError = '';
      try {
        await sendOrganizationIntakeConfirmationEmail({
          to: submission.contact.email,
          submission,
        });
        confirmationEmailStatus = 'sent';
      } catch (confirmationError) {
        confirmationEmailStatus = 'failed';
        confirmationEmailError = safeString(confirmationError?.code || confirmationError?.message || 'unknown_error').slice(0, 200);
        console.error('submitOrganizationIntake confirmation email failed', confirmationError);
      }

      try {
        await submissionRef.set({
          applicantConfirmationEmail: {
            status: confirmationEmailStatus,
            email: submission.contact.email || '',
            sentAt: confirmationEmailStatus === 'sent' ? admin.firestore.FieldValue.serverTimestamp() : null,
            failedAt: confirmationEmailStatus === 'failed' ? admin.firestore.FieldValue.serverTimestamp() : null,
            error: confirmationEmailError,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      } catch (auditError) {
        console.error('submitOrganizationIntake confirmation audit update failed', auditError);
      }

      return res.status(200).json({ ok: true, submissionId: submissionRef.id, confirmationEmailStatus });
    } catch (error) {
      console.error('submitOrganizationIntake failed', error);
      return res.status(500).json({ ok: false, error: 'Unable to submit organization intake.' });
    }
  });

  app.get('/organizations-intake-config', async (req, res) => {
    return res.status(200).json({ ok: true, recaptchaSiteKey: getRecaptchaSiteKey() || '' });
  });

  app.get('/organizations-intake-action', async (req, res) => {
    try {
      const admin = getAdmin();
      const submissionId = safeString(req.query?.submission).trim();
      const token = safeString(req.query?.token).trim();
      const action = safeString(req.query?.action).trim().toLowerCase();
      if (!submissionId || !token || (action !== 'approve' && action !== 'reject')) {
        return res.status(400).send(renderIntakeResultPage({
          title: 'Invalid review link',
          body: '<p>This intake review link is incomplete or invalid.</p>',
          accent: '#dc2626',
        }));
      }

      const submissionRef = admin.firestore().collection('organizationIntakeSubmissions').doc(submissionId);
      const snapshot = await submissionRef.get();
      if (!snapshot.exists) {
        return res.status(404).send(renderIntakeResultPage({
          title: 'Submission not found',
          body: '<p>The requested intake submission could not be found.</p>',
          accent: '#dc2626',
        }));
      }

      const data = snapshot.data() || {};
      const expiresAtMs = data.reviewTokenExpiresAt && typeof data.reviewTokenExpiresAt.toMillis === 'function'
        ? data.reviewTokenExpiresAt.toMillis()
        : 0;
      if (!verifySubmissionToken({ submissionId, token, tokenHash: data.reviewTokenHash }) || !expiresAtMs || expiresAtMs < Date.now()) {
        return res.status(400).send(renderIntakeResultPage({
          title: 'Review link expired',
          body: '<p>This intake review link is invalid or has expired.</p>',
          accent: '#dc2626',
        }));
      }

      if (data.status === 'approved') {
        return res.status(200).send(renderIntakeResultPage({
          title: 'Already approved',
          body: `<p>${htmlEscape(data.organization?.directoryName || data.organization?.name || 'This organization')} has already been approved and activated.</p>`,
          accent: '#16a34a',
        }));
      }
      if (data.status === 'rejected') {
        return res.status(200).send(renderIntakeResultPage({
          title: 'Already rejected',
          body: `<p>${htmlEscape(data.organization?.directoryName || data.organization?.name || 'This organization')} was already rejected.</p>`,
          accent: '#dc2626',
        }));
      }

      if (action === 'reject') {
        await submissionRef.set({
          status: 'rejected',
          rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return res.status(200).send(renderIntakeResultPage({
          title: 'Submission rejected',
          body: `<p>${htmlEscape(data.organization?.directoryName || data.organization?.name || 'The organization')} was rejected and will not be activated.</p>`,
          accent: '#dc2626',
        }));
      }

      await activateApprovedSubmission(submissionRef, data);
      return res.status(200).send(renderIntakeResultPage({
        title: 'Organization approved',
        body: `<p>${htmlEscape(data.organization?.directoryName || data.organization?.name || 'The organization')} was approved and activated successfully.</p>`,
        accent: '#16a34a',
      }));
    } catch (error) {
      console.error('organizationIntakeAction failed', error);
      return res.status(500).send(renderIntakeResultPage({
        title: 'Request failed',
        body: '<p>The organization intake action could not be completed.</p>',
        accent: '#dc2626',
      }));
    }
  });
}

module.exports = {
  registerOrganizationIntakeRoutes,
};