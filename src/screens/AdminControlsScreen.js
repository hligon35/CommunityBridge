import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, Animated, Linking, Alert, TextInput, KeyboardAvoidingView, Platform, Keyboard, Modal, Pressable, Share } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { avatarSourceFor, setIdVisibilityEnabled, initIdVisibilityFromStorage } from '../utils/idVisibility';
import { useData } from '../DataContext';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GOOGLE_PLACES_API_KEY } from '../config';
import * as FileSystem from 'expo-file-system';
import * as Api from '../Api';
import { useTenant } from '../core/tenant/TenantContext';
import { useAuth } from '../AuthContext';
import { isAdminRole, isSuperAdminRole } from '../core/tenant/models';
import { SETTINGS_KEYS, readJsonSetting, writeBooleanSetting, writeJsonSetting } from '../utils/appSettings';
import ImageToggle from '../components/ImageToggle';
import useIsTabletLayout from '../hooks/useIsTabletLayout';

const APP_BUNDLE_ID = (() => {
  try {
    // Expo projects include app.json; this is safe to read at runtime.
    const cfg = require('../../app.json');
    return cfg?.expo?.ios?.bundleIdentifier || '';
  } catch (e) {
    return '';
  }
})();

const BUSINESS_ADDR_KEY = SETTINGS_KEYS.businessAddress;
const ORG_ARRIVAL_KEY = SETTINGS_KEYS.orgArrivalEnabled;
const alertsIcon = require('../../assets/icons/alerts.png');
const importDirectoryIcon = require('../../assets/icons/importDirectory.png');
const exportDirectoryIcon = require('../../assets/icons/exportDirectory.png');
const studentsIcon = require('../../assets/icons/students.png');
const facultyIcon = require('../../assets/icons/faculty.png');
const parentsIcon = require('../../assets/icons/parents.png');
const currentLocationIcon = require('../../assets/icons/currentLocation.png');
const SHOW_IMPORT_EXPORT_CONTROLS = false;

