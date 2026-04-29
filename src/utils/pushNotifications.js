import { Platform } from 'react-native';

let notificationsLib = null;
function getNotificationsLib() {
  if (notificationsLib) return notificationsLib;
  try {
    // Lazy require so Expo Go can run without triggering warnings at import-time.
    // eslint-disable-next-line global-require
    notificationsLib = require('expo-notifications');
    return notificationsLib;
  } catch (e) {
    return null;
  }
}

let deviceLib = null;
function getDeviceLib() {
  if (deviceLib) return deviceLib;
  try {
    // eslint-disable-next-line global-require
    deviceLib = require('expo-device');
    return deviceLib;
  } catch (e) {
    return null;
  }
}

function isExpoGo() {
  try {
    // eslint-disable-next-line global-require
    const ConstantsModule = require('expo-constants');
    const Constants = ConstantsModule?.default || ConstantsModule;
    return String(Constants?.appOwnership || '').toLowerCase() === 'expo';
  } catch (e) {
    return false;
  }
}

// Read EAS projectId from app.json so getExpoPushTokenAsync works reliably in EAS builds.
const EAS_PROJECT_ID = (() => {
  try {
    const cfg = require('../../app.json');
    return cfg?.expo?.extra?.eas?.projectId || '';
  } catch (e) {
    return '';
  }
})();

export function configureNotificationHandling() {
  if (Platform.OS === 'web') return;
  if (isExpoGo()) return;

  // Show alerts by default when a notification arrives.
  const Notifications = getNotificationsLib();
  if (!Notifications) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
}

export async function setApplicationBadgeCountAsync(count) {
  if (Platform.OS === 'web') {
    return { ok: false, reason: 'web-unsupported' };
  }
  if (isExpoGo()) {
    return { ok: false, reason: 'expo-go' };
  }

  const Notifications = getNotificationsLib();
  if (!Notifications || typeof Notifications.setBadgeCountAsync !== 'function') {
    return { ok: false, reason: 'missing-deps' };
  }

  try {
    const safeCount = Number.isFinite(Number(count)) ? Math.max(0, Math.trunc(Number(count))) : 0;
    const applied = await Notifications.setBadgeCountAsync(safeCount);
    return { ok: !!applied, count: safeCount };
  } catch (e) {
    return { ok: false, reason: 'set-badge-failed', message: e?.message || String(e) };
  }
}

export async function registerForExpoPushTokenAsync() {
  if (Platform.OS === 'web') {
    return { ok: false, reason: 'web-unsupported' };
  }
  if (isExpoGo()) {
    return { ok: false, reason: 'expo-go' };
  }

  const Device = getDeviceLib();
  const Notifications = getNotificationsLib();
  if (!Device || !Notifications) {
    return { ok: false, reason: 'missing-deps' };
  }

  if (!Device.isDevice) {
    return { ok: false, reason: 'not-device' };
  }

  // iOS will prompt; Android depends on OS version.
  const existing = await Notifications.getPermissionsAsync();
  let status = existing?.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested?.status;
  }

  if (status !== 'granted') {
    return { ok: false, reason: 'permission-denied' };
  }

  // Android: channel required for visible notifications.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync(EAS_PROJECT_ID ? { projectId: EAS_PROJECT_ID } : undefined);
    return { ok: true, token: token?.data || '' };
  } catch (e) {
    return { ok: false, reason: 'token-failed', message: e?.message || String(e) };
  }
}

export default {
  configureNotificationHandling,
  setApplicationBadgeCountAsync,
  registerForExpoPushTokenAsync,
};
