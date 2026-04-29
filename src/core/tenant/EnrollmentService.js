import * as Api from '../../Api';

export async function resolveSelection({ organizationId, programId, enrollmentCode, campusId }) {
  const payload = {
    organizationId: String(organizationId || '').trim(),
    programId: String(programId || '').trim(),
    campusId: String(campusId || '').trim(),
    enrollmentCode: String(enrollmentCode || '').trim(),
  };

  if (!payload.organizationId) {
    throw new Error('Select an organization.');
  }
  if (!payload.programId) {
    throw new Error('Select a program.');
  }
  if (!payload.enrollmentCode) {
    throw new Error('Enter your enrollment code.');
  }

  try {
    const result = await Api.resolveEnrollmentContext(payload);
    if (result?.organization?.id && result?.program?.id && result?.campus?.id) {
      return result;
    }
  } catch (_) {
    // handled below with a consistent user-facing error
  }
  throw new Error('The enrollment code did not match an active campus for the selected organization and program.');
}
