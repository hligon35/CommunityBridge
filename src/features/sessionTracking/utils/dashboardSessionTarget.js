function normalizeId(value) {
  return value != null ? String(value).trim().toLowerCase() : '';
}

function isChildLinkedToTherapist(child, therapistId) {
  const normalizedTherapistId = normalizeId(therapistId);
  if (!normalizedTherapistId || !child || typeof child !== 'object') return false;

  const directAssignments = [child.amTherapist, child.pmTherapist, child.bcaTherapist];
  const matchesDirectAssignment = directAssignments.some((entry) => {
    if (!entry) return false;
    if (typeof entry === 'string') return normalizeId(entry) === normalizedTherapistId;
    return normalizeId(entry.id) === normalizedTherapistId;
  });
  if (matchesDirectAssignment) return true;

  const listAssignments = []
    .concat(Array.isArray(child.staffIds) ? child.staffIds : [])
    .concat(Array.isArray(child.assignedABA) ? child.assignedABA : [])
    .concat(Array.isArray(child.assigned_ABA) ? child.assigned_ABA : [])
    .concat(Array.isArray(child.assigned) ? child.assigned : []);

  return listAssignments.some((entry) => normalizeId(entry) === normalizedTherapistId);
}

function resolveSelectedDashboardChild(relevantChildren, selectedChildId) {
  const items = Array.isArray(relevantChildren) ? relevantChildren : [];
  if (!items.length) return null;
  return items.find((child) => child && child.id === selectedChildId) || items[0] || null;
}

function resolveTherapyWorkspaceTarget(sessionAction, childId, preview = false) {
  const routeName = sessionAction === 'summary' ? 'SummaryReview' : 'TapTracker';
  const params = {};
  if (childId) {
    params.childId = childId;
  } else if (preview) {
    params.sessionPreview = true;
  }
  return { routeName, params };
}

module.exports = {
  isChildLinkedToTherapist,
  resolveSelectedDashboardChild,
  resolveTherapyWorkspaceTarget,
};
