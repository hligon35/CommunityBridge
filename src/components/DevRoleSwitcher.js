import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, Alert, StyleSheet, Modal, ActivityIndicator, ScrollView } from 'react-native';
import devToolsFlag from '../utils/devToolsFlag';
import devDirectoryFlag from '../utils/devDirectoryFlag';
import devWallFlag from '../utils/devWallFlag';
import { useAuth } from '../AuthContext';
import { useData } from '../DataContext';
import { useTenant } from '../core/tenant/TenantContext';
import { navigationRef } from '../navigationRef';
import { MaterialIcons } from '@expo/vector-icons';
import { logPress, logger } from '../utils/logger';
import ImageToggle from './ImageToggle';

const DEV_SWITCH_EMAIL = 'dev@communitybridge.app';

function isDevAccount(user) {
  return String(user?.email || '').trim().toLowerCase() === DEV_SWITCH_EMAIL;
}

export default function DevRoleSwitcher() {
  const { setRole, user } = useAuth();
  // Visible in __DEV__ builds for everyone, OR for the dev@communitybridge.app
  // account in any build (controlled gate so the dev account can navigate the
  // hierarchy/paths in production-like environments).
  if (!__DEV__ && !isDevAccount(user)) return null;
  const [open, setOpen] = useState(false);
  const [devTools, setDevTools] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showDirectory, setShowDirectory] = useState(false);
  const [showWall, setShowWall] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const v = await devToolsFlag.get();
        if (!mounted) return;
        setDevTools(Boolean(v));
      } catch (e) {}
    })();
    const unsub = devToolsFlag.addListener((v) => { if (mounted) setDevTools(Boolean(v)); });
    return () => { mounted = false; unsub(); };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const v = await devDirectoryFlag.get();
        if (!mounted) return;
        setShowDirectory(Boolean(v));
      } catch (e) {}
    })();
    const unsub = devDirectoryFlag.addListener((v) => { if (mounted) setShowDirectory(Boolean(v)); });
    return () => { mounted = false; unsub(); };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const v = await devWallFlag.get();
        if (!mounted) return;
        setShowWall(Boolean(v));
      } catch (e) {}
    })();
    const unsub = devWallFlag.addListener((v) => { if (mounted) setShowWall(Boolean(v)); });
    return () => { mounted = false; unsub(); };
  }, []);

  const setDevToolsPersisted = async (val) => {
    logPress('DevTools:ShowDevTools', { value: !!val });
    try {
      await devToolsFlag.set(val);
    } catch (e) {}
  };

  const setShowDirectoryPersisted = async (val) => {
    logPress('DevTools:ShowDirectorySeed', { value: !!val });
    try {
      await devDirectoryFlag.set(val);
    } catch (e) {}
  };

  const setShowWallPersisted = async (val) => {
    logPress('DevTools:ShowWallPosts', { value: !!val });
    try {
      await devWallFlag.set(val);
    } catch (e) {}
  };

  const changeRole = (r) => {
    if (!setRole) return;
    logPress('DevTools:ChangeRole', { role: r });
    setRole(r);
    setOpen(false);
    Alert.alert('Role changed', `Switched to ${r}`);
  };

  const { resetMessagesToDemo, clearMessages, resetChildrenToDemo, parents, children, sendTimeUpdateAlert, sendAdminMemo } = useData();
  const tenant = useTenant() || {};
  const {
    programs = [],
    campuses = [],
    currentOrganization,
    currentProgram,
    currentProgramId,
    currentCampus,
    currentCampusId,
    setSelectedProgramId,
    setSelectedCampusId,
  } = tenant;

  // Navigation targets are grouped by area. All routes are defined in App.js;
  // the active role determines which root tab is mounted, but the dev switcher
  // can still navigate cross-role after using the Role buttons above.
  const NAV_GROUPS = [
    {
      title: 'Main',
      items: [
        { key: 'home', label: 'Dashboard (Home)', target: () => ({ tab: 'Home', screen: 'CommunityMain' }) },
        { key: 'chats', label: 'Chats', target: () => ({ tab: 'Chats', screen: 'ChatsList' }) },
        { key: 'mychild', label: 'My Child', target: () => ({ tab: 'MyChild', screen: 'MyChildMain' }) },
        { key: 'myclass', label: 'My Class', target: () => ({ tab: 'MyClass', screen: 'MyClassMain' }) },
        { key: 'settings', label: 'Settings', target: () => ({ tab: 'Settings', screen: 'SettingsMain' }) },
        { key: 'help', label: 'Help', target: () => ({ tab: 'Settings', screen: 'Help' }) },
      ],
    },
    {
      title: 'Admin',
      items: [
        { key: 'controls', label: 'Admin Controls', target: () => ({ tab: 'Controls', screen: 'ControlsMain' }) },
        { key: 'attendance', label: 'Attendance', target: () => ({ tab: 'Controls', screen: 'Attendance' }) },
      ],
    },
    {
      title: 'Directories',
      items: [
        { key: 'student-dir', label: 'Students', target: () => ({ tab: 'Controls', screen: 'StudentDirectory' }) },
        { key: 'faculty-dir', label: 'Faculty', target: () => ({ tab: 'Controls', screen: 'FacultyDirectory' }) },
        { key: 'parent-dir', label: 'Parents', target: () => ({ tab: 'Controls', screen: 'ParentDirectory' }) },
        { key: 'program-dir', label: 'Programs', target: () => ({ tab: 'Controls', screen: 'ProgramDirectory' }) },
        { key: 'campus-dir', label: 'Campuses', target: () => ({ tab: 'Controls', screen: 'CampusDirectory' }) },
      ],
    },
    {
      title: 'Documents',
      items: [
        { key: 'program-docs', label: 'Program Docs', target: () => ({ tab: 'Controls', screen: 'ProgramDocuments' }) },
        { key: 'campus-docs', label: 'Campus Docs', target: () => ({ tab: 'Controls', screen: 'CampusDocuments' }) },
      ],
    },
  ];

  function jumpTo(targetFactory) {
    try {
      const { tab, screen } = targetFactory();
      logPress('DevTools:Navigate', { tab, screen });
      if (!navigationRef.isReady()) {
        Alert.alert('Navigation not ready', 'Try again in a moment.');
        return;
      }
      navigationRef.navigate(tab, screen ? { screen } : undefined);
      setOpen(false);
    } catch (e) {
      console.warn('jumpTo failed', e?.message || e);
      Alert.alert('Navigation failed', e?.message || 'Could not navigate.');
    }
  }

  function cycleProgram() {
    if (!Array.isArray(programs) || programs.length < 2 || !setSelectedProgramId) return;
    const idx = programs.findIndex((p) => p.id === currentProgramId);
    const next = programs[(idx + 1) % programs.length];
    if (next) {
      logPress('DevTools:CycleProgram', { from: currentProgramId, to: next.id });
      setSelectedProgramId(next.id);
    }
  }

  function cycleCampus() {
    if (!Array.isArray(campuses) || campuses.length < 2 || !setSelectedCampusId) return;
    const idx = campuses.findIndex((c) => c.id === currentCampusId);
    const next = campuses[(idx + 1) % campuses.length];
    if (next) {
      logPress('DevTools:CycleCampus', { from: currentCampusId, to: next.id });
      setSelectedCampusId(next.id);
    }
  }

  async function seedAdminAlertA() {
    try {
      logPress('DevTools:SeedAdminAlertA');
      const child = (children || [])[0];
      if (!child) return Alert.alert('No child available to seed');
      await sendTimeUpdateAlert(child.id, 'pickup', new Date(Date.now() + 1000 * 60 * 60).toISOString(), 'Seeded pickup alert A');
      Alert.alert('Seeded', 'Admin alert A created');
    } catch (e) { console.warn('seedAdminAlertA failed', e); Alert.alert('Error', 'Failed to seed admin alert A'); }
  }

  async function seedAdminAlertB() {
    try {
      logPress('DevTools:SeedAdminAlertB');
      const child = (children || [])[1] || (children || [])[0];
      if (!child) return Alert.alert('No child available to seed');
      await sendTimeUpdateAlert(child.id, 'dropoff', new Date(Date.now() + 1000 * 60 * 30).toISOString(), 'Seeded dropoff alert B');
      Alert.alert('Seeded', 'Admin alert B created');
    } catch (e) { console.warn('seedAdminAlertB failed', e); Alert.alert('Error', 'Failed to seed admin alert B'); }
  }

  async function seedParentAlertA() {
    try {
      logPress('DevTools:SeedParentAlertA');
      const parent = (parents || [])[0];
      if (!parent) return Alert.alert('No parent available to seed');
      const name = parent.name || `${parent.firstName || ''} ${parent.lastName || ''}`.trim();
      await sendAdminMemo({ recipients: [{ id: parent.id, name: name || 'Parent' }], subject: 'Parent Alert A', body: 'This is a seeded admin memo for parent A.' });
      Alert.alert('Seeded', 'Parent alert A created');
    } catch (e) { console.warn('seedParentAlertA failed', e); Alert.alert('Error', 'Failed to seed parent alert A'); }
  }

  async function seedParentAlertB() {
    try {
      logPress('DevTools:SeedParentAlertB');
      const parent = (parents || [])[1] || (parents || [])[0];
      if (!parent) return Alert.alert('No parent available to seed');
      const name = parent.name || `${parent.firstName || ''} ${parent.lastName || ''}`.trim();
      await sendAdminMemo({ recipients: [{ id: parent.id, name: name || 'Parent' }], subject: 'Parent Alert B', body: 'This is a seeded admin memo for parent B.' });
      Alert.alert('Seeded', 'Parent alert B created');
    } catch (e) { console.warn('seedParentAlertB failed', e); Alert.alert('Error', 'Failed to seed parent alert B'); }
  }

  return (
    <View pointerEvents="box-none" style={styles.container}>
      {/* Role badge */}
      <View style={styles.badgeWrap} pointerEvents="none">
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{(user && user.role) ? user.role.toString().toUpperCase() : 'DEV'}</Text>
        </View>
      </View>
      {open && (
        <ScrollView style={styles.menu} contentContainerStyle={{ paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
          {/* Role */}
          <Text style={styles.sectionLabel}>Role</Text>
          <TouchableOpacity onPress={() => changeRole('parent')} style={styles.menuBtn}>
            <Text>Parent</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => changeRole('therapist')} style={styles.menuBtn}>
            <Text>Therapist</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => changeRole('admin')} style={styles.menuBtn}>
            <Text>Admin</Text>
          </TouchableOpacity>

          {/* Tenant */}
          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Tenant</Text>
          <View style={styles.menuBtn}>
            <Text style={styles.kv}>Org: <Text style={styles.kvVal}>{currentOrganization?.name || '—'}</Text></Text>
            <Text style={styles.kv}>Program: <Text style={styles.kvVal}>{currentProgram?.name || '—'}</Text></Text>
            <Text style={styles.kv}>Campus: <Text style={styles.kvVal}>{currentCampus?.name || '—'}</Text></Text>
          </View>
          <TouchableOpacity onPress={cycleProgram} disabled={programs.length < 2} style={[styles.menuBtn, programs.length < 2 && { opacity: 0.4 }]}>
            <Text>Next Program ({programs.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={cycleCampus} disabled={campuses.length < 2} style={[styles.menuBtn, campuses.length < 2 && { opacity: 0.4 }]}>
            <Text>Next Campus ({campuses.length})</Text>
          </TouchableOpacity>

          {/* Navigation (grouped) */}
          {NAV_GROUPS.map((group) => (
            <View key={group.title}>
              <View style={styles.divider} />
              <Text style={styles.sectionLabel}>Navigate — {group.title}</Text>
              {group.items.map((item) => (
                <TouchableOpacity key={item.key} onPress={() => jumpTo(item.target)} style={styles.menuBtn}>
                  <Text>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}

          {/* View Toggles */}
          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>View Toggles</Text>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Show Dev Tools</Text>
            <ImageToggle value={devTools} onValueChange={setDevToolsPersisted} accessibilityLabel="Show Dev Tools" />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Show Directory (seed)</Text>
            <ImageToggle value={showDirectory} onValueChange={setShowDirectoryPersisted} accessibilityLabel="Show Directory" />
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Show Wall Posts</Text>
            <ImageToggle value={showWall} onValueChange={setShowWallPersisted} accessibilityLabel="Show Wall Posts" />
          </View>

          {/* Seed Data */}
          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Seed — Admin Alerts</Text>
          <TouchableOpacity onPress={() => seedAdminAlertA()} style={styles.menuBtn}>
            <Text>Pickup alert A</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => seedAdminAlertB()} style={styles.menuBtn}>
            <Text>Dropoff alert B</Text>
          </TouchableOpacity>

          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Seed — Parent Memos</Text>
          <TouchableOpacity onPress={() => seedParentAlertA()} style={styles.menuBtn}>
            <Text>Parent memo A</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => seedParentAlertB()} style={styles.menuBtn}>
            <Text>Parent memo B</Text>
          </TouchableOpacity>

          {/* Reset Data */}
          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Reset Data</Text>
          <TouchableOpacity onPress={() => { try { logPress('DevTools:LoadDemoMessages'); resetMessagesToDemo(); Alert.alert('Demo messages loaded'); } catch (e) { Alert.alert('Error', 'Could not load demo messages'); } }} style={styles.menuBtn}>
            <Text>Load demo messages</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => {
            logPress('DevTools:ClearMessagesPrompt');
            Alert.alert('Confirm', 'Clear all messages?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: () => { try { logPress('DevTools:ClearMessagesConfirm'); clearMessages(); Alert.alert('Cleared', 'All messages removed'); } catch (e) { Alert.alert('Error', 'Could not clear messages'); } } }
            ]);
          }} style={styles.menuBtn}>
            <Text>Clear messages</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { try { logPress('DevTools:ClearChildren'); resetChildrenToDemo(); Alert.alert('Cleared', 'Children cleared (use dev seed to repopulate)'); } catch (e) { Alert.alert('Error', 'Could not clear children'); } }} style={styles.menuBtn}>
            <Text>Clear children (use dev seed)</Text>
          </TouchableOpacity>

          {/* Auth */}
          <View style={styles.divider} />
          <Text style={styles.sectionLabel}>Auth</Text>
          <TouchableOpacity onPress={() => setShowLoginModal(true)} style={styles.menuBtn}>
            <Text>Open Login Screen</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <Modal visible={showLoginModal} animationType="slide" onRequestClose={() => setShowLoginModal(false)}>
        {/* Render the existing LoginScreen in a modal for dev testing. Provide a fake navigation.replace that closes the modal. */}
        {/** Import lazily to avoid bundling issues in production */}
        <DevLoginWrapper onClose={() => setShowLoginModal(false)} />
      </Modal>

      <TouchableOpacity style={styles.fab} onPress={() => { logPress('DevTools:ToggleMenu', { open: !open }); setOpen(!open); }} accessibilityLabel="Developer role switcher">
        <MaterialIcons name="developer-mode" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    bottom: 80,
    alignItems: 'flex-end',
    zIndex: 9999,
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  menu: {
    marginBottom: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    maxHeight: 460,
    width: 260,
  },
  sectionLabel: {
    paddingHorizontal: 6,
    paddingTop: 4,
    paddingBottom: 2,
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kv: { fontSize: 12, color: '#475569' },
  kvVal: { color: '#0f172a', fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 6 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  toggleLabel: { marginRight: 8, color: '#0f172a' },
  menuBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  badgeWrap: {
    marginBottom: 8,
    alignItems: 'flex-end',
  },
  badge: {
    backgroundColor: '#111827',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    elevation: 6,
  },
  badgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
});

function DevLoginWrapper({ onClose }) {
  const [LoginScreenComp, setLoginScreenComp] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const mod = await import('../../screens/LoginScreen');
        const Comp = (mod && mod.default) ? mod.default : mod;
        if (mounted) setLoginScreenComp(() => Comp);
      } catch (e) {
        console.warn('DevLoginWrapper import failed', e);
        if (mounted) setErr(e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (err) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Login screen failed to load</Text>
    </View>
  );

  if (!LoginScreenComp) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );

  const fakeNav = {
    replace: (/* routeName */) => {
      try { onClose && onClose(); } catch (e) {}
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <LoginScreenComp navigation={fakeNav} suppressAutoRedirect={true} />
    </View>
  );
}
