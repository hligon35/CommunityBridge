import * as Api from '../../Api';
import { listSeedOrganizations } from '../../seed/tenantSeed';

export async function listActiveOrganizations() {
  try {
    const data = await Api.listOrganizations();
    const items = Array.isArray(data?.items) ? data.items : [];
    if (items.length) return items;
  } catch (_) {
    // fall back to seeded org data when remote tenant data is unavailable
  }
  return listSeedOrganizations();
}

export async function getOrganizationById(organizationId) {
  const organizations = await listActiveOrganizations();
  return organizations.find((organization) => organization.id === String(organizationId || '').trim()) || null;
}
