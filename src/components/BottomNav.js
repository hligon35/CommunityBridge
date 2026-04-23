import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MaterialIcons } from '@expo/vector-icons';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../AuthContext';
import { useData } from '../DataContext';
import { logPress } from '../utils/logger';

export default function BottomNav({ navigationRef, currentRoute }) {
  // don't show mobile bottom nav on web
  if (Platform.OS === 'web') return null;
  const { user } = useAuth();
  const { urgentMemos = [] } = useData();
  const role = (user && user.role) ? (user.role || '').toString().toLowerCase() : 'parent';

  // For parents, show any pending urgent alerts they created on the MyChild tab
  const parentPendingCount = (user && role === 'parent') ? (urgentMemos || []).filter((m) => (m.proposerId === user.id) && (!m.status || m.status === 'pending')).length : 0;

  // define tabs depending on role
  let tabs = [
    { key: 'Home', label: 'Home', icon: (active) => (<Ionicons name={active ? 'home' : 'home-outline'} size={22} color={active ? '#0066FF' : '#444'} />) },
    { key: 'Chats', label: 'Chats', icon: (active) => (<MaterialIcons name={active ? 'chat' : 'chat-bubble-outline'} size={22} color={active ? '#0066FF' : '#444'} />) },
  ];
  if (role === 'therapist') {
    tabs.push({ key: 'MyClass', label: 'My Class', icon: (active) => (<MaterialCommunityIcons name={active ? 'account-group' : 'account-group-outline'} size={22} color={active ? '#0066FF' : '#444'} />) });
  } else if (role === 'admin' || role === 'administrator') {
  tabs.push({ key: 'Controls', label: 'Dashboard', icon: (active) => (<MaterialIcons name={'tune'} size={22} color={active ? '#0066FF' : '#444'} />), count: (urgentMemos || []).filter((m) => !m.status || m.status === 'pending').length });
  } else {
    tabs.push({ key: 'MyChild', label: 'My Child', icon: (active) => (<MaterialCommunityIcons name={active ? 'account-child' : 'account-child-outline'} size={22} color={active ? '#0066FF' : '#444'} />), count: parentPendingCount });
  }
  tabs.push({ key: 'Settings', label: 'Settings', icon: (active) => (<Ionicons name={active ? 'settings' : 'settings-outline'} size={22} color={active ? '#0066FF' : '#444'} />) });
  function go(name) {
    logPress('BottomNav:tab', { to: name, from: currentRoute });
    try {
      if (!navigationRef || typeof navigationRef.isReady !== 'function' || !navigationRef.isReady()) return;
      if (typeof navigationRef.navigate !== 'function') return;
      navigationRef.navigate(name);
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
    justifyContent: 'space-around',
    backgroundColor: '#ffffff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    paddingBottom: 8,
    paddingTop: 8,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  badge: { position: 'absolute', top: 6, right: 22, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 11 },
});
