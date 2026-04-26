import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform, Image } from 'react-native';
import { useAuth } from '../AuthContext';
import { useData } from '../DataContext';
import { logPress } from '../utils/logger';

const homeIcon = require('../../assets/icons/home.png');
const chatsIcon = require('../../assets/icons/chats.png');
const chatsUnreadIcon = require('../../assets/icons/chats(unread).png');
const myClassIcon = require('../../assets/icons/myclass.png');
const controlsIcon = require('../../assets/icons/dashboard.png');
const settingsIcon = require('../../assets/icons/settings.png');
const myChildIcon = require('../../assets/icons/mychild.png');

function NavImageIcon({ source, active, size = 24 }) {
  return (
    <Image
      source={source}
      style={{ width: size, height: size, resizeMode: 'contain', opacity: active ? 1 : 0.68, backgroundColor: 'transparent' }}
    />
  );
}

export default function BottomNav({ navigationRef, currentRoute }) {
  // don't show mobile bottom nav on web
  if (Platform.OS === 'web') return null;
  const { user } = useAuth();
  const { urgentMemos = [], unreadThreadCount = 0 } = useData();
  const role = (user && user.role) ? (user.role || '').toString().toLowerCase() : 'parent';

  // For parents, show any pending urgent alerts they created on the MyChild tab
  const parentPendingCount = (user && role === 'parent') ? (urgentMemos || []).filter((m) => (m.proposerId === user.id) && (!m.status || m.status === 'pending')).length : 0;

  // define tabs depending on role
  let tabs = [
    { key: 'Home', label: 'Home', icon: (active) => (<NavImageIcon source={homeIcon} active={active} />) },
    { key: 'Chats', label: 'Chats', icon: (active) => (<NavImageIcon source={unreadThreadCount > 0 ? chatsUnreadIcon : chatsIcon} active={active} />), count: unreadThreadCount },
  ];
  if (role === 'therapist') {
    tabs.push({ key: 'MyClass', label: 'My Class', icon: (active) => (<NavImageIcon source={myClassIcon} active={active} />) });
  } else if (role === 'admin' || role === 'administrator') {
  tabs.push({ key: 'Controls', label: 'Dashboard', icon: (active) => (<NavImageIcon source={controlsIcon} active={active} />), count: (urgentMemos || []).filter((m) => !m.status || m.status === 'pending').length });
  } else {
    tabs.push({ key: 'MyChild', label: 'My Child', icon: (active) => (<NavImageIcon source={myChildIcon} active={active} />), count: parentPendingCount });
  }
  tabs.push({ key: 'Settings', label: 'Settings', icon: (active) => (<NavImageIcon source={settingsIcon} active={active} />) });
  function go(name) {
    logPress('BottomNav:tab', { to: name, from: currentRoute });
    try {
      if (!navigationRef || typeof navigationRef.isReady !== 'function' || !navigationRef.isReady()) return;
      if (typeof navigationRef.navigate !== 'function') return;
      // Tab targets (Home/Chats/MyChild/Controls/MyClass/Settings) live inside
      // the nested `RootStack` rendered by `MainShell -> MainRoutes`, which is
      // itself the `Main` screen of the outer `AppStack`. Calling
      // `navigate(name)` at the container level is ambiguous (React Navigation
      // may not find the nested route if the user is currently on `Login` or
      // `TwoFactor`). Use the explicit nested form so it is always deterministic.
      navigationRef.navigate('Main', { screen: name });
    } catch (_) {
      // ignore
    }
  }

  // animation for badges
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const hasAny = tabs && tabs.some((t) => t.count && t.count > 0);
    if (hasAny) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.08, duration: 600, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
    // reset scale when no alerts
    scale.setValue(1);
  }, [tabs, scale]);

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.inner}>
        {tabs.map(t => (
          <TouchableOpacity key={t.key} style={styles.button} onPress={() => go(t.key)}>
            {t.icon(currentRoute === t.key)}
            <Text style={[styles.label, currentRoute === t.key && styles.active]}>{t.label}</Text>
            {t.count > 0 ? (
              <Animated.View style={[styles.badge, { transform: [{ scale }] }]}>
                <Text style={styles.badgeText}>{t.count}</Text>
              </Animated.View>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  inner: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    backgroundColor: '#ffffff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    paddingBottom: 2,
    paddingTop: 2,
  },
  button: {
    minWidth: 56,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  label: {
    color: '#444',
    fontSize: 12,
    marginTop: 2,
  },
  active: {
    color: '#0066FF',
    fontWeight: '700',
  },
  badge: { position: 'absolute', top: 0, right: 2, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 11 },
});
