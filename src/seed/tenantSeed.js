import seedData from './tenantDirectory.seed.json';

function clone(item) {
  return { ...item };
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

export const SEED_ORGANIZATIONS = Object.freeze(
  (Array.isArray(seedData?.organizations) ? seedData.organizations : []).map(clone)
);

export const SEED_PROGRAMS = Object.freeze(
  (Array.isArray(seedData?.programs) ? seedData.programs : []).map(clone)
);

export const SEED_CAMPUSES = Object.freeze(
  (Array.isArray(seedData?.campuses) ? seedData.campuses : []).map((campus) => ({
    ...campus,
    zipCode: String(campus?.zipCode || '').trim(),
    enrollmentCode: String(campus?.enrollmentCode || campus?.zipCode || '').trim(),
  }))
);

export function listSeedOrganizations() {
  return SEED_ORGANIZATIONS.filter((item) => item.active !== false).map(clone);
}

export function listSeedProgramsByOrganization(organizationId) {
  const id = String(organizationId || '').trim();
  return SEED_PROGRAMS
    .filter((item) => item.organizationId === id && item.active !== false)
    .map(clone);
}

export function listSeedCampuses({ organizationId, programId }) {
  const orgId = String(organizationId || '').trim();
  const nextProgramId = String(programId || '').trim();
  return SEED_CAMPUSES
    .filter((item) => item.organizationId === orgId && item.active !== false)
    .filter((item) => !nextProgramId || item.programId === nextProgramId)
    .map(clone);
}

export function resolveSeedEnrollmentContext({ organizationId, programId, campusId, enrollmentCode }) {
  const orgId = String(organizationId || '').trim();
  const nextProgramId = String(programId || '').trim();
  const nextCampusId = String(campusId || '').trim();
  const code = normalizeCode(enrollmentCode);

  const organization = SEED_ORGANIZATIONS.find((item) => item.id === orgId && item.active !== false) || null;
  const program = SEED_PROGRAMS.find((item) => item.organizationId === orgId && item.id === nextProgramId && item.active !== false) || null;
  if (!organization || !program || !code) return null;

  const campuses = listSeedCampuses({ organizationId: orgId, programId: nextProgramId });
  const matchedCampus = nextCampusId
    ? campuses.find((item) => item.id === nextCampusId && normalizeCode(item.enrollmentCode) === code)
    : campuses.find((item) => normalizeCode(item.enrollmentCode) === code);

  if (!matchedCampus) return null;
  return {
    organization: clone(organization),
    program: clone(program),
    campus: clone(matchedCampus),
  };
}
