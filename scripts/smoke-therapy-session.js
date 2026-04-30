/*
  Therapy session lifecycle smoke runner.

  Runs a focused start -> log -> end -> save -> approve -> fetch summary flow.

  Usage:
    node scripts/smoke-therapy-session.js

  Env:
    CB_BASE_URL=http://127.0.0.1:3006
    BB_BASE_URL=http://127.0.0.1:3006
*/

const DEFAULT_BASE = 'http://127.0.0.1:3006';

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

async function http(baseUrl, method, path, { json } = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: json ? { 'Content-Type': 'application/json' } : undefined,
    body: json ? JSON.stringify(json) : undefined,
  });
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    data: safeJson(text) ?? text,
  };
}

async function main() {
  const baseUrl = (process.env.CB_BASE_URL || process.env.BB_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
  const childId = `therapy-smoke-${Date.now()}`;

  const start = await http(baseUrl, 'POST', '/api/therapy-sessions', {
    json: { childId, childName: 'Therapy Smoke Child', sessionType: 'AM' },
  });
  if (!start.ok) throw new Error(`start failed: ${start.status} ${JSON.stringify(start.data)}`);
  const sessionId = start.data?.item?.id;
  if (!sessionId) throw new Error('start response missing session id');

  const logSingle = await http(baseUrl, 'POST', `/api/therapy-sessions/${sessionId}/events`, {
    json: {
      eventType: 'program',
      eventCode: 'skill_acquisition_trial',
      label: 'Skill acquisition',
      metadata: { programName: 'Color matching' },
    },
  });
  if (!logSingle.ok) throw new Error(`single event failed: ${logSingle.status} ${JSON.stringify(logSingle.data)}`);

  const logBulk = await http(baseUrl, 'POST', `/api/therapy-sessions/${sessionId}/events/bulk`, {
    json: {
      events: [
        {
          eventType: 'milestone',
          eventCode: 'prompt_fading_success',
          label: 'Prompt fading success',
          metadata: { milestone: 'Prompt fading success' },
        },
        {
          eventType: 'behavior',
          eventCode: 'tantrum',
          label: 'Tantrum',
          intensity: 'Low',
          frequencyDelta: 1,
        },
        {
          eventType: 'note',
          eventCode: 'therapist_note',
          label: 'Therapist note',
          metadata: { note: 'Strong transitions after snack.' },
        },
        {
          eventType: 'note',
          eventCode: 'abc_note',
          label: 'ABC note',
          metadata: { noteCategory: 'antecedent', noteText: 'Transition from snack to table work.' },
        },
        {
          eventType: 'note',
          eventCode: 'parent_communication',
          label: 'Parent communication',
          metadata: { communicationType: 'pickup_update', communicationDetail: 'Shared transition progress with parent at pickup.' },
        },
        {
          eventType: 'note',
          eventCode: 'attendance_note',
          label: 'Attendance note',
          metadata: { attendanceType: 'late_arrival', attendanceDetail: 'Arrived 12 minutes late after traffic delay.' },
        },
      ],
    },
  });
  if (!logBulk.ok) throw new Error(`bulk events failed: ${logBulk.status} ${JSON.stringify(logBulk.data)}`);

  const eventHistory = await http(baseUrl, 'GET', `/api/therapy-sessions/${sessionId}/events?limit=10`);
  if (!eventHistory.ok) throw new Error(`event history failed: ${eventHistory.status} ${JSON.stringify(eventHistory.data)}`);
  if (!Array.isArray(eventHistory.data?.items) || eventHistory.data.items.length < 6) {
    throw new Error(`event history missing expected items: ${JSON.stringify(eventHistory.data)}`);
  }
  const abcEvent = eventHistory.data.items.find((item) => item?.eventCode === 'abc_note');
  const communicationEvent = eventHistory.data.items.find((item) => item?.eventCode === 'parent_communication');
  const attendanceEvent = eventHistory.data.items.find((item) => item?.eventCode === 'attendance_note');
  const behaviorEvent = eventHistory.data.items.find((item) => item?.eventCode === 'tantrum');
  if (!abcEvent?.metadata || abcEvent.metadata.noteCategory !== 'antecedent' || abcEvent.metadata.noteText !== 'Transition from snack to table work.') {
    throw new Error(`abc event metadata mismatch: ${JSON.stringify(abcEvent)}`);
  }
  if (!communicationEvent?.metadata || communicationEvent.metadata.communicationType !== 'pickup_update' || communicationEvent.metadata.communicationDetail !== 'Shared transition progress with parent at pickup.') {
    throw new Error(`parent communication metadata mismatch: ${JSON.stringify(communicationEvent)}`);
  }
  if (!attendanceEvent?.metadata || attendanceEvent.metadata.attendanceType !== 'late_arrival' || attendanceEvent.metadata.attendanceDetail !== 'Arrived 12 minutes late after traffic delay.') {
    throw new Error(`attendance event metadata mismatch: ${JSON.stringify(attendanceEvent)}`);
  }
  if (!behaviorEvent || behaviorEvent.intensity !== 'Low') {
    throw new Error(`behavior intensity mismatch: ${JSON.stringify(behaviorEvent)}`);
  }

  const ended = await http(baseUrl, 'POST', `/api/therapy-sessions/${sessionId}/end`, { json: {} });
  if (!ended.ok) throw new Error(`end failed: ${ended.status} ${JSON.stringify(ended.data)}`);

  const summaryPayload = {
    summary: {
      dailyRecap: {
        therapistNarrative: 'Strong transitions after snack. Prompt fading improved today.',
      },
    },
  };

  const saved = await http(baseUrl, 'PUT', `/api/therapy-sessions/${sessionId}/summary`, { json: summaryPayload });
  if (!saved.ok) throw new Error(`save failed: ${saved.status} ${JSON.stringify(saved.data)}`);

  const approved = await http(baseUrl, 'POST', `/api/therapy-sessions/${sessionId}/summary/approve`, { json: summaryPayload });
  if (!approved.ok) throw new Error(`approve failed: ${approved.status} ${JSON.stringify(approved.data)}`);

  const latest = await http(baseUrl, 'GET', `/api/children/${childId}/session-summaries/latest`);
  if (!latest.ok) throw new Error(`latest summary failed: ${latest.status} ${JSON.stringify(latest.data)}`);

  const artifact = await fetch(new URL(`/api/therapy-sessions/${sessionId}/artifacts/session-summary.txt`, baseUrl));
  const artifactText = await artifact.text();
  if (!artifact.ok) throw new Error(`artifact failed: ${artifact.status} ${artifactText}`);

  console.log(JSON.stringify({
    started: start.data?.ok === true,
    ended: ended.data?.ok === true,
    saved: saved.data?.ok === true,
    approved: approved.data?.ok === true,
    eventHistoryCount: eventHistory.data?.items?.length || 0,
    abcMetadataVerified: true,
    communicationMetadataVerified: true,
    attendanceMetadataVerified: true,
    behaviorIntensityVerified: true,
    latestSessionId: latest.data?.item?.sessionId || null,
    artifactLength: artifactText.length,
    progressLevel: latest.data?.item?.summary?.dailyRecap?.progressLevel || null,
    narrative: latest.data?.item?.summary?.dailyRecap?.therapistNarrative || null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
