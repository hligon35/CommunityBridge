import * as Api from '../../Api';

export async function resolveSelection({ organizationId, branchId, enrollmentCode, campusId }) {
  const payload = {
    organizationId: String(organizationId || '').trim(),
    branchId: String(branchId || '').trim(),
    campusId: String(campusId || '').trim(),
    enrollmentCode: String(enrollmentCode || '').trim(),
  };

  if (!payload.organizationId) {
    throw new Error('Select an organization.');
  }
  if (!payload.branchId) {
    throw new Error('Select a branch.');
  }
  if (!payload.enrollmentCode) {
    throw new Error('Enter your enrollment code.');
  }

  const result = await Api.resolveEnrollmentContext(payload);
  if (!result?.organization?.id || !result?.branch?.id || !result?.campus?.id) {
    throw new Error('The enrollment code did not match an active campus for the selected branch.');
  }
  return result;
}
