'use strict';

function safeString(value) {
  try {
    if (value == null) return '';
    return String(value).trim();
  } catch (_) {
    return '';
  }
}

function normalizeRole(role) {
  return safeString(role).toLowerCase();
}

function normalizeIds(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => safeString(value))
    .filter(Boolean)));
}

function isAdminRole(role) {
  const value = normalizeRole(role);
  return value === 'admin'
    || value === 'administrator'
    || value === 'campusadmin'
    || value === 'campus_admin'
    || value === 'orgadmin'
    || value === 'org_admin'
    || value === 'organizationadmin'
    || value === 'superadmin'
    || value === 'super_admin';
}

function isSuperAdminRole(role) {
  const value = normalizeRole(role);
  return value === 'superadmin' || value === 'super_admin';
}

function normalizeScopedUser(user) {
  const item = user && typeof user === 'object' ? user : {};
  return {
    ...item,
    role: normalizeRole(item.role),
    organizationId: safeString(item.organizationId),
    programIds: normalizeIds(item.programIds || item.branchIds),
    campusIds: normalizeIds(item.campusIds),
  };
}

function hasCampusOverlap(actor, target) {
  const actorCampusIds = normalizeIds(actor.campusIds);
  const targetCampusIds = normalizeIds(target.campusIds);
  if (!actorCampusIds.length || !targetCampusIds.length) return false;
  return actorCampusIds.some((campusId) => targetCampusIds.includes(campusId));
}

function canManageTargetUser(actorInput, targetInput) {
  const actor = normalizeScopedUser(actorInput);
  const target = normalizeScopedUser(targetInput);

  if (!isAdminRole(actor.role)) return false;
  if (isSuperAdminRole(actor.role)) return true;
  if (isAdminRole(target.role)) return false;

  if (actor.role === 'admin' || actor.role === 'administrator') return true;

  if (actor.role === 'orgadmin' || actor.role === 'org_admin' || actor.role === 'organizationadmin') {
    return Boolean(actor.organizationId) && actor.organizationId === target.organizationId;
  }

  if (actor.role === 'campusadmin' || actor.role === 'campus_admin') {
    if (!actor.organizationId || actor.organizationId !== target.organizationId) return false;
    return hasCampusOverlap(actor, target);
  }

  return false;
}

function filterManageableUsers(actor, users) {
  return (Array.isArray(users) ? users : []).filter((user) => canManageTargetUser(actor, user));
}

module.exports = {
  normalizeScopedUser,
  canManageTargetUser,
  filterManageableUsers,
};
