import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, Alert, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import devToolsFlag from '../utils/devToolsFlag';
import devDirectoryFlag from '../utils/devDirectoryFlag';
import devWallFlag from '../utils/devWallFlag';
import { useAuth } from '../AuthContext';
import { useData } from '../DataContext';
import { MaterialIcons } from '@expo/vector-icons';
import { logPress, logger } from '../utils/logger';
import ImageToggle from './ImageToggle';

export default function DevRoleSwitcher() {
  if (!__DEV__) return null;
  const { setRole, user } = useAuth();
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

  const { urgentMemos, fetchAndSync, resetMessagesToDemo, clearMessages, resetChildrenToDemo, parents, children, sendTimeUpdateAlert, sendAdminMemo } = useData();

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
        <View style={styles.menu}>
          <TouchableOpacity onPress={() => changeRole('parent')} style={styles.menuBtn}>
            <Text>Parent</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => changeRole('therapist')} style={styles.menuBtn}>
            <Text>Therapist</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => changeRole('admin')} style={styles.menuBtn}>
            <Text>Admin</Text>
          </TouchableOpacity>
          <View style={{ height: 1, backgroundColor: '#f3f4f6', marginVertical: 6 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6 }}>
            <Text style={{ marginRight: 8 }}>Show Dev Tools</Text>
            <ImageToggle value={devTools} onValueChange={setDevToolsPersisted} accessibilityLabel="Show Dev Tools" />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, marginTop:6 }}>
            <Text style={{ marginRight: 8 }}>Show Directory (seed)</Text>
            <ImageToggle value={showDirectory} onValueChange={setShowDirectoryPersisted} accessibilityLabel="Show Directory" />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, marginTop:6 }}>
            <Text style={{ marginRight: 8 }}>Show Wall Posts</Text>
            <ImageToggle value={showWall} onValueChange={setShowWallPersisted} accessibilityLabel="Show Wall Posts" />
          </View>

          <TouchableOpacity onPress={() => setShowLoginModal(true)} style={styles.menuBtn}>
            <Text>Open Login Screen</Text>
          </TouchableOpacity>
          <View style={{ height: 1, backgroundColor: '#f3f4f6', marginVertical: 6 }} />
          <TouchableOpacity onPress={() => seedAdminAlertA()} style={styles.menuBtn}>
            <Text>Seed Admin Alert A (pickup)</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => seedAdminAlertB()} style={styles.menuBtn}>
            <Text>Seed Admin Alert B (dropoff)</Text>
          </TouchableOpacity>
          <View style={{ height: 1, backgroundColor: '#f3f4f6', marginVertical: 6 }} />
          <TouchableOpacity onPress={() => seedParentAlertA()} style={styles.menuBtn}>
            <Text>Seed Parent Alert A</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => seedParentAlertB()} style={styles.menuBtn}>
            <Text>Seed Parent Alert B</Text>
          </TouchableOpacity>
          <View style={{ height: 1, backgroundColor: '#f3f4f6', marginVertical: 6 }} />
          <TouchableOpacity onPress={() => { try { logPress('DevTools:LoadDemoMessages'); resetMessagesToDemo(); Alert.alert('Demo messages loaded'); } catch (e) { Alert.alert('Error', 'Could not load demo messages'); } }} style={styles.menuBtn}>
            <Text>Load Demo Messages</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => {
            logPress('DevTools:ClearMessagesPrompt');
            Alert.alert('Confirm', 'Clear all messages?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: () => { try { logPress('DevTools:ClearMessagesConfirm'); clearMessages(); Alert.alert('Cleared', 'All messages removed'); } catch (e) { Alert.alert('Error', 'Could not clear messages'); } } }
            ]);
          }} style={styles.menuBtn}>
            <Text>Clear Messages</Text>
          </TouchableOpacity>
          <View style={{ height: 1, backgroundColor: '#f3f4f6', marginVertical: 6 }} />
          <TouchableOpacity onPress={() => { try { logPress('DevTools:ClearChildren'); resetChildrenToDemo(); Alert.alert('Cleared', 'Children cleared (use dev seed to repopulate)'); } catch (e) { Alert.alert('Error', 'Could not clear children'); } }} style={styles.menuBtn}>
            <Text>Clear Children (use dev seed)</Text>
          </TouchableOpacity>
        </View>
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
  },
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
