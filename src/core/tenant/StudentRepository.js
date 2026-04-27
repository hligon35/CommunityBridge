import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../../firebase';

export async function listStudentsByOrganization(organizationId) {
  if (!db) return [];
  const orgId = String(organizationId || '').trim();
  if (!orgId) return [];
  const snap = await getDocs(query(collection(db, 'organizations', orgId, 'students'), limit(100)));
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }));
}

export async function listStudentsByProgram(organizationId, programId) {
  if (!db) return [];
  const orgId = String(organizationId || '').trim();
  const normalizedProgramId = String(programId || '').trim();
  if (!orgId || !normalizedProgramId) return [];
  const snap = await getDocs(query(
    collection(db, 'organizations', orgId, 'students'),
    where('programId', '==', normalizedProgramId),
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

export async function listStudentsByBranch(organizationId, branchId) {
  return listStudentsByProgram(organizationId, branchId);
}
