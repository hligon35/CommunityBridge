import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../../firebase';

export async function listStudentsByOrganization(organizationId) {
  if (!db) return [];
  const orgId = String(organizationId || '').trim();
  if (!orgId) return [];
  const snap = await getDocs(query(collection(db, 'organizations', orgId, 'students'), limit(100)));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }));
}

export async function listStudentsByBranch(organizationId, branchId) {
  if (!db) return [];
  const orgId = String(organizationId || '').trim();
  const normalizedBranchId = String(branchId || '').trim();
  if (!orgId || !normalizedBranchId) return [];
  const snap = await getDocs(query(
    collection(db, 'organizations', orgId, 'students'),
    where('branchId', '==', normalizedBranchId),
    limit(100)
  ));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }));
}

export async function listStudentsByCampus(organizationId, campusId) {
  if (!db) return [];
  const orgId = String(organizationId || '').trim();
  const normalizedCampusId = String(campusId || '').trim();
  if (!orgId || !normalizedCampusId) return [];
  const snap = await getDocs(query(
    collection(db, 'organizations', orgId, 'students'),
    where('campusId', '==', normalizedCampusId),
    limit(100)
  ));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }));
}
