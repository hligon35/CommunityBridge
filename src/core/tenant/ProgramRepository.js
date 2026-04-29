import * as Api from '../../Api';

export async function listProgramsByOrganization(organizationId) {
  const normalizedId = String(organizationId || '').trim();
  if (!normalizedId) return [];
  try {
    const data = await Api.listPrograms(normalizedId);
    const items = Array.isArray(data?.items) ? data.items : [];
    return items;
  } catch (error) {
    const err = new Error('Program data is temporarily unavailable. Please try again later.');
    err.cause = error;
    throw err;
  }
}
