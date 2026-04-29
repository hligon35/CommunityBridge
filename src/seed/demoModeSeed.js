const raw = require('../../dummy_app_data.json');

function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

function normalizeIso(value, fallback) {
  const input = value || fallback;
  const date = new Date(String(input || ''));
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function buildAvatar(seed, supplied, size) {
  const value = String(supplied || '').trim();
  if (value) return value;
  return `https://i.pravatar.cc/${size}?u=${encodeURIComponent(String(seed || 'demo'))}`;
}

function normalizeRoleName(role, fallback) {
  const value = String(role || fallback || '').trim();
  return value || fallback || '';
}

const parentsRaw = Array.isArray(raw?.parents) ? raw.parents : [];
const therapistsRaw = Array.isArray(raw?.therapists) ? raw.therapists : [];
const childrenRaw = Array.isArray(raw?.children) ? raw.children : [];
const staffRaw = Array.isArray(raw?.staff) ? raw.staff : [];
const progressReportsRaw = Array.isArray(raw?.progressReports) ? raw.progressReports : [];
const nextSessionsRaw = Array.isArray(raw?.nextSessions) ? raw.nextSessions : [];
const moodScoresRaw = Array.isArray(raw?.moodScores) ? raw.moodScores : [];

const seededParents = parentsRaw.map((parent) => {
  const { firstName, lastName } = splitName(parent?.name);
  return {
    id: String(parent?.id || ''),
    firstName,
    lastName,
    name: String(parent?.name || '').trim(),
    role: 'parent',
    phone: parent?.phone || '',
    email: parent?.email || '',
    avatar: buildAvatar(parent?.id, parent?.avatar, 100),
  };
});

const seededTherapists = therapistsRaw.map((therapist) => {
  const { firstName, lastName } = splitName(therapist?.name);
  const normalizedRole = normalizeRoleName(therapist?.role, 'therapist');
  return {
    id: String(therapist?.id || ''),
    firstName,
    lastName,
    name: String(therapist?.name || '').trim(),
    role: normalizedRole,
    phone: therapist?.phone || '',
    email: therapist?.email || '',
    avatar: buildAvatar(therapist?.id, therapist?.avatar, 80),
    supervisedBy: therapist?.supervisedBy || '',
  };
});

const staffDirectoryEntries = staffRaw.map((staff) => {
  const { firstName, lastName } = splitName(staff?.name);
  return {
    id: String(staff?.id || ''),
    firstName,
    lastName,
    name: String(staff?.name || '').trim(),
    role: normalizeRoleName(staff?.role, 'staff'),
    email: staff?.email || '',
    phone: staff?.phone || '',
    avatar: buildAvatar(staff?.id, staff?.avatar, 80),
  };
});

const parentById = new Map(seededParents.map((parent) => [parent.id, parent]));
const therapistById = new Map(seededTherapists.map((therapist) => [therapist.id, therapist]));
const staffById = new Map(staffDirectoryEntries.map((staff) => [staff.id, staff]));

const latestProgressByChildId = new Map();
progressReportsRaw.forEach((report) => {
  const childId = String(report?.childId || '').trim();
  if (!childId) return;
  const current = latestProgressByChildId.get(childId);
  const currentTs = Date.parse(String(current?.date || ''));
  const reportTs = Date.parse(String(report?.date || ''));
  if (!current || (Number.isFinite(reportTs) && (!Number.isFinite(currentTs) || reportTs >= currentTs))) {
    latestProgressByChildId.set(childId, report);
  }
});

const latestMoodByChildId = new Map();
moodScoresRaw.forEach((entry) => {
  const childId = String(entry?.childId || '').trim();
  const scores = Array.isArray(entry?.scores) ? entry.scores : [];
  const latestScore = scores.reduce((best, score) => {
    const scoreTs = Date.parse(String(score?.date || ''));
    const bestTs = Date.parse(String(best?.date || ''));
    if (!best) return score;
    if (Number.isFinite(scoreTs) && (!Number.isFinite(bestTs) || scoreTs >= bestTs)) return score;
    return best;
  }, null);
  if (childId && latestScore) latestMoodByChildId.set(childId, latestScore);
});

const nextSessionByChildId = new Map();
nextSessionsRaw.forEach((session) => {
  const childId = String(session?.childId || '').trim();
  if (!childId) return;
  const iso = normalizeIso(`${session?.date || ''}T${session?.time || '00:00'}:00`, session?.date);
  const current = nextSessionByChildId.get(childId);
  const currentTs = Date.parse(String(current?.whenISO || ''));
  const sessionTs = Date.parse(iso);
  if (!current || (Number.isFinite(sessionTs) && (!Number.isFinite(currentTs) || sessionTs <= currentTs))) {
    nextSessionByChildId.set(childId, {
      id: String(session?.id || `${childId}-session`),
      whenISO: iso,
      title: 'Next Session',
      therapistId: session?.therapistId ? String(session.therapistId) : '',
      time: session?.time || '',
      date: session?.date || '',
    });
  }
});

const seededChildrenWithParents = childrenRaw.map((child) => {
  const { firstName, lastName } = splitName(child?.name);
  const parents = (Array.isArray(child?.parents) ? child.parents : []).map((entry) => {
    const parent = parentById.get(String(entry?.id || ''));
    if (!parent) {
      return {
        id: String(entry?.id || ''),
        name: String(entry?.name || '').trim(),
        avatar: buildAvatar(entry?.id || entry?.name, entry?.avatar, 100),
        phone: entry?.phone || '',
        email: entry?.email || '',
      };
    }
    return {
      id: parent.id,
      name: parent.name,
      firstName: parent.firstName,
      lastName: parent.lastName,
      avatar: parent.avatar,
      phone: parent.phone,
      email: parent.email,
    };
  });
  const latestProgress = latestProgressByChildId.get(String(child?.id || ''));
  const latestMood = latestMoodByChildId.get(String(child?.id || ''));
  const nextSession = nextSessionByChildId.get(String(child?.id || ''));
  return {
    id: String(child?.id || ''),
    firstName,
    lastName,
    name: String(child?.name || '').trim(),
    age: String(child?.age || '').trim(),
    room: String(child?.room || '').trim(),
    avatar: buildAvatar(child?.id, child?.avatar, 120),
    parents,
    assignedABA: Array.isArray(child?.assignedABA) ? child.assignedABA.map((id) => String(id)) : [],
    session: child?.session || '',
    notes: String(child?.notes || latestProgress?.summary || '').trim(),
    carePlan: String(child?.notes || latestProgress?.summary || '').trim(),
    goalProgress: String(latestProgress?.summary || '').trim(),
    monthlyGoal: String(latestProgress?.summary || child?.notes || '').trim(),
    programCurriculum: String(latestProgress?.summary || '').trim(),
    behaviorNotes: String(child?.notes || latestProgress?.summary || '').trim(),
    moodScore: latestMood?.score != null ? Number(latestMood.score) : null,
    mood: latestMood?.score != null ? Number(latestMood.score) : null,
    nextSessionISO: nextSession?.whenISO || null,
    upcoming: nextSession ? [nextSession] : [],
  };
});

const directoryPeopleById = new Map();
seededParents.forEach((parent) => {
  directoryPeopleById.set(parent.id, parent);
});
seededTherapists.forEach((therapist) => {
  directoryPeopleById.set(therapist.id, therapist);
});
staffDirectoryEntries.forEach((staff) => {
  directoryPeopleById.set(staff.id, staff);
});

const adminIdentity = staffDirectoryEntries.find((entry) => String(entry?.role || '').toLowerCase().includes('admin')) || staffDirectoryEntries[0] || { id: 'staff-001', name: 'Linda Carter', email: '' };
const therapistIdentity = seededTherapists.find((entry) => String(entry?.id || '').toLowerCase() === 'aba-101') || seededTherapists[0] || { id: 'aba-101', name: 'Jordan Ellis', email: '' };
const parentIdentity = seededParents.find((entry) => String(entry?.id || '').toLowerCase() === 'par-001') || seededParents[0] || { id: 'par-001', name: 'Alicia Cook', email: '' };

const demoPersonaSourceIds = Object.freeze({
  admin: adminIdentity.id,
  therapist: therapistIdentity.id,
  parent: parentIdentity.id,
});

const seededDemoRoleIdentities = Object.freeze({
  admin: { id: 'admin-demo', name: 'Jordan Admin', email: 'admin-demo@communitybridge.app', role: 'admin' },
  therapist: { id: 'ABA-001', name: 'Daniel Lopez', email: 'daniel.lopez@communitybridge.app', role: 'therapist' },
  parent: { id: 'PT-001', name: 'Carlos Garcia', email: 'carlos.garcia@communitybridge.app', role: 'parent' },
});

function toParticipant(id) {
  const key = String(id || '').trim();
  const entity = directoryPeopleById.get(key);
  if (key && key === demoPersonaSourceIds.admin) {
    return {
      ...seededDemoRoleIdentities.admin,
      name: entity?.name || seededDemoRoleIdentities.admin.name,
      email: entity?.email || seededDemoRoleIdentities.admin.email,
      avatar: entity?.avatar || null,
    };
  }
  if (key && key === demoPersonaSourceIds.therapist) {
    return {
      ...seededDemoRoleIdentities.therapist,
      name: entity?.name || seededDemoRoleIdentities.therapist.name,
      email: entity?.email || seededDemoRoleIdentities.therapist.email,
      avatar: entity?.avatar || null,
    };
  }
  if (key && key === demoPersonaSourceIds.parent) {
    return {
      ...seededDemoRoleIdentities.parent,
      name: entity?.name || seededDemoRoleIdentities.parent.name,
      email: entity?.email || seededDemoRoleIdentities.parent.email,
      avatar: entity?.avatar || null,
    };
  }
  if (entity) {
    return {
      id: entity.id,
      name: entity.name || `${entity.firstName || ''} ${entity.lastName || ''}`.trim(),
      email: entity.email || '',
      role: entity.role || '',
      avatar: entity.avatar || null,
    };
  }
  return { id: key, name: key, email: '', role: '', avatar: null };
}

const seededDemoMessages = Object.values(raw?.messageThreads || {}).flatMap((threads) => {
  if (!Array.isArray(threads)) return [];
  return threads.flatMap((thread) => {
    const participants = Array.isArray(thread?.participants) ? thread.participants.map((id) => String(id)) : [];
    const messages = Array.isArray(thread?.messages) ? thread.messages : [];
    return messages.map((message, index) => {
      const senderId = String(message?.from || '').trim();
      return {
        id: `${thread?.threadId || 'thread'}-${index + 1}`,
        threadId: String(thread?.threadId || `thread-${index + 1}`),
        body: String(message?.text || '').trim(),
        sender: toParticipant(senderId),
        to: participants.filter((participantId) => participantId !== senderId).map((participantId) => toParticipant(participantId)),
        createdAt: normalizeIso(message?.time, new Date().toISOString()),
      };
    });
  });
});

const seededDemoUrgentMemos = (Array.isArray(raw?.urgentMemos) ? raw.urgentMemos : []).map((memo) => ({
  id: String(memo?.id || ''),
  type: 'admin_memo',
  subject: String(memo?.title || '').trim(),
  body: String(memo?.message || '').trim(),
  priority: String(memo?.priority || 'urgent').trim(),
  recipients: [...seededParents, ...seededTherapists].map((entry) => ({ id: entry.id, name: entry.name })),
  proposerId: staffDirectoryEntries[0]?.id || 'staff-001',
  status: 'pending',
  createdAt: normalizeIso(memo?.time, new Date().toISOString()),
}));

const seededDemoPosts = progressReportsRaw.map((report) => {
  const child = seededChildrenWithParents.find((entry) => entry.id === String(report?.childId || ''));
  const therapist = toParticipant(report?.therapistId);
  return {
    id: String(report?.id || `${report?.childId || 'child'}-progress`),
    title: child?.name ? `${child.name} Update` : 'Progress Update',
    body: String(report?.summary || '').trim(),
    author: therapist,
    createdAt: normalizeIso(`${report?.date || ''}T12:00:00`, report?.date),
    likes: 0,
    shares: 0,
    comments: [],
  };
});

const seededDemoTimeChangeProposals = [];

module.exports = {
  seededParents,
  seededTherapists,
  seededChildrenWithParents,
  seededDemoMessages,
  seededDemoPosts,
  seededDemoUrgentMemos,
  seededDemoTimeChangeProposals,
  seededDemoRoleIdentities,
  demoPersonaSourceIds,
};