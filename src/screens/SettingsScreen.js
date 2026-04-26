import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Image, Alert, Switch, ScrollView, Platform } from 'react-native';
import { useAuth } from '../AuthContext';
import { BASE_URL } from '../config';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import devToolsFlag from '../utils/devToolsFlag';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { avatarSourceFor, setIdVisibilityEnabled, initIdVisibilityFromStorage } from '../utils/idVisibility';
import { registerForExpoPushTokenAsync } from '../utils/pushNotifications';
import * as Api from '../Api';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { SETTINGS_KEYS, readBooleanSetting, writeBooleanSetting, writeJsonSetting } from '../utils/appSettings';

const ARRIVAL_KEY = SETTINGS_KEYS.arrivalEnabled;
const PUSH_KEY = 'settings_push_enabled_v1';
const PUSH_CHATS_KEY = 'settings_push_chats_v1';
const PUSH_TIMELINE_POSTS_KEY = 'settings_push_timeline_posts_v1';
const PUSH_MENTIONS_POSTS_KEY = 'settings_push_mentions_posts_v1';
const PUSH_TAGS_POSTS_KEY = 'settings_push_tags_posts_v1';
const PUSH_REPLIES_COMMENTS_KEY = 'settings_push_replies_comments_v1';
const PUSH_MENTIONS_COMMENTS_KEY = 'settings_push_mentions_comments_v1';
const PUSH_UPDATES_KEY = 'settings_push_updates_v1';
const PUSH_OTHER_KEY = 'settings_push_other_v1';
const SHOW_EMAIL_KEY = SETTINGS_KEYS.showEmail;
const SHOW_PHONE_KEY = SETTINGS_KEYS.showPhone;
const SHOW_IDS_KEY = SETTINGS_KEYS.showIds;
const BUSINESS_ADDR_KEY = SETTINGS_KEYS.businessAddress;

