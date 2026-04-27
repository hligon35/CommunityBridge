#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const DRY = process.argv.includes('--dry') || process.argv.includes('-n');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key]) continue;
    process.env[key] = match[2];
  }
}

loadEnvFile(path.join(process.cwd(), '.env'));
loadEnvFile(path.join(process.cwd(), 'env', 'cloudrun.env'));

function getArgValue(flagName) {
  const index = process.argv.indexOf(flagName);
  if (index === -1) return '';
  return String(process.argv[index + 1] || '').trim();
}

function getProjectId() {
  return (
    process.env.CB_FIREBASE_PROJECT_ID ||
    process.env.BB_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT ||
    'communitybridge-26apr'
  ).trim();
}

function getSeedFilePath() {
  const explicit = getArgValue('--seed-file') || process.env.BB_TENANT_SEED_FILE || process.env.CB_TENANT_SEED_FILE;
  if (explicit) return path.resolve(process.cwd(), explicit);
  return path.join(process.cwd(), 'src', 'seed', 'tenantDirectory.seed.json');
}

function loadSeedData() {
  const filePath = getSeedFilePath();
  if (!fs.existsSync(filePath)) {
    throw new Error(`Seed file not found: ${filePath}`);
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const organizations = Array.isArray(data?.organizations) ? data.organizations : [];
  const programs = Array.isArray(data?.programs) ? data.programs : [];
  const campuses = Array.isArray(data?.campuses) ? data.campuses : [];
  return { filePath, organizations, programs, campuses };
}

function normalizeId(value) {
  return String(value || '').trim();
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function assertSeedIntegrity(seed) {
  const organizationsById = new Map();
  seed.organizations.forEach((organization) => {
    const id = normalizeId(organization.id);
    if (!id) throw new Error('Every seeded organization must have an id.');
    organizationsById.set(id, organization);
  });

  const programsByKey = new Map();
  seed.programs.forEach((program) => {
    const id = normalizeId(program.id);
    const organizationId = normalizeId(program.organizationId);
    if (!id || !organizationId) throw new Error('Every seeded program must have id and organizationId.');
    if (!organizationsById.has(organizationId)) {
      throw new Error(`Program ${id} references missing organization ${organizationId}.`);
    }
    programsByKey.set(`${organizationId}:${id}`, program);
  });

  seed.campuses.forEach((campus) => {
    const id = normalizeId(campus.id);
    const organizationId = normalizeId(campus.organizationId);
    const programId = normalizeId(campus.programId);
    const zipCode = normalizeId(campus.zipCode);
    const enrollmentCode = normalizeId(campus.enrollmentCode || campus.zipCode);
    if (!id || !organizationId || !programId) {
      throw new Error('Every seeded campus must have id, organizationId, and programId.');
    }
    if (!programsByKey.has(`${organizationId}:${programId}`)) {
      throw new Error(`Campus ${id} references missing program ${organizationId}/${programId}.`);
    }
    if (!zipCode || !enrollmentCode) {
      throw new Error(`Campus ${id} must define both zipCode and enrollmentCode.`);
    }
  });
}

function initFirebaseAdmin() {
  if (admin.apps && admin.apps.length) return admin.app();
  const projectId = getProjectId();
  return admin.initializeApp(projectId ? { projectId } : undefined);
}

async function upsertOrganization(firestore, organization, programCount, campusCount) {
  const organizationId = normalizeId(organization.id);
  const payload = {
    ...organization,
    id: organizationId,
    shortCode: String(organization.shortCode || '').trim(),
    programCount,
    campusCount,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (DRY) {
    console.log(`[tenant-seed][dry] organization ${organizationId}`);
    return;
  }
  await firestore.collection('organizations').doc(organizationId).set(payload, { merge: true });
}

async function upsertProgram(firestore, program, campusCount) {
  const organizationId = normalizeId(program.organizationId);
  const programId = normalizeId(program.id);
  const payload = {
    ...program,
    id: programId,
    organizationId,
    campusCount,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (DRY) {
    console.log(`[tenant-seed][dry] program ${organizationId}/${programId}`);
    return;
  }
  await firestore.collection('organizations').doc(organizationId).collection('programs').doc(programId).set(payload, { merge: true });
}

async function upsertCampus(firestore, campus) {
  const organizationId = normalizeId(campus.organizationId);
  const programId = normalizeId(campus.programId);
  const campusId = normalizeId(campus.id);
  const zipCode = String(campus.zipCode || '').trim();
  const enrollmentCode = String(campus.enrollmentCode || campus.zipCode || '').trim();
  const payload = {
    ...campus,
    id: campusId,
    organizationId,
    programId,
    zipCode,
    enrollmentCode,
    enrollmentCodes: Array.from(new Set([normalizeCode(enrollmentCode)])),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (DRY) {
    console.log(`[tenant-seed][dry] campus ${organizationId}/${programId}/${campusId} enrollmentCode=${enrollmentCode}`);
    return;
  }
  await firestore.collection('organizations').doc(organizationId).collection('campuses').doc(campusId).set(payload, { merge: true });
}

async function main() {
  const seed = loadSeedData();
  assertSeedIntegrity(seed);
  console.log(`[tenant-seed] mode=${DRY ? 'DRY RUN' : 'WRITE'} file=${seed.filePath}`);
  console.log(`[tenant-seed] organizations=${seed.organizations.length} programs=${seed.programs.length} campuses=${seed.campuses.length}`);

  if (DRY) {
    seed.organizations.forEach((organization) => {
      console.log(`[tenant-seed][dry] would seed organization ${organization.id}`);
    });
    seed.programs.forEach((program) => {
      console.log(`[tenant-seed][dry] would seed program ${program.organizationId}/${program.id}`);
    });
    seed.campuses.forEach((campus) => {
      console.log(`[tenant-seed][dry] would seed campus ${campus.organizationId}/${campus.programId}/${campus.id} zip=${campus.zipCode} enrollmentCode=${campus.enrollmentCode}`);
    });
    return;
  }

  initFirebaseAdmin();
  const firestore = admin.firestore();

  for (const organization of seed.organizations) {
    const organizationId = normalizeId(organization.id);
    const organizationPrograms = seed.programs.filter((program) => normalizeId(program.organizationId) === organizationId);
    const organizationCampuses = seed.campuses.filter((campus) => normalizeId(campus.organizationId) === organizationId);
    await upsertOrganization(firestore, organization, organizationPrograms.length, organizationCampuses.length);
  }

  for (const program of seed.programs) {
    const campusCount = seed.campuses.filter((campus) => normalizeId(campus.organizationId) === normalizeId(program.organizationId) && normalizeId(campus.programId) === normalizeId(program.id)).length;
    await upsertProgram(firestore, program, campusCount);
  }

  for (const campus of seed.campuses) {
    await upsertCampus(firestore, campus);
  }

  console.log('[tenant-seed] done.');
}

main().catch((error) => {
  console.error('[tenant-seed] fatal:', error && error.message ? error.message : error);
  process.exit(1);
});