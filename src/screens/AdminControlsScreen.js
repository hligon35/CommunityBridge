import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, Animated, Linking, Alert, Switch, TextInput, KeyboardAvoidingView, Platform, Keyboard, Modal, Pressable, Share } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { pravatarUriFor, setIdVisibilityEnabled, initIdVisibilityFromStorage } from '../utils/idVisibility';
import { useData } from '../DataContext';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GOOGLE_PLACES_API_KEY } from '../config';
import * as FileSystem from 'expo-file-system';
import * as Api from '../Api';

const APP_BUNDLE_ID = (() => {
  try {
    // Expo projects include app.json; this is safe to read at runtime.
    const cfg = require('../../app.json');
    return cfg?.expo?.ios?.bundleIdentifier || '';
  } catch (e) {
    return '';
  }
})();

const BUSINESS_ADDR_KEY = 'business_address_v1';
const ORG_ARRIVAL_KEY = 'settings_arrival_org_enabled_v1';

export default function AdminControlsScreen() {
  const navigation = useNavigation();
  const { posts, messages, children, parents = [], therapists = [], urgentMemos = [] } = useData();
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importPickedFile, setImportPickedFile] = useState(null);
  const [showStudentsPreview, setShowStudentsPreview] = useState(false);
  const [showFacultyPreview, setShowFacultyPreview] = useState(false);
  const [showParentsPreview, setShowParentsPreview] = useState(false);

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

  // Navigation helpers
  const openMemos = () => navigation.navigate('AdminMemos');
  const openAlerts = () => navigation.navigate('AdminAlerts');
  // open community moderation screen
  const openCommunity = () => navigation.navigate('ModeratePosts');
  // open admin chat monitor (admin-only chat oversight)
  const openChats = () => navigation.navigate('AdminChatMonitor');
  const openImport = () => {
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
        <MaterialIcons name="report" size={22} color="#111827" />
        {pendingAlertCount > 0 ? (
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{pendingAlertCount}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  }

  function HeaderRightButtons() {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity
          onPress={openImport}
          style={[styles.headerIconBtn, { marginRight: 10 }]}
          accessibilityLabel="Import Data"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {/* Import is “bring data into the app” (down arrow) */}
          <MaterialIcons name="file-download" size={22} color="#111827" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setExportModalVisible(true)}
          style={styles.headerIconBtn}
          accessibilityLabel="Export Data"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {/* Export is “send data out of the app” (up arrow) */}
          <MaterialIcons name="file-upload" size={22} color="#111827" />
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
    // Do not include internal ID fields in exports for privacy.
    const postsCsv = toCSV((posts || []).map(p => ({ title: p.title, body: p.body, author: p.author?.name, createdAt: p.createdAt })));
    const messagesCsv = toCSV((messages || []).map(m => ({ threadId: m.threadId || '', body: m.body, sender: m.sender?.name, createdAt: m.createdAt })));
    const childrenCsv = toCSV((children || []).map(c => ({ name: c.name, age: c.age, room: c.room, notes: c.notes })));
    return `--- Posts ---\n${postsCsv}\n\n--- Messages ---\n${messagesCsv}\n\n--- Children ---\n${childrenCsv}`;
  }

  async function doExportShare() {
    try {
      const payload = buildExportPayload();
      await Share.share({ message: payload, title: 'BuddyBoard export' });
      setExportModalVisible(false);
    } catch (e) {
      Alert.alert('Export failed', e?.message || String(e));
    }
  }

  async function doExportSaveToFolderAndroid() {
    try {
      if (Platform.OS !== 'android' || !FileSystem?.StorageAccessFramework) {
        return doExportShare();
      }

      const payload = buildExportPayload();
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `buddyboard_export_${ts}.txt`;

      const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted || !perm.directoryUri) return;

      const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
        perm.directoryUri,
        fileName,
        'text/plain'
      );
      await FileSystem.writeAsStringAsync(fileUri, payload, { encoding: FileSystem.EncodingType.UTF8 });

      setExportModalVisible(false);
      Alert.alert('Export saved', `Saved to selected folder as ${fileName}`);
    } catch (e) {
      Alert.alert('Export failed', e?.message || String(e));
    }
  }

  async function pickImportFile() {
    try {
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

  const pendingAlertCount = (urgentMemos || []).filter((m) => !m.status || m.status === 'pending').length;
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
  const placesSessionTokenRef = useRef(String(Math.random()).slice(2));
  const addressRequestIdRef = useRef(0);
  const suppressAutocompleteRef = useRef(0);

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
              await AsyncStorage.setItem(ORG_ARRIVAL_KEY, item.orgArrivalEnabled === false ? '0' : '1');
              await AsyncStorage.setItem(BUSINESS_ADDR_KEY, JSON.stringify({
                address: item.address,
                lat: item.lat,
                lng: item.lng,
                dropZoneMiles: item.dropZoneMiles,
              }));
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

        const raw = await AsyncStorage.getItem(BUSINESS_ADDR_KEY);
        if (!mounted) return;
        if (raw) {
          const parsed = JSON.parse(raw);
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

  async function toggleOrgArrival() {
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
      await AsyncStorage.setItem(ORG_ARRIVAL_KEY, next ? '1' : '0');
    } catch (e) {
      // revert on failure
      setOrgArrivalEnabled(!next);
      Alert.alert('Error', 'Could not update organization arrival detection setting.');
    }
  }

  async function saveArrivalControls() {
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
      await AsyncStorage.setItem(BUSINESS_ADDR_KEY, JSON.stringify(obj));
      Alert.alert('Saved', 'Arrival detection controls updated.');
    } catch (e) {
      Alert.alert('Error', 'Could not save arrival detection controls.');
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
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontWeight: '700' }}>{label}</Text>
                {typeof count === 'number' ? (
                  <View style={styles.dirCount}><Text style={{ color: '#111827', fontWeight: '700', fontSize: 12 }}>{count}</Text></View>
                ) : null}
              </View>
              <Text style={{ color: '#6b7280', marginTop: 4 }}>Tap to view</Text>
            </View>
            <TouchableOpacity onPress={onOpen} style={styles.openIcon} accessibilityLabel={`Open ${label} list`}>
              <MaterialIcons name="open-in-new" size={18} color="#2563eb" />
            </TouchableOpacity>
            <View style={{ marginLeft: 8 }}>
              <TouchableOpacity onPress={onToggle} style={styles.previewIcon} accessibilityLabel={`Preview ${label}`}>
                <MaterialIcons name={open ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={20} color={open ? '#2563eb' : '#6b7280'} />
              </TouchableOpacity>
            </View>
            {rightAction ? (
              <View style={{ marginLeft: 8 }}>{rightAction}</View>
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
      bannerRight={<HeaderRightButtons />}
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

            <View style={styles.dirGridRow}>
              <TouchableOpacity
                style={[styles.dirTile, showStudentsPreview ? styles.dirTileActive : null]}
                onPress={() => setShowStudentsPreview((s) => !s)}
                accessibilityLabel="Toggle Students preview"
              >
                <View style={styles.dirTileTop}>
                  <MaterialIcons name="groups" size={18} color="#111827" />
                  <View style={styles.dirTileCount}><Text style={styles.dirTileCountText}>{(children || []).length}</Text></View>
                </View>
                <Text style={styles.dirTileLabel}>Students</Text>
                <TouchableOpacity onPress={openStudentDirectory} style={styles.dirTileOpen} accessibilityLabel="Open Students list">
                  <MaterialIcons name="open-in-new" size={18} color="#2563eb" />
                </TouchableOpacity>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dirTile, showFacultyPreview ? styles.dirTileActive : null]}
                onPress={() => setShowFacultyPreview((s) => !s)}
                accessibilityLabel="Toggle Faculty preview"
              >
                <View style={styles.dirTileTop}>
                  <MaterialIcons name="school" size={18} color="#111827" />
                  <View style={styles.dirTileCount}><Text style={styles.dirTileCountText}>{facultyCount}</Text></View>
                </View>
                <Text style={styles.dirTileLabel}>Faculty</Text>
                <TouchableOpacity onPress={openFacultyDirectory} style={styles.dirTileOpen} accessibilityLabel="Open Faculty list">
                  <MaterialIcons name="open-in-new" size={18} color="#2563eb" />
                </TouchableOpacity>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dirTile, { marginRight: 0 }, showParentsPreview ? styles.dirTileActive : null]}
                onPress={() => setShowParentsPreview((s) => !s)}
                accessibilityLabel="Toggle Parents preview"
              >
                <View style={styles.dirTileTop}>
                  <MaterialIcons name="person" size={18} color="#111827" />
                  <View style={styles.dirTileCount}><Text style={styles.dirTileCountText}>{(parents || []).length}</Text></View>
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
                      <Image source={{ uri: (c?.avatar && !String(c.avatar).includes('pravatar.cc')) ? c.avatar : pravatarUriFor(c, 64) }} style={styles.previewAvatar} />
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
                      <Image source={{ uri: (f?.avatar && !String(f.avatar).includes('pravatar.cc')) ? f.avatar : pravatarUriFor(f, 64) }} style={styles.previewAvatar} />
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
                  <Image source={{ uri: (p?.avatar && !String(p.avatar).includes('pravatar.cc')) ? p.avatar : pravatarUriFor(p, 64) }} style={styles.previewAvatar} />
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
        {/* IDs (admin) - moved below Directory */}
        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Account IDs</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ fontSize: 14 }}>Show internal account ID numbers</Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Toggle to show internal account ID numbers in profiles.</Text>
            </View>
            <Switch value={showIds} onValueChange={toggleShowIds} />
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
              <Switch value={orgArrivalEnabled} onValueChange={toggleOrgArrival} />
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
              <TouchableOpacity onPress={useCurrentLocationForOrg} style={[styles.secondaryBtn, { flex: 1, marginTop: 0, marginRight: 10 }]}>
                <MaterialIcons name="my-location" size={18} color="#2563eb" />
                <Text style={styles.secondaryBtnText}>Use my current location</Text>
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

        {/* Permissions & Privacy section removed per request */}

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerIconBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  headerBadge: { position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  headerBadgeText: { color: '#fff', fontWeight: '800', fontSize: 10 },

  dirGridRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  dirTile: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginRight: 10 },
  dirTileActive: { borderColor: '#2563eb' },
  dirTileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dirTileCount: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  dirTileCountText: { color: '#111827', fontWeight: '800', fontSize: 12 },
  dirTileLabel: { marginTop: 8, fontWeight: '800', color: '#111827' },
  dirTileOpen: { position: 'absolute', right: 10, bottom: 10, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
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
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#fff',
    marginHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e6eef8',
    // subtle shadow / elevation to feel like a push button
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
    backgroundColor: '#f1f5f9'
  },
  iconTile: { flex: 1, alignItems: 'center', minWidth: 72, paddingHorizontal: 6 },
  iconTileBtn: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center', marginBottom: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3, position: 'relative' },
  iconTileLabel: { fontSize: 13, fontWeight: '700', color: '#111827' },
  countBadge: { position: 'absolute', top: -8, right: -8, backgroundColor: '#ef4444', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  banner: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#eef2f7' },
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
  primaryBtn: { marginTop: 12, backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  overlayBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  overlayCard: { width: '100%', maxWidth: 520, backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  overlayTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  overlaySub: { marginTop: 6, color: '#6b7280' },
  overlayOption: { marginTop: 12, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#eef2f7', backgroundColor: '#f8fafc' },
  overlayOptionText: { marginLeft: 10, fontWeight: '700', color: '#111827' },
  overlayActions: { marginTop: 16, flexDirection: 'row', justifyContent: 'flex-end' },
  overlayCancel: { paddingVertical: 10, paddingHorizontal: 12 },
  overlayCancelText: { color: '#2563eb', fontWeight: '700' },
  suggestionsBox: { marginTop: 6, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, backgroundColor: '#fff', overflow: 'hidden' },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  suggestionText: { marginLeft: 8, flex: 1, color: '#111827' },
});
