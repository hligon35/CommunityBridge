import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import * as Api from '../../Api';

export async function getCurrentUserProfile() {
  return Api.me();
}

export async function listUsersByOrganization(organizationId) {
  if (!db) return [];
  const orgId = String(organizationId || '').trim();
  if (!orgId) return [];
  const snap = await getDocs(query(collection(db, 'organizations', orgId, 'users'), limit(100)));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }));
}

export async function listUsersByBranch(organizationId, branchId) {
  const users = await listUsersByOrganization(organizationId);
  const normalizedBranchId = String(branchId || '').trim();
  return users.filter((user) => Array.isArray(user.branchIds) ? user.branchIds.includes(normalizedBranchId) : user.branchId === normalizedBranchId);
}

export async function listUsersByCampus(organizationId, campusId) {
  const users = await listUsersByOrganization(organizationId);
  const normalizedCampusId = String(campusId || '').trim();
  return users.filter((user) => Array.isArray(user.campusIds) ? user.campusIds.includes(normalizedCampusId) : user.campusId === normalizedCampusId);
}