export default function SettingsScreen({ navigation }) {
  const { user, logout, setRole } = useAuth();
  const isWeb = Platform.OS === 'web';

  const appVersion = Constants?.expoConfig?.version || Constants?.manifest?.version || '';
  const iosBuildNumber = Constants?.expoConfig?.ios?.buildNumber || '';
  const androidVersionCode = Constants?.expoConfig?.android?.versionCode || '';
  const [arrivalEnabled, setArrivalEnabled] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushChats, setPushChats] = useState(true);
  const [pushTimelinePosts, setPushTimelinePosts] = useState(true);
  const [pushMentionsPosts, setPushMentionsPosts] = useState(true);
  const [pushTagsPosts, setPushTagsPosts] = useState(true);
  const [pushRepliesComments, setPushRepliesComments] = useState(true);
  const [pushMentionsComments, setPushMentionsComments] = useState(true);
  const [pushUpdates, setPushUpdates] = useState(true);
  const [pushOther, setPushOther] = useState(false);
  const [showEmail, setShowEmail] = useState(true);
  const [showPhone, setShowPhone] = useState(true);
  const [showIds, setShowIds] = useState(false);

  const [updateStatus, setUpdateStatus] = useState({
    isEnabled: Updates.isEnabled,
    channel: Updates.channel ?? '',
    runtimeVersion: Updates.runtimeVersion ?? '',
    updateId: Updates.updateId ?? '',
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    createdAt: Updates.createdAt ? String(Updates.createdAt) : '',
  });
  const [updateBusy, setUpdateBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Debounced push preference sync to backend (efficient + consistent).
  const pushSyncTimerRef = useRef(null);
  const pushSyncLastPayloadRef = useRef('');

  // header buttons are provided globally by the navigator

  // not using safe-area insets here to avoid shifting content down

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const a = await readBooleanSetting(ARRIVAL_KEY, false);
        const p = await AsyncStorage.getItem(PUSH_KEY);
        const pc = await AsyncStorage.getItem(PUSH_CHATS_KEY);
        const pt = await AsyncStorage.getItem(PUSH_TIMELINE_POSTS_KEY);
        const pmp = await AsyncStorage.getItem(PUSH_MENTIONS_POSTS_KEY);
        const ptg = await AsyncStorage.getItem(PUSH_TAGS_POSTS_KEY);
        const prc = await AsyncStorage.getItem(PUSH_REPLIES_COMMENTS_KEY);
        const pmc = await AsyncStorage.getItem(PUSH_MENTIONS_COMMENTS_KEY);
        const pu = await AsyncStorage.getItem(PUSH_UPDATES_KEY);
        const po = await AsyncStorage.getItem(PUSH_OTHER_KEY);
        if (!mounted) return;
        setArrivalEnabled(!!a);
        if (p !== null) setPushEnabled(p === '1');
        if (pc !== null) setPushChats(pc === '1');
        if (pt !== null) setPushTimelinePosts(pt === '1');
        if (pmp !== null) setPushMentionsPosts(pmp === '1');
        if (ptg !== null) setPushTagsPosts(ptg === '1');
        if (prc !== null) setPushRepliesComments(prc === '1');
        if (pmc !== null) setPushMentionsComments(pmc === '1');
        if (pu !== null) setPushUpdates(pu === '1');
        if (po !== null) setPushOther(po === '1');
        const se = await AsyncStorage.getItem(SHOW_EMAIL_KEY);
        const sp = await AsyncStorage.getItem(SHOW_PHONE_KEY);
        const si = await AsyncStorage.getItem(SHOW_IDS_KEY);
        if (se !== null) setShowEmail(se === '1');
        if (sp !== null) setShowPhone(sp === '1');
        if (si !== null) setShowIds(si === '1');
        // initialize module-level cache from storage
        initIdVisibilityFromStorage().catch(() => {});
        const bRaw = await AsyncStorage.getItem(BUSINESS_ADDR_KEY);
        if (bRaw) {
          try { const parsed = JSON.parse(bRaw); if (parsed && parsed.address) setBusinessAddress(parsed.address); } catch (e) {}
        }
      } catch (e) {
        // ignore
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    // Keep display values fresh after reloads/updates.
    setUpdateStatus({
      isEnabled: Updates.isEnabled,
      channel: Updates.channel ?? '',
      runtimeVersion: Updates.runtimeVersion ?? '',
      updateId: Updates.updateId ?? '',
      isEmbeddedLaunch: Updates.isEmbeddedLaunch,
      createdAt: Updates.createdAt ? String(Updates.createdAt) : '',
    });
  }, [Platform.OS]);

  async function checkForOtaUpdate() {
    if (Platform.OS === 'web') {
      Alert.alert('Not supported', 'EAS Update is not supported on web.');
      return;
    }
    if (!Updates.isEnabled) {
      Alert.alert(
        'Updates disabled',
        'This build does not have expo-updates enabled (or you are running a dev/Expo Go session). Install an EAS-built binary to receive OTA updates.'
      );
      return;
    }

    try {
      setUpdateBusy(true);
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        Alert.alert('Up to date', 'No update is available for this channel/runtime version.');
        return;
      }

      const fetched = await Updates.fetchUpdateAsync();
      setUpdateStatus({
        isEnabled: Updates.isEnabled,
        channel: Updates.channel ?? '',
        runtimeVersion: Updates.runtimeVersion ?? '',
        updateId: Updates.updateId ?? '',
        isEmbeddedLaunch: Updates.isEmbeddedLaunch,
        createdAt: Updates.createdAt ? String(Updates.createdAt) : '',
      });

      Alert.alert(
        'Update downloaded',
        'Restart the app to apply it now.',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Restart now', onPress: () => Updates.reloadAsync().catch(() => {}) },
        ]
      );
    } catch (e) {
      Alert.alert('Update check failed', e?.message || String(e));
    } finally {
      setUpdateBusy(false);
    }
  }

  const [businessAddress, setBusinessAddress] = useState('');

  async function saveBusinessAddress(obj) {
    try {
      // Preserve any existing admin-configured fields (e.g., dropZoneMiles)
      let merged = { ...(obj || {}) };
      try {
        const existingRaw = await AsyncStorage.getItem(BUSINESS_ADDR_KEY);
        if (existingRaw) {
          const existing = JSON.parse(existingRaw);
          if (existing && typeof existing === 'object') {
            merged = { ...existing, ...merged };
          }
        }
      } catch (e) {}
      await writeJsonSetting(BUSINESS_ADDR_KEY, merged);
      setBusinessAddress(merged.address || '');
    } catch (e) {}
  }

  async function pickBusinessLocation() {
    try {
      const Location = require('expo-location');
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { Alert.alert('Location required', 'Please grant location permission to set business address.'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
      const addr = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
      await saveBusinessAddress({ address: addr, lat: pos.coords.latitude, lng: pos.coords.longitude });
      Alert.alert('Saved', 'Business location saved.');
    } catch (e) {
      console.warn('pickBusinessLocation failed', e?.message || e);
      Alert.alert('Location failed', 'Could not get current location.');
    }
  }

  const [devToolsVisible, setDevToolsVisible] = useState(true);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const v = await devToolsFlag.get();
        if (!mounted) return;
        setDevToolsVisible(Boolean(v));
      } catch (e) {}
    })();
    const unsub = devToolsFlag.addListener((v) => { if (mounted) setDevToolsVisible(Boolean(v)); });
    return () => { mounted = false; try { unsub(); } catch (e) {} };
  }, []);

  useEffect(() => {
    writeBooleanSetting(ARRIVAL_KEY, arrivalEnabled).catch(() => {});
  }, [arrivalEnabled]);

  useEffect(() => {
    AsyncStorage.setItem(PUSH_KEY, pushEnabled ? '1' : '0').catch(() => {});
  }, [pushEnabled]);

  useEffect(() => {
    AsyncStorage.setItem(PUSH_CHATS_KEY, pushChats ? '1' : '0').catch(() => {});
  }, [pushChats]);
  useEffect(() => {
    AsyncStorage.setItem(PUSH_TIMELINE_POSTS_KEY, pushTimelinePosts ? '1' : '0').catch(() => {});
  }, [pushTimelinePosts]);
  useEffect(() => {
    AsyncStorage.setItem(PUSH_MENTIONS_POSTS_KEY, pushMentionsPosts ? '1' : '0').catch(() => {});
  }, [pushMentionsPosts]);
  useEffect(() => {
    AsyncStorage.setItem(PUSH_TAGS_POSTS_KEY, pushTagsPosts ? '1' : '0').catch(() => {});
  }, [pushTagsPosts]);
  useEffect(() => {
    AsyncStorage.setItem(PUSH_REPLIES_COMMENTS_KEY, pushRepliesComments ? '1' : '0').catch(() => {});
  }, [pushRepliesComments]);
  useEffect(() => {
    AsyncStorage.setItem(PUSH_MENTIONS_COMMENTS_KEY, pushMentionsComments ? '1' : '0').catch(() => {});
  }, [pushMentionsComments]);
  useEffect(() => {
    AsyncStorage.setItem(PUSH_UPDATES_KEY, pushUpdates ? '1' : '0').catch(() => {});
  }, [pushUpdates]);
  useEffect(() => {
    AsyncStorage.setItem(PUSH_OTHER_KEY, pushOther ? '1' : '0').catch(() => {});
  }, [pushOther]);

  function buildPushPreferences() {
    return {
      chats: !!pushChats,
      timelinePosts: !!pushTimelinePosts,
      mentionsPosts: !!pushMentionsPosts,
      tagsPosts: !!pushTagsPosts,
      repliesComments: !!pushRepliesComments,
      mentionsComments: !!pushMentionsComments,
      updates: !!pushUpdates,
      other: !!pushOther,
    };
  }

  useEffect(() => {
    if (!pushEnabled) return;

    // Debounce backend sync so rapid toggles don't spam requests.
    if (pushSyncTimerRef.current) {
      clearTimeout(pushSyncTimerRef.current);
      pushSyncTimerRef.current = null;
    }

    pushSyncTimerRef.current = setTimeout(async () => {
      try {
        const token = await AsyncStorage.getItem('push_expo_token_v1');
        if (!token) return;

        const payload = {
          token,
          platform: Platform.OS,
          userId: user?.id,
          enabled: true,
          preferences: buildPushPreferences(),
        };
        const payloadKey = JSON.stringify(payload);
        if (payloadKey === pushSyncLastPayloadRef.current) return;

        await Api.registerPushToken(payload);
        pushSyncLastPayloadRef.current = payloadKey;
      } catch (e) {
        // ignore: preferences will be attempted again on next change
      }
    }, 450);

    return () => {
      if (pushSyncTimerRef.current) {
        clearTimeout(pushSyncTimerRef.current);
        pushSyncTimerRef.current = null;
      }
    };
  }, [
    pushEnabled,
    pushChats,
    pushTimelinePosts,
    pushMentionsPosts,
    pushTagsPosts,
    pushRepliesComments,
    pushMentionsComments,
    pushUpdates,
    pushOther,
    user?.id,
  ]);

  useEffect(() => {
    writeBooleanSetting(SHOW_EMAIL_KEY, showEmail).catch(() => {});
  }, [showEmail]);

  useEffect(() => {
    writeBooleanSetting(SHOW_PHONE_KEY, showPhone).catch(() => {});
  }, [showPhone]);

  useEffect(() => {
    setIdVisibilityEnabled(!!showIds);
  }, [showIds]);

  const toggleArrival = () => {
    const next = !arrivalEnabled;
    if (next) {
      Alert.alert(
        'Enable Arrival Detection',
        'Arrival detection requires location permission. Please grant location access in your device settings for full functionality.',
        [{ text: 'OK', onPress: () => setArrivalEnabled(true) }]
      );
      return;
    }
    setArrivalEnabled(false);
  };

  const togglePush = async () => {
    const next = !pushEnabled;
    if (next) {
      try {
        const result = await registerForExpoPushTokenAsync();
        if (!result.ok) {
          const msg = result.reason === 'permission-denied'
            ? 'Notification permission was not granted. Enable notifications in iOS Settings for CommunityBridge, then try again.'
            : (result.reason === 'not-device'
              ? 'Push notifications require a physical device (not a simulator).'
              : (result.message || 'Could not enable push notifications.'));
          Alert.alert('Push Notifications', msg);
          return;
        }

        const token = result.token;
        await AsyncStorage.setItem('push_expo_token_v1', token).catch(() => {});

        // Send token + preferences to backend (if supported).
        const payload = {
          token,
          platform: Platform.OS,
          userId: user?.id,
          enabled: true,
          preferences: buildPushPreferences(),
        };
        await Api.registerPushToken(payload);
        pushSyncLastPayloadRef.current = JSON.stringify(payload);

        setPushEnabled(true);
      } catch (e) {
        Alert.alert('Push Notifications', e?.message || 'Could not enable push notifications.');
      }
      return;
    }

    // Disable
    setPushEnabled(false);
    pushSyncLastPayloadRef.current = '';
    if (pushSyncTimerRef.current) {
      clearTimeout(pushSyncTimerRef.current);
      pushSyncTimerRef.current = null;
    }
    try {
      const token = await AsyncStorage.getItem('push_expo_token_v1');
      if (token) {
        await Api.unregisterPushToken({ token, platform: Platform.OS, userId: user?.id });
      }
    } catch (e) {
      // ignore
    }
  };

  async function confirmAndDeleteAccount() {
    if (!user?.id) {
      Alert.alert('Not signed in', 'Please sign in first.');
      return;
    }

    Alert.alert(
      'Delete account',
      'This will permanently delete your account and sign you out. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Final confirmation',
              'Are you sure you want to delete your CommunityBridge account?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete my account',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      setDeleteBusy(true);
                      await Api.deleteMyAccount({ confirm: true });
                      Alert.alert('Account deleted', 'Your account has been deleted.');
                      await logout();
                    } catch (e) {
                      const msg = e?.message || 'Account deletion failed.';
                      Alert.alert('Delete failed', msg);
                    } finally {
                      setDeleteBusy(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }

  return (
    <ScreenWrapper bannerShowBack={false} style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1, width: '100%' }} contentContainerStyle={{ alignItems: 'center', paddingBottom: 28, paddingHorizontal: 16 }} bounces={true} alwaysBounceVertical={true} showsVerticalScrollIndicator={false}>
        {isWeb ? (
          <View style={{ width: '100%', maxWidth: 980, marginTop: 8, marginBottom: 12, backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#e5e7eb', padding: 18, shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#0f172a' }}>Profile Settings</Text>
              <TouchableOpacity onPress={() => logout()} accessibilityLabel="Log out" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 14 }}>Logout</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ marginTop: 6, color: '#64748b' }}>Manage privacy, notifications, arrival detection, and update status from one desktop-friendly view.</Text>
            <View style={{ flexDirection: 'row', marginTop: 16 }}>
              {[
                { label: 'Arrival', value: arrivalEnabled ? 'On' : 'Off' },
                { label: 'Push', value: pushEnabled ? 'On' : 'Off' },
                { label: 'Email visible', value: showEmail ? 'Yes' : 'No' },
                { label: 'Phone visible', value: showPhone ? 'Yes' : 'No' },
              ].map((item, index) => (
                <View key={item.label} style={{ flex: 1, padding: 14, borderRadius: 14, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', marginRight: index === 3 ? 0 : 12 }}>
                  <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{item.label}</Text>
                  <Text style={{ marginTop: 8, fontSize: 22, fontWeight: '800', color: '#0f172a' }}>{item.value}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        <View style={{ width: '100%', maxWidth: isWeb ? 980 : 720, borderRadius: 14, backgroundColor: '#fff', padding: 20, elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, marginTop: 8 }}>
        <TouchableOpacity
          onPress={() => navigation.navigate('EditProfile')}
          accessibilityLabel="Edit Profile"
          style={{
            position: 'absolute',
            right: 12,
            top: 12,
            width: 40,
            height: 40,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: '#e6eef8',
            backgroundColor: '#f1f5f9',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.08,
            shadowRadius: 2,
            elevation: 2,
          }}
        >
          <MaterialIcons name="edit" size={20} color="#2563eb" />
        </TouchableOpacity>

        {!isWeb ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingRight: 56 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#0f172a' }}>Profile Settings</Text>
            <TouchableOpacity onPress={() => logout()} accessibilityLabel="Log out" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 14 }}>Logout</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Image
            source={avatarSourceFor(user)}
            style={{ width: 84, height: 84, borderRadius: 42, marginRight: 16 }}
          />
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '700' }}>{user?.name || 'Guest User'}</Text>
            <Text style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>{user?.email || 'Not signed in'}</Text>
            <Text style={{ fontSize: 14, color: '#374151', marginTop: 8 }}>{user?.phone || 'Phone: —'}</Text>
            <Text style={{ fontSize: 14, color: '#374151', marginTop: 4 }}>{user?.address || 'Address: —'}</Text>
          </View>
        </View>

        {/* Arrival Detection Section */}
        <View style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Arrival Detection</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '600' }}>Use location for arrival detection</Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Automatically detect within close range to help with smoother pick-ups.</Text>
            </View>
            <Switch value={arrivalEnabled} onValueChange={toggleArrival} />
          </View>
        </View>

        {/* Profile Privacy */}
        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Profile Privacy</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ fontSize: 14 }}>Show Email in profile</Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Allow others to see your email in the user info modal.</Text>
            </View>
            <Switch value={showEmail} onValueChange={setShowEmail} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ fontSize: 14 }}>Show Phone in profile</Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Allow others to see your phone number in the user info modal.</Text>
            </View>
            <Switch value={showPhone} onValueChange={setShowPhone} />
          </View>
        </View>

        {/* Push Notifications - moved to be immediately under Arrival Detection (subsections alphabetical) */}
        <View style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 16 }}>
          {/* Master Push Toggle */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: '700' }}>Push Notifications</Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Enable or disable all push notifications.</Text>
            </View>
            <Switch value={pushEnabled} onValueChange={togglePush} />
          </View>

          {/* Chats */}
          <View style={{ marginTop: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Chats</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontSize: 14 }}>Receive chat messages</Text>
                <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Get notified when someone sends you a chat message.</Text>
              </View>
              <Switch value={pushChats} onValueChange={setPushChats} disabled={!pushEnabled} />
            </View>
          </View>

          {/* Comments */}
          <View style={{ marginTop: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Comments</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontSize: 14 }}>Mentions in comments</Text>
                <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Notify when you're mentioned in a comment.</Text>
              </View>
              <Switch value={pushMentionsComments} onValueChange={setPushMentionsComments} disabled={!pushEnabled} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontSize: 14 }}>Replies to my comments</Text>
                <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Notify when someone replies to your comment.</Text>
              </View>
              <Switch value={pushRepliesComments} onValueChange={setPushRepliesComments} disabled={!pushEnabled} />
            </View>
          </View>

          {/* Timeline / Posts */}
          <View style={{ marginTop: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Timeline & Posts</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontSize: 14 }}>Mentions in posts</Text>
                <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Notify when you're mentioned in a post.</Text>
              </View>
              <Switch value={pushMentionsPosts} onValueChange={setPushMentionsPosts} disabled={!pushEnabled} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontSize: 14 }}>New posts on timeline</Text>
                <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Notify for new posts added to the timeline.</Text>
              </View>
              <Switch value={pushTimelinePosts} onValueChange={setPushTimelinePosts} disabled={!pushEnabled} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontSize: 14 }}>Tags in posts</Text>
                <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Notify when a post is tagged for you or your child.</Text>
              </View>
              <Switch value={pushTagsPosts} onValueChange={setPushTagsPosts} disabled={!pushEnabled} />
            </View>
          </View>

          {/* Updates & Reminders */}
          <View style={{ marginTop: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', marginBottom: 6 }}>Updates & Reminders</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontSize: 14 }}>Updates & reminders</Text>
                <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Reminders for events, schedule changes, and urgent updates.</Text>
              </View>
              <Switch value={pushUpdates} onValueChange={setPushUpdates} disabled={!pushEnabled} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontSize: 14 }}>Other activity</Text>
                <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Low-priority notices that do not fit the categories above.</Text>
              </View>
              <Switch value={pushOther} onValueChange={setPushOther} disabled={!pushEnabled} />
            </View>
          </View>
        </View>

        {/* Admin: business address (used for arrival detection geofence) */}
        {user && (user.role === 'admin' || user.role === 'administrator') ? (
          <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Business Address</Text>
            <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 8 }}>Set the center's address used to detect nearby arrivals (lat,lng).</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ flex: 1 }}>{businessAddress || 'Not set'}</Text>
              <TouchableOpacity onPress={pickBusinessLocation} style={{ marginLeft: 8, padding: 8, backgroundColor: '#2563eb', borderRadius: 8 }}>
                <Text style={{ color: '#fff' }}>Use current location</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        

          {/* Profile Privacy moved above Push Notifications */}

          {/* IDs: developer toggle (persistent) - admin only (moved for admins to Admin Controls) */}
          {(user && (user.role === 'admin' || user.role === 'administrator')) ? (
            <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>IDs</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 14 }}>Show internal IDs</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Toggle to show internal ID strings in profiles (debug only).</Text>
                </View>
                <Switch value={showIds} onValueChange={setShowIds} />
              </View>
            </View>
          ) : null}

          {/* Build / Update footer (fills extra space at bottom) */}
          <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Build & Update</Text>
            <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
              Use this to confirm you’re on the expected build and EAS update.
            </Text>
            <Text style={{ fontSize: 13, color: '#111827' }}>App version: {appVersion || '(unknown)'}</Text>
            {Platform.OS === 'ios' ? (
              <Text style={{ fontSize: 13, color: '#111827' }}>iOS build: {iosBuildNumber || '(unknown)'}</Text>
            ) : null}
            {Platform.OS === 'android' ? (
              <Text style={{ fontSize: 13, color: '#111827' }}>Android versionCode: {androidVersionCode || '(unknown)'}</Text>
            ) : null}
            {Platform.OS !== 'web' ? (
              <View style={{ marginTop: 10 }}>
                <Text style={{ fontSize: 13, color: '#111827' }}>Channel: {updateStatus.channel || '(unknown)'}</Text>
                <Text style={{ fontSize: 13, color: '#111827' }}>Runtime: {updateStatus.runtimeVersion || '(unknown)'}</Text>
                <Text style={{ fontSize: 13, color: '#111827' }}>Update ID: {updateStatus.updateId || '(embedded)'}</Text>
                <Text style={{ fontSize: 13, color: '#111827' }}>Created at: {updateStatus.createdAt || '(unknown)'}</Text>
              </View>
            ) : null}
          </View>

          {/* EAS Update status (useful for verifying OTA updates) */}
          {Platform.OS !== 'web' ? (
            <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>App Update Status</Text>
              <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                Channel and runtime version must match the published EAS update.
              </Text>

              <View style={{ marginBottom: 10 }}>
                <Text style={{ fontSize: 13, color: '#111827' }}>Updates enabled: {updateStatus.isEnabled ? 'yes' : 'no'}</Text>
                <Text style={{ fontSize: 13, color: '#111827' }}>Channel: {updateStatus.channel || '(unknown)'}</Text>
                <Text style={{ fontSize: 13, color: '#111827' }}>Runtime: {updateStatus.runtimeVersion || '(unknown)'}</Text>
                <Text style={{ fontSize: 13, color: '#111827' }}>Update ID: {updateStatus.updateId || '(embedded)'}</Text>
                <Text style={{ fontSize: 13, color: '#111827' }}>Embedded launch: {updateStatus.isEmbeddedLaunch ? 'yes' : 'no'}</Text>
              </View>

              <TouchableOpacity
                onPress={checkForOtaUpdate}
                disabled={updateBusy}
                style={{ padding: 10, backgroundColor: updateBusy ? '#9ca3af' : '#111827', borderRadius: 8, alignSelf: 'flex-start' }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{updateBusy ? 'Checking…' : 'Check for update now'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

        </View>

        {/* Account */}
        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Account</Text>
          <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
            Permanently delete your account.
          </Text>
          <TouchableOpacity
            onPress={confirmAndDeleteAccount}
            disabled={deleteBusy}
            style={{ padding: 10, backgroundColor: deleteBusy ? '#9ca3af' : '#b91c1c', borderRadius: 8, alignSelf: 'flex-start' }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>{deleteBusy ? 'Deleting…' : 'Delete my account'}</Text>
          </TouchableOpacity>
        </View>
        {/* Dev role switcher moved to DevRoleSwitcher (floating) */}
      </ScrollView>
    </ScreenWrapper>
  );
}
