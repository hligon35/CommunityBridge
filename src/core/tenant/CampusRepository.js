import * as Api from '../../Api';
import { listSeedCampuses } from '../../seed/tenantSeed';

export async function listCampusesByOrganization(organizationId, programId) {
  const organizationKey = String(organizationId || '').trim();
  const programKey = String(programId || '').trim();
  try {
    const data = await Api.listCampuses({
      organizationId: organizationKey,
      programId: programKey,
    });
    const items = Array.isArray(data?.items) ? data.items : [];
    if (items.length) return items;
  } catch (_) {
    // fall back to seeded campus data when remote tenant data is unavailable
  }
  return listSeedCampuses({ organizationId: organizationKey, programId: programKey });
}
