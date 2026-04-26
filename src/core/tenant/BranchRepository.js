import * as Api from '../../Api';

export async function listBranchesByOrganization(organizationId) {
  const data = await Api.listBranches(String(organizationId || '').trim());
  return Array.isArray(data?.items) ? data.items : [];
}
