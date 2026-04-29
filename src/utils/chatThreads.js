const { getEffectiveChatIdentity } = require('./demoIdentity');

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function isAdminLikeRole(role) {
  const value = normalizeRole(role);
  return value === 'admin'
    || value === 'administrator'
    || value === 'superadmin'
    || value === 'super_admin'
    || value === 'orgadmin'
    || value === 'org_admin'
    || value === 'organizationadmin'
    || value === 'campusadmin'
    || value === 'campus_admin';
}

function getParticipantTokens(user) {
  return [user?.id, user?.uid, user?.name, user?.email]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
}

function addParticipantTokens(set, participant) {
  [participant?.id, participant?.name, participant?.email]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .forEach((value) => set.add(value));
}

function buildVisibleThreads(messages, threadReads, user, archivedThreads) {
  const items = Array.isArray(messages) ? messages : [];
  const reads = threadReads && typeof threadReads === 'object' ? threadReads : {};
  const archived = new Set((archivedThreads || []).map((value) => String(value)));
  const chatUser = getEffectiveChatIdentity(user);
  const uid = String(chatUser?.id || chatUser?.uid || '').trim();

  const threads = items.reduce((acc, msg) => {
    const key = msg?.threadId || msg?.threadId === 0 ? msg.threadId : msg?.threadId || msg?.id || msg?.contactId || 'default';
    acc[key] = acc[key] || { id: key, last: msg, participants: new Set() };
    if (msg?.sender) addParticipantTokens(acc[key].participants, msg.sender);
    if (Array.isArray(msg?.to)) msg.to.forEach((target) => addParticipantTokens(acc[key].participants, target));
    if (new Date(msg?.createdAt) > new Date(acc[key].last?.createdAt)) acc[key].last = msg;
    return acc;
  }, {});

  const list = Object.values(threads).map((thread) => {
    const latestIncomingAt = items
      .filter((message) => String(message?.threadId || message?.id) === String(thread.id))
      .filter((message) => String(message?.sender?.id || '') !== uid)
      .reduce((latest, message) => {
        const messageMs = Date.parse(String(message?.createdAt || ''));
        return Number.isFinite(messageMs) && messageMs > latest ? messageMs : latest;
      }, 0);
    const readAtMs = Date.parse(String(reads[String(thread.id)] || ''));
    return {
      id: thread.id,
      last: thread.last,
      title: Array.from(thread.participants).filter(Boolean).slice(0, 2).join(', ') || (thread.last?.sender?.name || 'Conversation'),
      participants: Array.from(thread.participants).filter(Boolean),
      isUnread: latestIncomingAt > 0 && (!Number.isFinite(readAtMs) || latestIncomingAt > readAtMs),
    };
  });

  const visibleList = isAdminLikeRole(user?.role)
    ? list
    : list.filter((thread) => {
        const participantNames = (thread.participants || []).map((value) => String(value || '').toLowerCase());
        const tokens = getParticipantTokens(chatUser);
        if (!tokens.length) return false;
        return tokens.some((token) => participantNames.some((name) => name.includes(token)));
      });

  return visibleList
    .filter((thread) => !archived.has(String(thread.id)))
    .slice()
    .sort((a, b) => {
      if (!!a?.isUnread !== !!b?.isUnread) return a?.isUnread ? -1 : 1;
      const aTs = Date.parse(String(a?.last?.createdAt || ''));
      const bTs = Date.parse(String(b?.last?.createdAt || ''));
      if (!Number.isFinite(aTs) && !Number.isFinite(bTs)) return 0;
      if (!Number.isFinite(aTs)) return 1;
      if (!Number.isFinite(bTs)) return -1;
      return bTs - aTs;
    });
}

function countUnreadVisibleThreads(messages, threadReads, user, archivedThreads) {
  return buildVisibleThreads(messages, threadReads, user, archivedThreads).filter((thread) => thread.isUnread).length;
}

module.exports = {
  buildVisibleThreads,
  countUnreadVisibleThreads,
};