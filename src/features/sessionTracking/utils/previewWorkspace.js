const PREVIEW_CHILD = Object.freeze({
  id: null,
  name: 'Preview Learner',
  age: '4 yrs',
  room: 'Therapy Room A',
  carePlan: 'Preview mode lets you inspect and exercise the tap tracker and summary review UI without saving data.',
  notes: 'No learner is selected. Changes on this screen stay local to preview mode.',
  parents: [],
  upcoming: [],
  amTherapist: null,
  pmTherapist: null,
  bcaTherapist: null,
});

const PREVIEW_EVENTS = Object.freeze([
  { feedId: 'preview-1', label: 'Skill acquisition', detailLabel: 'Independent', occurredAt: '2026-04-29T09:00:00.000Z', status: 'synced' },
  { feedId: 'preview-2', label: 'Parent communication', detailLabel: 'Pick-up update', occurredAt: '2026-04-29T09:08:00.000Z', status: 'synced' },
  { feedId: 'preview-3', label: 'ABC note', detailLabel: 'Antecedent', occurredAt: '2026-04-29T09:14:00.000Z', status: 'queued' },
]);

const PREVIEW_DRAFT_SUMMARY = Object.freeze({
  sessionId: 'preview-session',
  summary: {
    dailyRecap: {
      therapistNarrative: 'Preview summary narrative for reviewing layout, spacing, and editable therapist notes.',
      progressLevel: 'Moderate progress',
      independenceLevel: 'Prompt dependent',
      interferingBehaviorLevel: 'Low',
    },
    monthlyGoal: {
      description: 'Increase independent transitions between table work and play activities.',
    },
    moodScore: {
      selectedLabel: 'Calm / engaged',
      selectedValue: 11,
    },
    successCriteriaMet: ['Transitioned with one verbal prompt', 'Completed matching trials'],
    programsWorkedOn: ['Matching', 'Requesting break', 'Transition routine'],
    interferingBehaviors: [{ behavior: 'Refusal', frequency: 1, intensity: 'Low' }],
    meals: [{ type: 'Snack' }],
    toileting: [{ status: 'Prompted' }],
  },
});

function createPreviewSession(sessionType = 'AM') {
  return {
    id: `preview-active-${String(sessionType || 'AM').toLowerCase()}`,
    sessionType,
    startedAt: new Date().toISOString(),
  };
}

function createPreviewDraftSummary(currentNarrative, eventItems = []) {
  const behaviorCount = eventItems.filter((item) => /behavior|tantrum|incident/i.test(String(item?.label || ''))).length;
  const programLabels = Array.from(new Set(eventItems.map((item) => String(item?.label || '').trim()).filter(Boolean))).slice(0, 4);
  return {
    sessionId: 'preview-session',
    summary: {
      ...PREVIEW_DRAFT_SUMMARY.summary,
      dailyRecap: {
        ...(PREVIEW_DRAFT_SUMMARY.summary.dailyRecap || {}),
        therapistNarrative: String(currentNarrative || PREVIEW_DRAFT_SUMMARY.summary.dailyRecap.therapistNarrative || '').trim(),
      },
      programsWorkedOn: programLabels.length ? programLabels : PREVIEW_DRAFT_SUMMARY.summary.programsWorkedOn,
      interferingBehaviors: behaviorCount
        ? [{ behavior: 'Behavior events logged', frequency: behaviorCount, intensity: 'Low' }]
        : PREVIEW_DRAFT_SUMMARY.summary.interferingBehaviors,
    },
  };
}

function summarizeSessionStamp(item) {
  const source = item?.approvedAt || item?.updatedAt || item?.generatedAt || item?.startedAt || '';
  if (!source) return '';
  try {
    return new Date(source).toLocaleString();
  } catch (_) {
    return String(source);
  }
}

function mapEventToFeedItem(event) {
  const metadata = event?.metadata && typeof event.metadata === 'object' ? event.metadata : {};
  return {
    feedId: event?.id || `${event?.eventCode || 'event'}-${event?.occurredAt || ''}`,
    label: event?.label || event?.eventCode || event?.eventType || 'Event',
    intensity: event?.intensity || null,
    detailLabel: metadata.trialOutcome || metadata.communicationType || metadata.noteCategory || metadata.attendanceType || metadata.noteText || metadata.communicationDetail || metadata.attendanceDetail || metadata.note || null,
    occurredAt: event?.occurredAt || event?.createdAt || null,
    status: 'synced',
  };
}

module.exports = {
  PREVIEW_CHILD,
  PREVIEW_EVENTS,
  PREVIEW_DRAFT_SUMMARY,
  createPreviewSession,
  createPreviewDraftSummary,
  summarizeSessionStamp,
  mapEventToFeedItem,
};