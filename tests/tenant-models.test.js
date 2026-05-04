const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeUserRole,
  canAccessAdminWorkspace,
  isStaffRole,
} = require('../src/core/tenant/models');

test('normalizeUserRole canonicalizes mixed-case and label variants for invited staff', () => {
  assert.equal(normalizeUserRole('BCBA'), 'bcba');
  assert.equal(normalizeUserRole('Therapist'), 'therapist');
  assert.equal(normalizeUserRole('ABA Tech'), 'therapist');
  assert.equal(normalizeUserRole('office personnel'), 'office');
  assert.equal(normalizeUserRole('front desk'), 'reception');
  assert.equal(normalizeUserRole('OrgAdmin'), 'orgAdmin');
});

test('workspace access helpers keep BCBA in admin workspace and ABA tech in staff workspace', () => {
  assert.equal(canAccessAdminWorkspace('BCBA'), true);
  assert.equal(isStaffRole('BCBA'), true);
  assert.equal(canAccessAdminWorkspace('ABA Tech'), false);
  assert.equal(isStaffRole('ABA Tech'), true);
});