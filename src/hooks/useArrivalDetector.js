import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Api from '../Api';
import { useData } from '../DataContext';
import { useAuth } from '../AuthContext';

const ARRIVAL_KEY = 'settings_arrival_enabled_v1';
const BUSINESS_ADDR_KEY = 'business_address_v1';
const ORG_ARRIVAL_KEY = 'settings_arrival_org_enabled_v1';

// Default window (minutes) to check around scheduled times
const DEFAULT_WINDOW_MIN = 30; // start 30 minutes before
const DEFAULT_WINDOW_AFTER_MIN = 15; // stop 15 minutes after

function parseIso(t) {
  try { return new Date(t); } catch (e) { return null; }
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
  // a,b: { lat, lng }
  if (!a || !b) return null;
  if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng) || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return null;
  const R = 3958.7613; // Earth radius in miles
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

export default function useArrivalDetector() {
  const { children, fetchAndSync } = useData();
  const { user } = useAuth();
  const intervalRef = useRef(null);
  const appState = useRef(AppState.currentState);
  const [enabled, setEnabled] = useState(false);
  const [orgEnabled, setOrgEnabled] = useState(true);
  const [business, setBusiness] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function refreshFromStorage() {
      try {
        const a = await AsyncStorage.getItem(ARRIVAL_KEY);
        const o = await AsyncStorage.getItem(ORG_ARRIVAL_KEY);
        const bRaw = await AsyncStorage.getItem(BUSINESS_ADDR_KEY);
        if (!mounted) return;
        setEnabled(a === '1');
        // default to enabled when not set
        setOrgEnabled(o !== '0');
        if (bRaw) setBusiness(JSON.parse(bRaw));

        // Prefer server-backed org settings when available (keeps all devices consistent).
        try {
          const remote = await Api.getOrgSettings();
          const item = remote && remote.ok ? remote.item : null;
          if (item && typeof item === 'object') {
            if (typeof item.orgArrivalEnabled === 'boolean') setOrgEnabled(!!item.orgArrivalEnabled);
            if (typeof item.lat === 'number' && typeof item.lng === 'number') {
              setBusiness({
                address: item.address || '',
                lat: item.lat,
                lng: item.lng,
                dropZoneMiles: typeof item.dropZoneMiles === 'number' ? item.dropZoneMiles : undefined,
              });
            }
          }
        } catch (e) {
          // ignore; stay with local settings
        }
      } catch (e) {
        // ignore
      }
    }

    refreshFromStorage();

    const sub = AppState.addEventListener ? AppState.addEventListener('change', (next) => _handleAppState(next, refreshFromStorage)) : null;
    return () => { mounted = false; if (sub && sub.remove) sub.remove(); };
  }, []);

  useEffect(() => {
    const effectiveEnabled = enabled && orgEnabled;
    if (!effectiveEnabled) {
      _stopInterval();
      return;
    }
    // start checking periodically when enabled
    _evaluateAndSchedule();
    return () => { _stopInterval(); };
  }, [enabled, orgEnabled, children, user, business]);

  function _handleAppState(next, refreshFromStorage) {
    appState.current = next;
    // If app becomes active, evaluate windows immediately
    if (next === 'active') {
      try { if (typeof refreshFromStorage === 'function') refreshFromStorage(); } catch (e) {}
      _evaluateAndSchedule();
    }
  }

  function _stopInterval() {
    try { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } } catch (e) {}
  }

  async function _getLocation() {
    try {
      // dynamic import to avoid crashing when expo-location not installed
      const Location = require('expo-location');
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return null;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
    } catch (e) {
      console.warn('arrival: location failed', e?.message || e);
      return null;
    }
  }

  async function _ping(payload) {
    try { await Api.pingArrival(payload); } catch (e) { console.warn('arrival ping failed', e?.message || e); }
  }

  function _getDropZoneConfig() {
    const lat = Number(business?.lat);
    const lng = Number(business?.lng);
    const miles = Number(business?.dropZoneMiles);
    const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);
    const hasMiles = Number.isFinite(miles) && miles > 0;
    return {
      hasConfig: hasLocation && hasMiles,
      org: hasLocation ? { lat, lng } : null,
      dropZoneMiles: hasMiles ? miles : null,
    };
  }

  async function _evaluateAndSchedule() {
    try {
      if (!enabled || !orgEnabled) {
        _stopInterval();
        return;
      }
      // find schedule windows for this user
      const now = new Date();
      let shouldPoll = false;

      if (!user) return;
      const role = (user.role || '').toString().toLowerCase();

      if (role === 'parent') {
        // for each child, check upcoming events with ISO timestamps (child.upcoming[].whenISO)
        const list = children || [];
        for (const ch of list) {
          const upcoming = ch.upcoming || [];
          for (const ev of upcoming) {
            const t = ev.whenISO ? parseIso(ev.whenISO) : null;
            if (t && isWithinWindow(t, now)) {
              shouldPoll = true;
              // send immediate ping once and continue polling
              _getLocation().then((loc) => {
                if (!loc) return;
                const dz = _getDropZoneConfig();
                const dist = dz.hasConfig ? haversineMiles({ lat: loc.lat, lng: loc.lng }, dz.org) : null;
                const within = dz.hasConfig ? (dist !== null && dist <= dz.dropZoneMiles) : true;
                if (!within) return;
                _ping({
                  lat: loc.lat,
                  lng: loc.lng,
                  userId: user.id,
                  role,
                  childId: ch.id,
                  eventId: ev.id,
                  when: t.toISOString(),
                  orgLat: dz.org?.lat,
                  orgLng: dz.org?.lng,
                  dropZoneMiles: dz.dropZoneMiles,
                  distanceMiles: dist,
                });
              }).catch(() => {});
            }
          }
        }
      } else if (role === 'therapist') {
        // check user.shifts array for scheduled shifts { startISO, endISO }
        const shifts = user.shifts || [];
        for (const s of shifts) {
          const start = s.startISO ? parseIso(s.startISO) : null;
          const end = s.endISO ? parseIso(s.endISO) : null;
          if (start && end) {
            // If now is within start - DEFAULT_WINDOW_MIN ... end + DEFAULT_WINDOW_AFTER_MIN
            const windowStart = new Date(start.getTime() - DEFAULT_WINDOW_MIN * 60000);
            const windowEnd = new Date(end.getTime() + DEFAULT_WINDOW_AFTER_MIN * 60000);
            if (now >= windowStart && now <= windowEnd) {
              shouldPoll = true;
              _getLocation().then((loc) => {
                if (!loc) return;
                const dz = _getDropZoneConfig();
                const dist = dz.hasConfig ? haversineMiles({ lat: loc.lat, lng: loc.lng }, dz.org) : null;
                const within = dz.hasConfig ? (dist !== null && dist <= dz.dropZoneMiles) : true;
                if (!within) return;
                _ping({
                  lat: loc.lat,
                  lng: loc.lng,
                  userId: user.id,
                  role,
                  shiftId: s.id,
                  when: now.toISOString(),
                  orgLat: dz.org?.lat,
                  orgLng: dz.org?.lng,
                  dropZoneMiles: dz.dropZoneMiles,
                  distanceMiles: dist,
                });
              }).catch(() => {});
            }
          }
        }
      }

      if (shouldPoll) {
        if (!intervalRef.current) {
          // poll every 60 seconds while in window
          intervalRef.current = setInterval(async () => {
            if (appState.current !== 'active') return; // only when active
            const loc = await _getLocation();
            if (!loc) return;
            const dz = _getDropZoneConfig();
            const dist = dz.hasConfig ? haversineMiles({ lat: loc.lat, lng: loc.lng }, dz.org) : null;
            const within = dz.hasConfig ? (dist !== null && dist <= dz.dropZoneMiles) : true;
            if (!within) return;
            await _ping({
              lat: loc.lat,
              lng: loc.lng,
              userId: user.id,
              role,
              when: new Date().toISOString(),
              orgLat: dz.org?.lat,
              orgLng: dz.org?.lng,
              dropZoneMiles: dz.dropZoneMiles,
              distanceMiles: dist,
            });
          }, 60 * 1000);
        }
      } else {
        _stopInterval();
      }
    } catch (e) {
      console.warn('arrival evaluate failed', e?.message || e);
    }
  }

  return { enabled, business };
}
