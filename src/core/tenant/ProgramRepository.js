import * as Api from '../../Api';
import { listSeedProgramsByOrganization } from '../../seed/tenantSeed';

export async function listProgramsByOrganization(organizationId) {
  const normalizedId = String(organizationId || '').trim();
  if (!normalizedId) return [];
  try {
    const data = await Api.listPrograms(normalizedId);
    const items = Array.isArray(data?.items) ? data.items : [];
    if (items.length) return items;
  } catch (_) {
    // fall back to seeded program data when callables or Firestore data are unavailable
  }
  return listSeedProgramsByOrganization(normalizedId);
}