export default function AdminControlsScreen() {
  const navigation = useNavigation();
  const { messages, children, parents = [], therapists = [], urgentMemos = [], fetchAndSync } = useData();
  const { user } = useAuth();
  const tenant = useTenant() || {};
  const isTabletLayout = useIsTabletLayout();
  const tenantFlags = tenant.featureFlags || {};
  const canManagePermissions = isSuperAdminRole(user?.role);
  const isWeb = Platform.OS === 'web';
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importPickedFile, setImportPickedFile] = useState(null);
  const [activeDirectoryPreview, setActiveDirectoryPreview] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [adminCapabilities, setAdminCapabilities] = useState({
    'users:manage': false,
    'children:edit': true,
    'settings:system': true,
    'export:data': true,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await Api.getPermissionsConfig();
        const role = String(user?.role || '').trim().toLowerCase();
        const config = res?.item && typeof res.item === 'object' ? res.item : {};
        let key = 'Staff';
        if (role === 'superadmin' || role === 'super_admin' || role === 'admin' || role === 'administrator' || role === 'campusadmin' || role === 'campus_admin' || role === 'orgadmin' || role === 'org_admin' || role === 'organizationadmin') key = 'Admin';
        else if (role.includes('therapist') || role.includes('bcba')) key = 'Therapist';
        else if (role.includes('teacher') || role.includes('faculty')) key = 'Teacher';
        else if (role.includes('parent')) key = 'Parent';
        const nextCaps = config[key] && typeof config[key] === 'object' ? config[key] : {};
        if (mounted) setAdminCapabilities((current) => ({ ...current, ...nextCaps }));
      } catch (_) {
        // Keep defaults if the permissions API is unavailable.
      }
    })();
    return () => { mounted = false; };
  }, [user?.role]);

  useEffect(() => {
    loadAuditLogs().catch(() => {});
  }, [user?.role]);

  function hasCapability(capability) {
    if (canManagePermissions) return true;
    return Boolean(adminCapabilities[capability]);
  }

  const canOpenAccessControls = isAdminRole(user?.role);
  const showStudentsPreview = activeDirectoryPreview === 'students';
  const showFacultyPreview = activeDirectoryPreview === 'faculty';
  const showParentsPreview = activeDirectoryPreview === 'parents';

  function toggleDirectoryPreview(nextPreview) {
    setActiveDirectoryPreview((current) => (current === nextPreview ? '' : nextPreview));
  }

  const therapistCount = useMemo(() => {
    const set = new Set();
    (children || []).forEach(c => {
      if (c.amTherapist && c.amTherapist.id) set.add(c.amTherapist.id);
      if (c.pmTherapist && c.pmTherapist.id) set.add(c.pmTherapist.id);
      if (c.bcaTherapist && c.bcaTherapist.id) set.add(c.bcaTherapist.id);
    });
    return set.size;
  }, [children]);

  const facultyCount = useMemo(() => {
    const map = new Map();
    (therapists || []).forEach((f) => { if (f && f.id) map.set(f.id, f); });
    return map.size;
  }, [therapists]);
  const pendingAlertCount = (urgentMemos || []).filter((m) => !m.status || m.status === 'pending').length;
  const currentRoleLabel = String(user?.role || 'admin').trim() || 'admin';
  const adminNavSplitSections = [
    {
      key: 'office',
      title: 'Office Operations',
      subtitle: 'Scheduling, staff controls, compliance, imports, and organization settings.',
      items: [
        canOpenAccessControls ? { key: 'ManagePermissions', label: 'User Roles & Permissions', description: 'Control account access, reset passwords, and edit scoped admin access.', icon: 'admin-panel-settings' } : null,
        { key: 'ScheduleCalendar', label: 'Scheduling', description: 'Open day, week, staff, and student scheduling views.', icon: 'calendar-month' },
        { key: 'InsuranceBilling', label: 'Billing & Authorizations', description: 'Review authorizations, verification flow, and billing handoff status.', icon: 'receipt-long' },
        { key: 'ImportCenter', label: 'Import Center', description: 'Choose and validate JSON directory imports with audit visibility.', icon: 'upload-file', disabled: !hasCapability('children:edit') },
        { key: 'ExportData', label: 'Export Center', description: 'Prepare PDF, CSV, and Excel-style exports.', icon: 'file-download', disabled: !hasCapability('export:data') },
        { key: 'AdminAlerts', label: 'Compliance & Alerts', description: 'Track expirations, urgent memos, and operational blockers.', icon: 'notification-important', badge: pendingAlertCount },
        { key: 'PrivacyDefaults', label: 'Organization Settings', description: 'Adjust privacy defaults, arrivals, and profile-level system behavior.', icon: 'settings-applications', disabled: !hasCapability('settings:system') },
        { key: 'AdminMemos', label: 'Broadcast Center', description: 'Send office announcements and operational updates.', icon: 'campaign' },
      ].filter(Boolean),
    },
    {
      key: 'clinical',
      title: 'Clinical Operations',
      subtitle: 'BCBA-oriented learner workflow, reports, and treatment review entry points.',
      items: [
        { key: 'Reports', label: 'Data & Reports', description: 'Review clinical and operational reporting in one place.', icon: 'analytics' },
        { key: 'TapTracker', label: 'Tap Tracker', description: 'Launch the iPad session workflow for live session capture.', icon: 'touch-app' },
        { key: 'SummaryReview', label: 'Summary Review', description: 'Approve session summaries and parent-facing notes.', icon: 'fact-check' },
        tenantFlags.attendanceModule !== false ? { key: 'Attendance', label: 'Attendance', description: 'Inspect attendance status and verification details.', icon: 'event-available' } : null,
        tenantFlags.programDirectory !== false ? { key: 'ProgramDirectory', label: 'Programs & Goals', description: 'Open the program library and learner program lists.', icon: 'assignment' } : null,
        { key: 'AdminChatMonitor', label: 'Communication Threads', description: 'Monitor BCBA, therapist, and family communication flows.', icon: 'forum' },
      ].filter(Boolean),
    },
  ];

  // Navigation helpers
  const openMemos = () => navigation.navigate('AdminMemos');
  const openAlerts = () => navigation.navigate('AdminAlerts');
  // open admin chat monitor (admin-only chat oversight)
  const openChats = () => navigation.navigate('AdminChatMonitor');
  const openImport = () => {
    if (!hasCapability('children:edit')) {
      Alert.alert('Permission required', 'Your account cannot import directory records.');
      return;
    }
    setImportPickedFile(null);
    setImportModalVisible(true);
  };
  const openStudentDirectory = () => navigation.navigate('StudentDirectory');
  const openFacultyDirectory = () => navigation.navigate('FacultyDirectory');
  const openParentDirectory = () => navigation.navigate('ParentDirectory');

  function HeaderAlertButton() {
    return (
      <TouchableOpacity
        onPress={openAlerts}
        style={styles.headerIconBtn}
        accessibilityLabel="Open Alerts"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Image source={alertsIcon} style={styles.headerImageIcon} />
        <Text style={styles.headerIconLabel}>Alerts</Text>
        {pendingAlertCount > 0 ? (
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{pendingAlertCount}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  }

  function HeaderRightButtons() {
    if (!SHOW_IMPORT_EXPORT_CONTROLS) return null;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity
          onPress={openImport}
          disabled={!hasCapability('children:edit')}
          style={[styles.headerIconBtn, { marginRight: 10 }, !hasCapability('children:edit') ? styles.headerIconBtnDisabled : null]}
          accessibilityLabel="Import Data"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {/* Import is “bring data into the app” (down arrow) */}
          <Image source={importDirectoryIcon} style={styles.headerImageIcon} />
          <Text style={styles.headerIconLabel}>Import</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setExportModalVisible(true)}
          disabled={!hasCapability('export:data')}
          style={[styles.headerIconBtn, !hasCapability('export:data') ? styles.headerIconBtnDisabled : null]}
          accessibilityLabel="Export Data"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {/* Export is “send data out of the app” (up arrow) */}
          <Image source={exportDirectoryIcon} style={styles.headerImageIcon} />
          <Text style={styles.headerIconLabel}>Export</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function toCSV(rows) {
    if (!rows || !rows.length) return '';
    const keys = Object.keys(rows[0]);
    const header = keys.join(',');
    const lines = rows.map(r => keys.map(k => (`"${String(r[k] ?? '')}"`)).join(','));
    return [header, ...lines].join('\n');
  }

  function buildExportPayload() {
    return '';
  }

  async function doExportShare() {
    setExportModalVisible(false);
    Alert.alert('Export unavailable', 'Sensitive data export is disabled in this build.');
  }

  async function doExportSaveToFolderAndroid() {
    setExportModalVisible(false);
    Alert.alert('Export unavailable', 'Sensitive data export is disabled in this build.');
  }

  async function pickImportFile() {
    try {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        await new Promise((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json,application/json,text/plain,.txt';
          input.onchange = () => {
            const file = input.files && input.files[0] ? input.files[0] : null;
            if (file) {
              setImportPickedFile({
                name: file.name || 'selected file',
                file,
                size: file.size,
                mimeType: file.type || 'application/json',
              });
            }
            resolve();
          };
          input.click();
        });
        return;
      }

      const DocumentPickerModule = require('expo-document-picker');
      const DocumentPicker = DocumentPickerModule?.default || DocumentPickerModule;
      if (!DocumentPicker?.getDocumentAsync) {
        Alert.alert('Import', 'File picker is not available.');
        return;
      }

      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'text/csv', 'application/json', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (res?.canceled) return;
      const asset = Array.isArray(res?.assets) ? res.assets[0] : null;
      if (!asset?.uri) return;

      setImportPickedFile({
        name: asset.name || 'selected file',
        uri: asset.uri,
        size: asset.size,
        mimeType: asset.mimeType,
      });
    } catch (e) {
      Alert.alert('Import failed', e?.message || String(e));
    }
  }

  function normalizeImportedDirectory(payload) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const normalized = {
      children: Array.isArray(source.children) ? source.children.filter(Boolean) : [],
      parents: Array.isArray(source.parents) ? source.parents.filter(Boolean) : [],
      therapists: Array.isArray(source.therapists) ? source.therapists.filter(Boolean) : [],
    };
    const total = normalized.children.length + normalized.parents.length + normalized.therapists.length;
    if (!total) {
      throw new Error('Import file must contain at least one of: children, parents, therapists.');
    }
    return normalized;
  }

  async function readImportFileContents() {
    if (!importPickedFile) throw new Error('Choose a file to import.');
    if (importPickedFile.file && typeof importPickedFile.file.text === 'function') {
      return importPickedFile.file.text();
    }
    if (importPickedFile.uri) {
      return FileSystem.readAsStringAsync(importPickedFile.uri, { encoding: FileSystem.EncodingType.UTF8 });
    }
    throw new Error('Selected file could not be read.');
  }

  async function doImportSelectedFile() {
    try {
      setImportBusy(true);
      const raw = await readImportFileContents();
      let parsed = null;
      try {
        parsed = JSON.parse(String(raw || ''));
      } catch (_) {
        throw new Error('Import currently supports JSON files with children, parents, and therapists arrays.');
      }

      const normalized = normalizeImportedDirectory(parsed);
      await Api.mergeDirectory(normalized);
      await fetchAndSync({ force: true });
      setImportModalVisible(false);
      setImportPickedFile(null);
      Alert.alert(
        'Import complete',
        `Imported ${normalized.children.length} students, ${normalized.parents.length} parents, and ${normalized.therapists.length} staff records.`
      );
    } catch (e) {
      Alert.alert('Import failed', e?.message || String(e));
    } finally {
      setImportBusy(false);
    }
  }

  const [showIds, setShowIds] = useState(false);

  const [orgAddress, setOrgAddress] = useState('');
  const [orgLat, setOrgLat] = useState('');
  const [orgLng, setOrgLng] = useState('');
  const [dropZoneMiles, setDropZoneMiles] = useState('1');
  const [orgArrivalEnabled, setOrgArrivalEnabled] = useState(true);
  const [keyboardBottomPad, setKeyboardBottomPad] = useState(24);

  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState('');
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const placesSessionTokenRef = useRef(String(Math.random()).slice(2));
  const addressRequestIdRef = useRef(0);
  const suppressAutocompleteRef = useRef(0);

  function formatAuditAction(action) {
    const normalized = String(action || '').trim();
    if (!normalized) return 'Unknown action';
    return normalized
      .split('.')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function formatAuditTimestamp(value) {
    const when = new Date(value || '');
    if (Number.isNaN(when.getTime())) return 'Unknown time';
    try {
      return when.toLocaleString();
    } catch (_) {
      return when.toISOString();
    }
  }

  function buildAuditSummary(entry) {
    const details = entry?.details && typeof entry.details === 'object' ? entry.details : {};
    if (typeof details.targetRole === 'string' && details.targetRole) return `Role: ${details.targetRole}`;
    if (typeof details.roleCount === 'number') return `${details.roleCount} role mappings updated`;
    if (details.scopeChanged) return 'Role or scope changed';
    if (details.passwordChanged) return 'Password changed';
    if (details.hasLocation) return 'Location values updated';
    if (typeof details.orgArrivalEnabled === 'boolean') return details.orgArrivalEnabled ? 'Arrival detection enabled' : 'Arrival detection disabled';
    return '';
  }

  async function loadAuditLogs() {
    if (!isAdminRole(user?.role)) return;
    try {
      setAuditLoading(true);
      setAuditError('');
      const res = await Api.getAuditLogs(8);
      setAuditLogs(Array.isArray(res?.items) ? res.items : []);
    } catch (e) {
      setAuditError(String(e?.message || 'Could not load recent admin activity.'));
      setAuditLogs([]);
    } finally {
      setAuditLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    initIdVisibilityFromStorage().then((v) => { if (mounted) setShowIds(!!v); }).catch(() => {});
    (async () => {
      try {
        // Prefer server-backed org settings when available (keeps all devices in sync).
        try {
          const remote = await Api.getOrgSettings();
          const item = remote && remote.ok ? remote.item : null;
          if (mounted && item && typeof item === 'object') {
            if (typeof item.orgArrivalEnabled === 'boolean') setOrgArrivalEnabled(!!item.orgArrivalEnabled);
            if (item.address) {
              suppressAutocompleteRef.current = 1;
              setOrgAddress(String(item.address));
            }
            if (typeof item.lat === 'number') setOrgLat(String(item.lat));
            if (typeof item.lng === 'number') setOrgLng(String(item.lng));
            if (typeof item.dropZoneMiles === 'number') setDropZoneMiles(String(item.dropZoneMiles));
            // Cache locally as fallback.
            try {
              await writeBooleanSetting(ORG_ARRIVAL_KEY, item.orgArrivalEnabled !== false);
              await writeJsonSetting(BUSINESS_ADDR_KEY, {
                address: item.address,
                lat: item.lat,
                lng: item.lng,
                dropZoneMiles: item.dropZoneMiles,
              });
            } catch (e) {}
            return;
          }
        } catch (e) {
          // ignore; fall back to AsyncStorage
        }

        const orgRaw = await AsyncStorage.getItem(ORG_ARRIVAL_KEY);
        if (!mounted) return;
        // default to enabled when not set
        setOrgArrivalEnabled(orgRaw !== '0');

        const raw = await readJsonSetting(BUSINESS_ADDR_KEY, null);
        if (!mounted) return;
        if (raw) {
          const parsed = raw;
          if (parsed && typeof parsed === 'object') {
            if (parsed.address) {
              suppressAutocompleteRef.current = 1;
              setOrgAddress(String(parsed.address));
            }
            if (typeof parsed.lat === 'number') setOrgLat(String(parsed.lat));
            if (typeof parsed.lng === 'number') setOrgLng(String(parsed.lng));
            if (typeof parsed.dropZoneMiles === 'number') setDropZoneMiles(String(parsed.dropZoneMiles));
          }
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e) => {
      const h = e?.endCoordinates?.height;
      // Keep it minimal; KeyboardAvoidingView handles most of the shift.
      setKeyboardBottomPad(24 + (Number.isFinite(h) ? Math.min(h, 280) : 200));
    };
    const onHide = () => setKeyboardBottomPad(24);

    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);
    return () => {
      try { subShow?.remove?.(); } catch (e) {}
      try { subHide?.remove?.(); } catch (e) {}
    };
  }, []);

  const toggleShowIds = () => { const next = !showIds; setShowIds(next); setIdVisibilityEnabled(next); };

  function getOrgSettingsErrorMessage(error, fallback) {
    const message = String(error?.message || error || '').trim();
    if (!message) return fallback;
    if (/permission|forbidden|unauthorized/i.test(message)) {
      return 'Your account is signed in, but it does not have permission to change organization arrival settings.';
    }
    if (/network|timed out|failed to fetch/i.test(message)) {
      return 'The save request could not reach the server. Confirm the API is running and try again.';
    }
    return message;
  }

  async function toggleOrgArrival() {
    if (!hasCapability('settings:system')) {
      Alert.alert('Permission required', 'Your account cannot change organization settings.');
      return;
    }
    const next = !orgArrivalEnabled;
    setOrgArrivalEnabled(next);
    try {
      await Api.updateOrgSettings({
        address: orgAddress,
        lat: Number.isFinite(Number(orgLat)) ? Number(orgLat) : null,
        lng: Number.isFinite(Number(orgLng)) ? Number(orgLng) : null,
        dropZoneMiles: Number.isFinite(Number(dropZoneMiles)) ? Number(dropZoneMiles) : null,
        orgArrivalEnabled: next,
      });
      await writeBooleanSetting(ORG_ARRIVAL_KEY, next);
    } catch (e) {
      // revert on failure
      setOrgArrivalEnabled(!next);
      Alert.alert('Error', getOrgSettingsErrorMessage(e, 'Could not update organization arrival detection setting.'));
    }
  }

  async function saveArrivalControls() {
    if (!hasCapability('settings:system')) {
      Alert.alert('Permission required', 'Your account cannot change organization settings.');
      return;
    }
    let latNum = Number(orgLat);
    let lngNum = Number(orgLng);
    const milesNum = Number(dropZoneMiles);

    if (!Number.isFinite(milesNum) || milesNum <= 0) {
      Alert.alert('Invalid Drop Zone', 'Drop Zone must be a number greater than 0 (miles).');
      return;
    }

    // If lat/lng are not set, try to derive them from the typed address.
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      const raw = String(orgAddress || '').trim();

      // Support simple "lat, lng" paste.
      const m = raw.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (m) {
        latNum = Number(m[1]);
        lngNum = Number(m[2]);
        if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
          setOrgLat(String(latNum));
          setOrgLng(String(lngNum));
        }
      } else if (raw) {
        try {
          const Location = require('expo-location');
          const results = await Location.geocodeAsync(raw);
          const first = Array.isArray(results) ? results[0] : null;
          if (first && Number.isFinite(first.latitude) && Number.isFinite(first.longitude)) {
            latNum = Number(first.latitude);
            lngNum = Number(first.longitude);
            setOrgLat(String(latNum));
            setOrgLng(String(lngNum));
          }
        } catch (e) {
          // ignore and fall through to validation error
        }
      }
    }

    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      Alert.alert('Missing location', 'Enter an address (or “lat, lng”) or tap “Use my current location”.');
      return;
    }

    const obj = {
      address: orgAddress || `${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`,
      lat: latNum,
      lng: lngNum,
      dropZoneMiles: milesNum,
    };
    try {
      await Api.updateOrgSettings({ ...obj, orgArrivalEnabled });
      await writeJsonSetting(BUSINESS_ADDR_KEY, obj);
      Alert.alert('Saved', 'Arrival detection controls updated.');
    } catch (e) {
      Alert.alert('Error', getOrgSettingsErrorMessage(e, 'Could not save arrival detection controls.'));
    }
  }

  async function useCurrentLocationForOrg() {
    try {
      const Location = require('expo-location');
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Location required', 'Please grant location permission to set the organization location.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      setOrgLat(String(pos.coords.latitude));
      setOrgLng(String(pos.coords.longitude));

      // Prefer a human-readable street address if available.
      let formatted = '';
      try {
        const results = await Location.reverseGeocodeAsync({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        const first = Array.isArray(results) ? results[0] : null;
        if (first) {
          const line1 = [first.streetNumber, first.street]
            .filter(Boolean)
            .join(' ')
            .trim()
            || String(first.name || '').trim()
            || String(first.district || '').trim();
          const cityRegion = [first.city, first.subregion, first.region].filter(Boolean).join(', ').trim();
          const line2 = [cityRegion, first.postalCode].filter(Boolean).join(' ').trim();
          formatted = [line1, line2, first.country].filter(Boolean).join(', ').trim();
        }
      } catch (e) {
        // ignore; fall back to lat/lng
      }

      // Fallback: if Expo reverse geocode didn't give a useful address, try Google Geocoding API.
      if (!formatted) {
        const key = String(GOOGLE_PLACES_API_KEY || '').trim();
        if (key) {
          try {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(String(lat))},${encodeURIComponent(String(lng))}&key=${encodeURIComponent(key)}`;
            const res = await fetch(url);
            const json = await res.json();
            const addr = json?.results?.[0]?.formatted_address;
            if (addr) formatted = String(addr);
          } catch (e) {
            // ignore
          }
        }
      }

      suppressAutocompleteRef.current = 1;
      setOrgAddress(formatted || `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`);
    } catch (e) {
      console.warn('admin arrival controls: location failed', e?.message || e);
      Alert.alert('Location failed', 'Could not get current location.');
    }
  }

  async function fetchAddressSuggestions(query) {
    const key = String(GOOGLE_PLACES_API_KEY || '').trim();
    if (!key) return { items: [], error: '' };

    const sessiontoken = placesSessionTokenRef.current;

    // Prefer the newer Places API (v1) when available.
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text',
          ...(Platform.OS === 'ios' && APP_BUNDLE_ID ? { 'X-Ios-Bundle-Identifier': APP_BUNDLE_ID } : {}),
        },
        body: JSON.stringify({
          input: query,
          sessionToken: sessiontoken,
        }),
      });

      const json = await res.json();
      const suggestions = Array.isArray(json?.suggestions) ? json.suggestions : [];
      const items = suggestions
        .map((s) => s?.placePrediction)
        .filter(Boolean)
        .map((p) => ({
          description: p?.text?.text || '',
          place_id: p?.placeId || '',
        }))
        .filter((x) => x.description && x.place_id);

      if (items.length) return { items, error: '' };

      // v1 can return errors in different shapes; surface something helpful.
      if (json?.error?.message) return { items: [], error: String(json.error.message) };
      // If response is OK but empty, don't show an error.
    } catch (e) {
      // Fall back to legacy endpoint below.
    }

    // Legacy web service endpoint.
    try {
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&types=address&key=${encodeURIComponent(key)}&sessiontoken=${encodeURIComponent(sessiontoken)}`;
      const res = await fetch(url, {
        headers: {
          ...(Platform.OS === 'ios' && APP_BUNDLE_ID ? { 'X-Ios-Bundle-Identifier': APP_BUNDLE_ID } : {}),
        },
      });
      const json = await res.json();
      if (json?.status !== 'OK') {
        const msg = json?.error_message ? String(json.error_message) : (json?.status ? `Google Places error: ${json.status}` : 'Google Places error');
        return { items: [], error: msg };
      }
      const items = (json?.predictions || []).map((p) => ({
        description: p.description,
        place_id: p.place_id,
      }));
      return { items, error: '' };
    } catch (e) {
      return { items: [], error: 'Network error contacting Google Places.' };
    }
  }

  async function applyPlaceSelection(place) {
    if (!place) return;
    suppressAutocompleteRef.current = 1;
    setOrgAddress(place.description);
    setAddressSuggestions([]);
    setAddressError('');

    const key = String(GOOGLE_PLACES_API_KEY || '').trim();
    if (!key) return;

    const sessiontoken = placesSessionTokenRef.current;

    // Try v1 place details first.
    try {
      const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(place.place_id)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'location,formattedAddress',
          ...(Platform.OS === 'ios' && APP_BUNDLE_ID ? { 'X-Ios-Bundle-Identifier': APP_BUNDLE_ID } : {}),
        },
      });
      const json = await res.json();
      if (json?.location && Number.isFinite(json.location.latitude) && Number.isFinite(json.location.longitude)) {
        setOrgLat(String(json.location.latitude));
        setOrgLng(String(json.location.longitude));
      }
      if (json?.formattedAddress) {
        setOrgAddress(String(json.formattedAddress));
      }
      if (json?.error?.message) {
        setAddressError(String(json.error.message));
      }
      return;
    } catch (e) {
      // fall back
    }

    // Legacy place details.
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(place.place_id)}&fields=geometry,formatted_address&key=${encodeURIComponent(key)}&sessiontoken=${encodeURIComponent(sessiontoken)}`;
      const res = await fetch(url, {
        headers: {
          ...(Platform.OS === 'ios' && APP_BUNDLE_ID ? { 'X-Ios-Bundle-Identifier': APP_BUNDLE_ID } : {}),
        },
      });
      const json = await res.json();
      if (json?.status !== 'OK') {
        const msg = json?.error_message ? String(json.error_message) : (json?.status ? `Google Places error: ${json.status}` : 'Google Places error');
        setAddressError(msg);
        return;
      }
      const loc = json?.result?.geometry?.location;
      if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
        setOrgLat(String(loc.lat));
        setOrgLng(String(loc.lng));
      }
      if (json?.result?.formatted_address) {
        setOrgAddress(String(json.result.formatted_address));
      }
    } catch (e) {
      // ignore; user can still save and we'll try geocode on save
    }
  }

  useEffect(() => {
    if (suppressAutocompleteRef.current > 0) {
      suppressAutocompleteRef.current -= 1;
      setAddressSuggestions([]);
      setAddressLoading(false);
      setAddressError('');
      return;
    }

    const key = String(GOOGLE_PLACES_API_KEY || '').trim();
    if (!key) return;

    const query = String(orgAddress || '').trim();
    if (query.length < 3) {
      setAddressSuggestions([]);
      setAddressLoading(false);
      return;
    }

    const requestId = ++addressRequestIdRef.current;
    setAddressLoading(true);
    setAddressError('');
    const t = setTimeout(() => {
      fetchAddressSuggestions(query)
        .then(({ items, error }) => {
          if (requestId !== addressRequestIdRef.current) return;
          setAddressSuggestions(items);
          setAddressError(error || '');
        })
        .catch(() => {
          if (requestId !== addressRequestIdRef.current) return;
          setAddressSuggestions([]);
          setAddressError('Network error contacting Google Places.');
        })
        .finally(() => {
          if (requestId !== addressRequestIdRef.current) return;
          setAddressLoading(false);
        });
    }, 250);

    return () => clearTimeout(t);
  }, [orgAddress]);

  function DirectoryBanner({ label, onOpen, onToggle, open, childrenPreview, count, rightAction }) {
    return (
      <View style={{ marginTop: 12 }}>
        <TouchableOpacity style={styles.banner} activeOpacity={0.85} onPress={onToggle}>
          <View style={styles.bannerContent}>
            <View style={styles.bannerTextWrap}>
              <View style={styles.bannerLabelRow}>
                <Text style={styles.bannerLabel} numberOfLines={1}>{label}</Text>
                {typeof count === 'number' ? (
                  <View style={styles.dirCount}><Text style={{ color: '#111827', fontWeight: '700', fontSize: 12 }}>{count}</Text></View>
                ) : null}
              </View>
              <Text style={styles.bannerHint}>Tap to view</Text>
            </View>
            <View style={styles.bannerActions}>
              <TouchableOpacity onPress={onOpen} style={styles.openIcon} accessibilityLabel={`Open ${label} list`}>
                <MaterialIcons name="open-in-new" size={18} color="#2563eb" />
              </TouchableOpacity>
              <TouchableOpacity onPress={onToggle} style={styles.previewIcon} accessibilityLabel={`Preview ${label}`}>
                <MaterialIcons name={open ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={20} color={open ? '#2563eb' : '#6b7280'} />
              </TouchableOpacity>
            </View>
            {rightAction ? (
              <View style={styles.bannerRightAction}>{rightAction}</View>
            ) : null}
          </View>
        </TouchableOpacity>
        {open ? (
          <View style={{ marginTop: 8 }}>
            {childrenPreview}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <ScreenWrapper
      bannerShowBack={false}
      bannerLeft={<HeaderAlertButton />}
      bannerRight={SHOW_IMPORT_EXPORT_CONTROLS ? <HeaderRightButtons /> : null}
      style={styles.container}
    >
      <Modal
        visible={exportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setExportModalVisible(false)}
      >
        <Pressable style={styles.overlayBackdrop} onPress={() => setExportModalVisible(false)}>
          <Pressable style={styles.overlayCard} onPress={() => {}}>
            <Text style={styles.overlayTitle}>Export</Text>
            <Text style={styles.overlaySub}>Select a destination for your export.</Text>

            <TouchableOpacity style={styles.overlayOption} onPress={doExportShare} accessibilityLabel="Export via share">
              <MaterialIcons name="share" size={18} color="#374151" />
              <Text style={styles.overlayOptionText}>Share</Text>
            </TouchableOpacity>

            {Platform.OS === 'android' ? (
              <TouchableOpacity style={styles.overlayOption} onPress={doExportSaveToFolderAndroid} accessibilityLabel="Export and save to folder">
                <MaterialIcons name="folder" size={18} color="#374151" />
                <Text style={styles.overlayOptionText}>Save to folder</Text>
              </TouchableOpacity>
            ) : null}

            <View style={styles.overlayActions}>
              <TouchableOpacity style={styles.overlayCancel} onPress={() => setExportModalVisible(false)}>
                <Text style={styles.overlayCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={importModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setImportModalVisible(false)}
      >
        <Pressable style={styles.overlayBackdrop} onPress={() => setImportModalVisible(false)}>
          <Pressable style={styles.overlayCard} onPress={() => {}}>
            <Text style={styles.overlayTitle}>Import</Text>
            <Text style={styles.overlaySub}>Choose a JSON directory export that contains children, parents, and therapists arrays.</Text>

            <TouchableOpacity style={styles.overlayOption} onPress={pickImportFile} accessibilityLabel="Choose import file" disabled={importBusy}>
              <MaterialIcons name="upload-file" size={18} color="#374151" />
              <Text style={styles.overlayOptionText}>{importPickedFile?.name ? `Selected: ${importPickedFile.name}` : 'Choose file'}</Text>
            </TouchableOpacity>

            {importPickedFile ? (
              <Text style={styles.overlayMetaText}>
                {`${importPickedFile.name}${importPickedFile.size ? ` • ${Math.max(1, Math.round(importPickedFile.size / 1024))} KB` : ''}`}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[styles.overlayOption, !importPickedFile || importBusy ? styles.overlayOptionDisabled : null]}
              onPress={doImportSelectedFile}
              accessibilityLabel="Import selected file"
              disabled={!importPickedFile || importBusy}
            >
              <MaterialIcons name="file-download" size={18} color={(!importPickedFile || importBusy) ? '#9ca3af' : '#374151'} />
              <Text style={[styles.overlayOptionText, !importPickedFile || importBusy ? styles.overlayOptionDisabledText : null]}>
                {importBusy ? 'Importing...' : 'Import selected file'}
              </Text>
            </TouchableOpacity>

            <View style={styles.overlayActions}>
              <TouchableOpacity style={styles.overlayCancel} onPress={() => setImportModalVisible(false)}>
                <Text style={styles.overlayCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 180 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
            {isWeb ? (
              <View style={{ marginBottom: 16 }}>
                <View style={{ backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#e5e7eb', padding: 18, shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: '#0f172a' }}>Admin Dashboard</Text>
                  <Text style={{ marginTop: 6, color: '#64748b' }}>Key operations, directories, and alerts in one place.</Text>
                  <View style={{ flexDirection: 'row', marginTop: 16 }}>
                    {[
                      { label: 'Students', value: (children || []).length },
                      { label: 'Parents', value: (parents || []).length },
                      { label: 'Faculty', value: facultyCount },
                      { label: 'Pending alerts', value: pendingAlertCount },
                    ].map((item, index) => (
                      <View key={item.label} style={{ flex: 1, padding: 14, borderRadius: 14, backgroundColor: index === 3 ? '#fff1f2' : '#f8fafc', borderWidth: 1, borderColor: index === 3 ? '#fecdd3' : '#e2e8f0', marginRight: index === 3 ? 0 : 12 }}>
                        <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{item.label}</Text>
                        <Text style={{ marginTop: 8, fontSize: 26, fontWeight: '800', color: index === 3 ? '#be123c' : '#0f172a' }}>{item.value}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            ) : null}

            <View style={styles.dirGridRow}>
              <TouchableOpacity
                style={[styles.dirTile, showStudentsPreview ? styles.dirTileActive : null]}
                onPress={() => toggleDirectoryPreview('students')}
                accessibilityLabel="Toggle Students preview"
              >
                <View style={styles.dirTileTop}>
                  <View style={styles.dirTileIconWrap}>
                    <Image source={studentsIcon} style={styles.dirTileIconImage} />
                    <Text style={styles.dirTileIconBadgeText}>{(children || []).length}</Text>
                  </View>
                </View>
                <Text style={styles.dirTileLabel}>Students</Text>
                <TouchableOpacity onPress={openStudentDirectory} style={styles.dirTileOpen} accessibilityLabel="Open Students list">
                  <MaterialIcons name="open-in-new" size={18} color="#2563eb" />
                </TouchableOpacity>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dirTile, showFacultyPreview ? styles.dirTileActive : null]}
                onPress={() => toggleDirectoryPreview('faculty')}
                accessibilityLabel="Toggle Faculty preview"
              >
                <View style={styles.dirTileTop}>
                  <View style={styles.dirTileIconWrap}>
                    <Image source={facultyIcon} style={styles.dirTileIconImage} />
                    <Text style={styles.dirTileIconBadgeText}>{facultyCount}</Text>
                  </View>
                </View>
                <Text style={styles.dirTileLabel}>Faculty</Text>
                <TouchableOpacity onPress={openFacultyDirectory} style={styles.dirTileOpen} accessibilityLabel="Open Faculty list">
                  <MaterialIcons name="open-in-new" size={18} color="#2563eb" />
                </TouchableOpacity>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dirTile, { marginRight: 0 }, showParentsPreview ? styles.dirTileActive : null]}
                onPress={() => toggleDirectoryPreview('parents')}
                accessibilityLabel="Toggle Parents preview"
              >
                <View style={styles.dirTileTop}>
                  <View style={styles.dirTileIconWrap}>
                    <Image source={parentsIcon} style={styles.dirTileIconImage} />
                    <Text style={styles.dirTileIconBadgeText}>{(parents || []).length}</Text>
                  </View>
                </View>
                <Text style={styles.dirTileLabel}>Parents</Text>
                <TouchableOpacity onPress={openParentDirectory} style={styles.dirTileOpen} accessibilityLabel="Open Parents list">
                  <MaterialIcons name="open-in-new" size={18} color="#2563eb" />
                </TouchableOpacity>
              </TouchableOpacity>
            </View>

            {showStudentsPreview ? (
              <View style={{ marginTop: 10 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingBottom: 8 }}>
                  {(children || []).slice(0, 8).map((c) => (
                    <TouchableOpacity key={c.id} style={styles.previewCard} onPress={() => navigation.navigate('ChildDetail', { childId: c.id })}>
                      <Image source={avatarSourceFor(c)} style={styles.previewAvatar} />
                      <Text numberOfLines={1} style={styles.previewName}>{c.name}</Text>
                      <Text numberOfLines={1} style={styles.previewMeta}>{c.age}</Text>
                    </TouchableOpacity>
                  ))}
                  {!(children || []).length ? (
                    <View style={[styles.previewCard, { alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ color: '#6b7280', fontSize: 12, textAlign: 'center' }}>No students enrolled yet.</Text>
                    </View>
                  ) : null}
                </ScrollView>
              </View>
            ) : null}

            {showFacultyPreview ? (
              <View style={{ marginTop: 10 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingBottom: 8 }}>
                  {(therapists || []).slice(0, 12).map((f) => (
                    <TouchableOpacity key={f.id} style={styles.previewCard} onPress={() => navigation.navigate('FacultyDetail', { facultyId: f.id })}>
                      <Image source={avatarSourceFor(f)} style={styles.previewAvatar} />
                      <Text numberOfLines={1} style={styles.previewName}>{f.name || (f.firstName ? `${f.firstName} ${f.lastName}` : (f.role || 'Staff'))}</Text>
                      <View style={styles.previewIconRow}>
                        <TouchableOpacity activeOpacity={0.85} onPress={() => { if (f.phone) { try { Linking.openURL(`tel:${f.phone}`); } catch (e) {} } else { Alert.alert('No phone', 'No phone number available for this staff member.'); } }} style={styles.previewIconTouch} accessibilityLabel={`Call ${f.name}`}>
                          <MaterialIcons name="call" size={16} color={f.phone ? '#2563eb' : '#9ca3af'} />
                        </TouchableOpacity>
                        <TouchableOpacity activeOpacity={0.85} onPress={() => { if (f.email) { try { Linking.openURL(`mailto:${f.email}`); } catch (e) {} } else { Alert.alert('No email', 'No email address available for this staff member.'); } }} style={styles.previewIconTouch} accessibilityLabel={`Email ${f.name}`}>
                          <MaterialIcons name="email" size={16} color={f.email ? '#2563eb' : '#9ca3af'} />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {showParentsPreview ? (
              <View style={{ marginTop: 10 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingBottom: 8 }}>
                  {(parents || []).slice(0, 12).map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.previewCard}
                      onPress={() => {
                        try {
                          if (navigation && navigation.push) navigation.push('ParentDetail', { parentId: p.id });
                          else navigation.navigate('ParentDetail', { parentId: p.id });
                        } catch (e) {
                          try { navigation.navigate('ParentDetail', { parentId: p.id }); } catch (e2) { console.warn(e2); }
                        }
                      }}
                    >
                  <Image source={avatarSourceFor(p)} style={styles.previewAvatar} />
                  <Text numberOfLines={1} style={styles.previewName}>{p.firstName ? `${p.firstName} ${p.lastName}` : p.name}</Text>
                  <View style={styles.previewIconRow}>
                    <TouchableOpacity activeOpacity={0.85} onPress={() => { if (p.phone) { try { Linking.openURL(`tel:${p.phone}`); } catch (e) {} } else { Alert.alert('No phone', 'No phone number available for this parent.'); } }} style={styles.previewIconTouch} accessibilityLabel={`Call ${p.firstName || p.name}`}>
                      <MaterialIcons name="call" size={16} color={p.phone ? '#2563eb' : '#9ca3af'} />
                    </TouchableOpacity>
                    <TouchableOpacity activeOpacity={0.85} onPress={() => { if (p.email) { try { Linking.openURL(`mailto:${p.email}`); } catch (e) {} } else { Alert.alert('No email', 'No email address available for this parent.'); } }} style={styles.previewIconTouch} accessibilityLabel={`Email ${p.firstName || p.name}`}>
                      <MaterialIcons name="email" size={16} color={p.email ? '#2563eb' : '#9ca3af'} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
                  {!(parents || []).length ? (
                    <View style={[styles.previewCard, { alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ color: '#6b7280', fontSize: 12, textAlign: 'center' }}>No parents on file yet.</Text>
                    </View>
                  ) : null}
                </ScrollView>
              </View>
            ) : null}
        {!isTabletLayout ? <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#0f172a' }}>Admin Workspace</Text>
          <Text style={{ marginTop: 4, marginBottom: 10, color: '#64748b' }}>
            Signed in as {currentRoleLabel}. The admin redesign now splits office operations from clinical workflow entry points.
          </Text>
          {adminNavSplitSections.map((section) => (
            <View
              key={section.key}
              style={{
                marginBottom: 14,
                borderWidth: 1,
                borderColor: '#dbe4f0',
                borderRadius: 16,
                backgroundColor: '#f8fbff',
                padding: 12,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a' }}>{section.title}</Text>
              <Text style={{ marginTop: 4, marginBottom: 10, color: '#64748b', lineHeight: 18 }}>{section.subtitle}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                {section.items.map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    onPress={() => {
                      if (item.disabled) {
                        Alert.alert('Permission required', 'Your account does not currently have access to this admin area.');
                        return;
                      }
                      navigation.navigate(item.key);
                    }}
                    style={{
                      width: '48%',
                      marginBottom: 10,
                      backgroundColor: item.disabled ? '#f8fafc' : '#fff',
                      borderWidth: 1,
                      borderColor: item.disabled ? '#e2e8f0' : '#dbe4f0',
                      borderRadius: 14,
                      padding: 14,
                      minHeight: 124,
                      opacity: item.disabled ? 0.7 : 1,
                    }}
                    accessibilityLabel={`Open ${item.label}`}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <MaterialIcons name={item.icon} size={24} color={item.disabled ? '#94a3b8' : '#2563eb'} />
                      {item.badge ? (
                        <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{item.badge > 99 ? '99+' : item.badge}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={{ marginTop: 10, fontWeight: '700', color: '#0f172a' }}>{item.label}</Text>
                    <Text style={{ marginTop: 6, color: '#64748b', fontSize: 12, lineHeight: 18 }}>{item.description}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </View> : (
          <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#0f172a' }}>Dashboard</Text>
            <Text style={{ marginTop: 4, color: '#64748b' }}>Use the left navigation rail for Students, Staff, Scheduling, Programs & Goals, Data & Reports, Billing, Compliance, Communication, and Settings.</Text>
          </View>
        )}

        {/* Program / Campus modules (feature-flagged) */}
        {(() => {
          const moduleTiles = [
            tenantFlags.attendanceModule !== false ? { key: 'Attendance', label: 'Attendance', icon: 'event-available' } : null,
            tenantFlags.programDirectory !== false ? { key: 'ProgramDirectory', label: 'Program Directory', icon: 'business' } : null,
            tenantFlags.campusDirectory !== false ? { key: 'CampusDirectory', label: 'Campus Directory', icon: 'apartment' } : null,
            tenantFlags.programDocuments !== false ? { key: 'ProgramDocuments', label: 'Program Docs', icon: 'description' } : null,
            tenantFlags.campusDocuments !== false ? { key: 'CampusDocuments', label: 'Campus Docs', icon: 'folder' } : null,
          ].filter(Boolean);
          if (!moduleTiles.length) return null;
          return (
            <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Modules</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {moduleTiles.map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    onPress={() => navigation.navigate(m.key)}
                    style={{
                      width: '48%',
                      marginRight: '2%',
                      marginBottom: 10,
                      backgroundColor: '#fff',
                      borderWidth: 1,
                      borderColor: '#e5e7eb',
                      borderRadius: 14,
                      padding: 14,
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    accessibilityLabel={`Open ${m.label}`}
                  >
                    <MaterialIcons name={m.icon} size={24} color="#2563eb" />
                    <Text style={{ marginTop: 8, fontWeight: '700', color: '#0f172a', textAlign: 'center' }}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })()}
        {/* IDs (admin) - moved below Directory */}
        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Account IDs</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ fontSize: 14 }}>Show internal account ID numbers</Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Toggle to show internal account ID numbers in profiles.</Text>
            </View>
            <ImageToggle value={showIds} onValueChange={toggleShowIds} accessibilityLabel="Show internal account IDs" />
          </View>
        </View>

        {/* Arrival Detection Controls (admin) */}
        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Arrival Detection Controls</Text>
          <Text style={{ fontSize: 12, color: '#6b7280' }}>
            Set the organization location and the “Drop Zone” (Radius in miles, used to determine when a parent has arrived.)
          </Text>

          <View style={styles.formCard}>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.toggleTitle}>Arrival detection enabled</Text>
                <Text style={styles.toggleHint}>If turned off, arrival detection does not run for anyone (even if enabled in their settings).</Text>
              </View>
              <ImageToggle value={orgArrivalEnabled} onValueChange={toggleOrgArrival} accessibilityLabel="Arrival detection enabled" />
            </View>

            <Text style={styles.fieldLabel}>Organization Address</Text>
            <TextInput
              value={orgAddress}
              onChangeText={setOrgAddress}
              placeholder="Has not been set"
              style={styles.input}
              autoCapitalize="words"
            />

            {addressLoading ? (
              <Text style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>Searching…</Text>
            ) : null}

            {!addressLoading && addressError ? (
              <Text style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>{addressError}</Text>
            ) : null}

            {addressSuggestions.length ? (
              <View style={styles.suggestionsBox}>
                {addressSuggestions.slice(0, 6).map((s, idx) => (
                  <TouchableOpacity
                    key={s.place_id || `${s.description}-${idx}`}
                    onPress={() => applyPlaceSelection(s)}
                    style={[styles.suggestionRow, idx === addressSuggestions.length - 1 ? { borderBottomWidth: 0 } : null]}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="place" size={16} color="#6b7280" />
                    <Text style={styles.suggestionText} numberOfLines={2}>{s.description}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10 }}>
              <TouchableOpacity onPress={useCurrentLocationForOrg} style={[styles.locationActionBtn, { marginTop: 0, marginRight: 10 }]} accessibilityLabel="Use my current location">
                <Image source={currentLocationIcon} style={styles.locationActionIconImage} />
                <Text style={styles.locationActionText}>Current Location</Text>
              </TouchableOpacity>

              <View style={{ width: 140 }}>
                <Text style={[styles.fieldLabel, { marginTop: 0 }]}>Drop Zone (miles)</Text>
                <TextInput
                  value={dropZoneMiles}
                  onChangeText={setDropZoneMiles}
                  placeholder="1"
                  style={styles.input}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <TouchableOpacity onPress={saveArrivalControls} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isAdminRole(user?.role) ? (
          <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 12 }}>
            <View style={styles.auditHeaderRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 4 }}>Recent Admin Activity</Text>
                <Text style={{ fontSize: 12, color: '#6b7280' }}>Privileged settings and managed-user changes recorded by the API.</Text>
              </View>
              <TouchableOpacity onPress={loadAuditLogs} style={styles.auditRefreshBtn} disabled={auditLoading}>
                <MaterialIcons name="refresh" size={16} color="#2563eb" />
                <Text style={styles.auditRefreshText}>{auditLoading ? 'Loading...' : 'Refresh'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formCard}>
              {auditError ? <Text style={styles.auditErrorText}>{auditError}</Text> : null}
              {!auditError && !auditLogs.length && !auditLoading ? (
                <Text style={styles.auditEmptyText}>No audit entries recorded yet.</Text>
              ) : null}
              {(auditLogs || []).map((entry) => {
                const summary = buildAuditSummary(entry);
                return (
                  <View key={entry.id || `${entry.action}-${entry.createdAt}`} style={styles.auditRow}>
                    <View style={styles.auditRowTop}>
                      <Text style={styles.auditActionText}>{formatAuditAction(entry.action)}</Text>
                      <Text style={[styles.auditStatusPill, entry.status === 'success' ? styles.auditStatusSuccess : styles.auditStatusError]}>
                        {String(entry.status || 'success').toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.auditMetaText}>{formatAuditTimestamp(entry.createdAt)}</Text>
                    <Text style={styles.auditMetaText}>Actor: {entry.actorId || 'Unknown'}{entry.targetId ? ` • Target: ${entry.targetId}` : ''}</Text>
                    {summary ? <Text style={styles.auditSummaryText}>{summary}</Text> : null}
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Permissions & Privacy section removed per request */}

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerIconBtn: {
    minWidth: 52,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    backgroundColor: 'transparent',
    ...Platform.select({
      web: {
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        backgroundColor: '#fff',
      },
      default: null,
    }),
  },
  headerIconBtnDisabled: { opacity: 0.45 },
  headerBadge: { position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  headerBadgeText: { color: '#fff', fontWeight: '800', fontSize: 10 },
  headerIconLabel: { marginTop: 2, fontSize: 9, fontWeight: '700', color: '#475569', textAlign: 'center' },

  dirGridRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  dirTile: { flex: 1, borderWidth: 1.5, borderColor: 'transparent', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginRight: 10, alignItems: 'center' },
  dirTileActive: { borderColor: '#2563eb' },
  dirTileTop: { alignItems: 'center', justifyContent: 'center', width: '100%' },
  dirTileIconWrap: { width: 74, height: 50, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  dirTileIconBadgeText: { position: 'absolute', top: -6, right: 4, minWidth: 16, textAlign: 'center', color: '#2563eb', fontWeight: '800', fontSize: 11 },
  dirTileLabel: { marginTop: 10, fontWeight: '800', color: '#111827', textAlign: 'center' },
  dirTileOpen: { position: 'absolute', right: -4, bottom: 6, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16 },
  title: { fontSize: 20, fontWeight: '700' },
  paragraph: { marginTop: 8, color: '#374151' },
  btn: { marginTop: 12, backgroundColor: '#0066FF', padding: 12, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' }
  ,
  tile: { backgroundColor: '#eef2ff', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, marginRight: 8, minWidth: 140, alignItems: 'center' },
  tileText: { fontWeight: '700', color: '#1f2937' },
  previewCard: { width: 110, padding: 8, marginRight: 8, backgroundColor: '#fff', borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#eef2f7' },
  previewAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#eee' },
  previewName: { marginTop: 8, fontWeight: '700', fontSize: 13 },
  previewMeta: { color: '#6b7280', fontSize: 12 },
  previewIconRow: { flexDirection: 'row', marginTop: 8, justifyContent: 'center', alignItems: 'center' },
  previewIconTouch: {
    width: 32,
    height: 32,
    marginHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    ...Platform.select({
      web: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: '#f1f5f9',
        marginHorizontal: 6,
        borderWidth: 1,
        borderColor: '#e6eef8',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
        elevation: 2,
      },
      default: null,
    }),
  },
  iconTile: { flex: 1, alignItems: 'center', minWidth: 72, paddingHorizontal: 6 },
  iconTileBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    position: 'relative',
    backgroundColor: 'transparent',
    ...Platform.select({
      web: {
        width: 52,
        height: 52,
        borderRadius: 12,
        backgroundColor: '#2563eb',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
        elevation: 3,
      },
      default: null,
    }),
  },
  iconTileLabel: { fontSize: 13, fontWeight: '700', color: '#111827' },
  headerImageIcon: { width: 25, height: 25, resizeMode: 'contain' },
  dirTileIconImage: { width: 75, height: 75, resizeMode: 'contain' },
  countBadge: { position: 'absolute', top: -8, right: -8, backgroundColor: '#ef4444', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  banner: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#eef2f7' },
  bannerContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  bannerTextWrap: { flex: 1, minWidth: 0, paddingRight: 8 },
  bannerLabelRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap' },
  bannerLabel: { flexShrink: 1, fontWeight: '700', color: '#111827' },
  bannerHint: { color: '#6b7280', marginTop: 4 },
  bannerActions: { flexDirection: 'row', alignItems: 'center', marginLeft: 4, flexShrink: 0 },
  bannerRightAction: { marginLeft: 8, flexShrink: 0 },
  bannerBtn: { backgroundColor: '#2563eb', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginLeft: 12 },
  openIcon: { paddingHorizontal: 8, paddingVertical: 6 },
  previewIcon: { paddingHorizontal: 8, paddingVertical: 6 },
  dirCount: { backgroundColor: '#eef2ff', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginLeft: 8 }
  ,
  formCard: { marginTop: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#eef2f7', backgroundColor: '#fff' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  toggleTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  toggleHint: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#111827', marginTop: 10, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#fff' },
  secondaryBtn: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e6eef8', backgroundColor: '#f1f5f9' },
  secondaryBtnText: { marginLeft: 8, color: '#2563eb', fontWeight: '700' },
  locationActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, minHeight: 44 },
  locationActionIconImage: { width: 30, height: 30, resizeMode: 'contain' },
  locationActionText: { marginLeft: 8, color: '#2563eb', fontWeight: '700', fontSize: 13 },
  primaryBtn: { marginTop: 12, backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  overlayBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  overlayCard: { width: '100%', maxWidth: 520, backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  overlayTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  overlaySub: { marginTop: 6, color: '#6b7280' },
  overlayOption: { marginTop: 12, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#eef2f7', backgroundColor: '#f8fafc' },
  overlayOptionText: { marginLeft: 10, fontWeight: '700', color: '#111827' },
  overlayOptionDisabled: { opacity: 0.6 },
  overlayOptionDisabledText: { color: '#6b7280' },
  overlayMetaText: { marginTop: 10, color: '#6b7280', fontSize: 12 },
  overlayActions: { marginTop: 16, flexDirection: 'row', justifyContent: 'flex-end' },
  overlayCancel: { paddingVertical: 10, paddingHorizontal: 12 },
  overlayCancelText: { color: '#2563eb', fontWeight: '700' },
  suggestionsBox: { marginTop: 6, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, backgroundColor: '#fff', overflow: 'hidden' },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  suggestionText: { marginLeft: 8, flex: 1, color: '#111827' },
  auditHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  auditRefreshBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#dbeafe', backgroundColor: '#eff6ff' },
  auditRefreshText: { marginLeft: 6, color: '#2563eb', fontWeight: '700', fontSize: 12 },
  auditRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  auditRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  auditActionText: { flex: 1, paddingRight: 8, fontWeight: '700', color: '#111827' },
  auditStatusPill: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, fontSize: 10, fontWeight: '800' },
  auditStatusSuccess: { color: '#166534', backgroundColor: '#dcfce7' },
  auditStatusError: { color: '#991b1b', backgroundColor: '#fee2e2' },
  auditMetaText: { marginTop: 4, fontSize: 12, color: '#6b7280' },
  auditSummaryText: { marginTop: 6, fontSize: 12, color: '#1f2937' },
  auditEmptyText: { fontSize: 12, color: '#6b7280' },
  auditErrorText: { fontSize: 12, color: '#b91c1c' },
});
