import * as Api from '../../Api';

export async function listCampusesByOrganization(organizationId, branchId) {
  const data = await Api.listCampuses({
    organizationId: String(organizationId || '').trim(),
    branchId: String(branchId || '').trim(),
  });
  return Array.isArray(data?.items) ? data.items : [];
}
