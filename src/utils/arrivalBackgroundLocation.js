import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Api from '../Api';

const TASK_NAME = 'ARRIVAL_BG_LOCATION_TASK_V1';

const STORAGE_ENABLED_KEY = 'arrival_bg_enabled_v1';
const STORAGE_USER_KEY = 'arrival_bg_user_v1';
const STORAGE_STATE_KEY = 'arrival_bg_state_v1';

// Match the window logic in useArrivalDetector.
const DEFAULT_WINDOW_MIN = 30; // start 30 minutes before
const DEFAULT_WINDOW_AFTER_MIN = 15; // stop 15 minutes after

function parseIso(t) {
  try {
    return new Date(t);
  } catch (_) {
    return null;
  }
}

function isWithinWindow(targetDate, now = new Date(), before = DEFAULT_WINDOW_MIN, after = DEFAULT_WINDOW_AFTER_MIN) {
  if (!targetDate) return false;
  const start = new Date(targetDate.getTime() - before * 60000);
  const end = new Date(targetDate.getTime() + after * 60000);
  return now >= start && now <= end;
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function haversineMiles(a, b) {
  if (!a || !b) return null;
  if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng) || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return null;
  const R = 3958.7613;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const aa = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
}

function safeJsonParse(s) {
  try {
    return JSON.parse(String(s || ''));
  } catch (_) {
    return null;
  }
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch (_) {
    return '';
  }
}

TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
  try {
    if (error) return;

    const enabled = await AsyncStorage.getItem(STORAGE_ENABLED_KEY);
    if (enabled !== '1') return;

    const userRaw = await AsyncStorage.getItem(STORAGE_USER_KEY);
    const user = safeJsonParse(userRaw) || {};

    const locations = data?.locations;
    if (!Array.isArray(locations) || locations.length === 0) return;

    const last = locations[locations.length - 1];
    const coords = last?.coords;
    if (!coords) return;

    const payload = {
      source: 'bg-location',
      at: nowIso(),
      userId: user.userId || undefined,
      role: user.role || undefined,
      lat: typeof coords.latitude === 'number' ? coords.latitude : undefined,
      lng: typeof coords.longitude === 'number' ? coords.longitude : undefined,
      accuracy: typeof coords.accuracy === 'number' ? coords.accuracy : undefined,
      altitude: typeof coords.altitude === 'number' ? coords.altitude : undefined,
      speed: typeof coords.speed === 'number' ? coords.speed : undefined,
      heading: typeof coords.heading === 'number' ? coords.heading : undefined,
    };

    // Tighten: only send pings during scheduled windows and (when configured) only inside drop-zone.
    const stateRaw = await AsyncStorage.getItem(STORAGE_STATE_KEY);
    const state = safeJsonParse(stateRaw) || {};

    const role = String(payload.role || '').toLowerCase();
    const now = new Date();

    const org = state?.org && typeof state.org === 'object' ? state.org : null;
    const dzHas = !!org && Number.isFinite(Number(org.lat)) && Number.isFinite(Number(org.lng)) && Number.isFinite(Number(org.dropZoneMiles)) && Number(org.dropZoneMiles) > 0;
    const orgPoint = dzHas ? { lat: Number(org.lat), lng: Number(org.lng) } : null;
    const dzMiles = dzHas ? Number(org.dropZoneMiles) : null;

    const locPoint = {
      lat: typeof payload.lat === 'number' ? payload.lat : NaN,
      lng: typeof payload.lng === 'number' ? payload.lng : NaN,
    };

    let distanceMiles = null;
    let withinDropZone = true;
    if (dzHas && orgPoint) {
      distanceMiles = haversineMiles(locPoint, orgPoint);
      withinDropZone = distanceMiles !== null && distanceMiles <= dzMiles;
    }

    if (!withinDropZone) return;

    const windows = Array.isArray(state?.windows) ? state.windows : [];
    if (windows.length === 0) return;

    for (const w of windows) {
      if (!w || typeof w !== 'object') continue;
      if (w.role && String(w.role).toLowerCase() !== role) continue;
      const whenISO = w.whenISO || w.startISO || null;
      const t = whenISO ? parseIso(whenISO) : null;
      if (!t || !isWithinWindow(t, now)) continue;

      const enriched = {
        ...payload,
        childId: w.childId || undefined,
        eventId: w.eventId || undefined,
        shiftId: w.shiftId || undefined,
        when: t.toISOString(),
        orgLat: orgPoint?.lat,
        orgLng: orgPoint?.lng,
        dropZoneMiles: dzMiles,
        distanceMiles,
      };

      // Best-effort; do not throw to the OS background task runner.
      await Api.pingArrival(enriched);

      // Avoid spamming: send at most one ping per background batch.
      break;
    }

  } catch (_) {
    // swallow
  }
});

export async function startArrivalBackgroundLocation({ userId, role } = {}) {
  if (Platform.OS === 'web') return { ok: false, reason: 'web-unsupported' };

  await AsyncStorage.setItem(STORAGE_ENABLED_KEY, '1');
  await AsyncStorage.setItem(STORAGE_USER_KEY, JSON.stringify({ userId: userId || '', role: role || '' }));

  // iOS requires foreground permission before background permission.
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg?.granted) return { ok: false, reason: 'foreground-permission-denied' };

  const bg = await Location.requestBackgroundPermissionsAsync();
  if (!bg?.granted) return { ok: false, reason: 'background-permission-denied' };

  const already = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  if (already) return { ok: true, started: false };

  await Location.startLocationUpdatesAsync(TASK_NAME, {
    // Tighten battery/network: low-ish accuracy + less frequent updates.
    accuracy: Location.Accuracy.Low,
    timeInterval: 5 * 60 * 1000,
    distanceInterval: 250,
    deferredUpdatesInterval: 5 * 60 * 1000,
    deferredUpdatesDistance: 500,
    pausesUpdatesAutomatically: true,

    // Android 8+ requires a foreground service notification for background location.
    foregroundService: {
      notificationTitle: 'CommunityBridge',
      notificationBody: 'Arrival detection is active in the background.',
    },

    // iOS-only options are safe to pass; Android ignores unknown keys.
    showsBackgroundLocationIndicator: false,
    activityType: Location.ActivityType.Other,
  });

  return { ok: true, started: true };
}

// Called from the foreground app to keep background behavior aligned with real schedules.
export async function setArrivalBackgroundState({ org, windows } = {}) {
  try {
    const clean = {
      org: org && typeof org === 'object' ? {
        lat: Number(org.lat),
        lng: Number(org.lng),
        dropZoneMiles: Number(org.dropZoneMiles),
      } : null,
      windows: Array.isArray(windows) ? windows.slice(0, 500) : [],
      updatedAt: nowIso(),
    };
    await AsyncStorage.setItem(STORAGE_STATE_KEY, JSON.stringify(clean));
  } catch (_) {
    // ignore
  }
}

export async function stopArrivalBackgroundLocation() {
  if (Platform.OS === 'web') return { ok: true };

  await AsyncStorage.setItem(STORAGE_ENABLED_KEY, '0');

  try {
    const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
    if (started) await Location.stopLocationUpdatesAsync(TASK_NAME);
  } catch (_) {
    // ignore
  }

  return { ok: true };
}

export const arrivalBackgroundTaskName = TASK_NAME;
