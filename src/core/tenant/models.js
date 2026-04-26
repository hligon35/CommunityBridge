export const USER_ROLES = Object.freeze({
  PARENT: 'parent',
  FACULTY: 'faculty',
  THERAPIST: 'therapist',
  BCBA: 'bcba',
  CAMPUS_ADMIN: 'campusAdmin',
  ORG_ADMIN: 'orgAdmin',
  SUPER_ADMIN: 'superAdmin',
  ADMIN: 'admin',
});

function safeString(value) {
  try {
    if (value == null) return '';
    return String(value).trim();
  } catch (_) {
    return '';
  }
}

export function normalizeUserRole(role) {
  const value = safeString(role).toLowerCase();
  if (!value) return USER_ROLES.PARENT;
  if (value === 'administrator') return USER_ROLES.ADMIN;
  if (value === 'campusadmin' || value === 'campus_admin') return USER_ROLES.CAMPUS_ADMIN;
  if (value === 'orgadmin' || value === 'org_admin' || value === 'organizationadmin') return USER_ROLES.ORG_ADMIN;
  if (value === 'superadmin' || value === 'super_admin') return USER_ROLES.SUPER_ADMIN;
  if (value === 'teacher' || value === 'staff') return USER_ROLES.FACULTY;
  return safeString(role) || USER_ROLES.PARENT;
}

export function isAdminRole(role) {
  const value = normalizeUserRole(role);
  return value === USER_ROLES.ADMIN || value === USER_ROLES.CAMPUS_ADMIN || value === USER_ROLES.ORG_ADMIN || value === USER_ROLES.SUPER_ADMIN;
}

export function isStaffRole(role) {
  const value = normalizeUserRole(role);
  return value === USER_ROLES.FACULTY || value === USER_ROLES.THERAPIST || value === USER_ROLES.BCBA;
}

export function uniqueIds(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => safeString(value))
    .filter(Boolean)));
}

export function normalizeMemberships(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => {
      if (!value || typeof value !== 'object') return null;
      const organizationId = safeString(value.organizationId);
      const branchId = safeString(value.branchId);
      const campusId = safeString(value.campusId);
      if (!organizationId) return null;
      return {
        organizationId,
        branchId,
        campusId,
        role: normalizeUserRole(value.role),
      };
    })
    .filter(Boolean);
}

export function buildTenantProfile(profile) {
  const memberships = normalizeMemberships(profile?.memberships);
  const fallbackMembership = profile?.organizationId ? [{
    organizationId: safeString(profile.organizationId),
    branchId: safeString(profile.branchId || profile?.tenant?.branchId),
    campusId: safeString(profile.campusId || profile?.tenant?.campusId),
    role: normalizeUserRole(profile?.role),
  }] : [];
  const resolvedMemberships = memberships.length ? memberships : fallbackMembership;
  const branchIds = uniqueIds([
    ...(Array.isArray(profile?.branchIds) ? profile.branchIds : []),
    ...resolvedMemberships.map((membership) => membership.branchId),
  ]);
  const campusIds = uniqueIds([
    ...(Array.isArray(profile?.campusIds) ? profile.campusIds : []),
    ...resolvedMemberships.map((membership) => membership.campusId),
  ]);
  return {
    organizationId: safeString(profile?.organizationId || profile?.tenant?.organizationId),
    branchIds,
    campusIds,
    memberships: resolvedMemberships,
    role: normalizeUserRole(profile?.role),
  };
}
