import * as Api from '../../Api';

export async function listActiveOrganizations() {
  const data = await Api.listOrganizations();
  return Array.isArray(data?.items) ? data.items : [];
}

export async function getOrganizationById(organizationId) {
  const organizations = await listActiveOrganizations();
  return organizations.find((organization) => organization.id === String(organizationId || '').trim()) || null;
}
