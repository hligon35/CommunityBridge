import * as Api from '../../Api';

export async function listActiveOrganizations() {
  try {
    const data = await Api.listOrganizations();
    const items = Array.isArray(data?.items) ? data.items : [];
    return items;
  } catch (error) {
    const err = new Error('Organization data is temporarily unavailable. Please try again later.');
    err.cause = error;
    throw err;
  }
}

export async function getOrganizationById(organizationId) {
  const organizations = await listActiveOrganizations();
  return organizations.find((organization) => organization.id === String(organizationId || '').trim()) || null;
}
