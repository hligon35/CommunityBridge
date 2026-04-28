import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import LogoTitle from './LogoTitle';
import { useAuth } from '../AuthContext';
import { navigationRef } from '../navigationRef';
import { useTenant } from '../core/tenant/TenantContext';
import { isAdminRole } from '../core/tenant/models';

export default function WebNav() {
  const navigation = useNavigation();
  const { user, logout } = useAuth();
  const tenant = useTenant();
  const labels = tenant?.labels || {};
  const role = (user && user.role) ? (user.role || '').toString().toLowerCase() : 'parent';
  const [open, setOpen] = useState(false);

  function navTo(route, params) {
    // Top-level tab targets (Home/Chats/Settings/Controls/MyClass/MyChild)
    // live inside the `Main` screen of the outer AppStack. Use the root
    // navigationRef with an explicit nested-screen payload so the call works
    // regardless of how deep in the stack tree this component is rendered.
    try {
      if (navigationRef?.isReady?.() && typeof navigationRef.navigate === 'function') {
        navigationRef.navigate('Main', { screen: route, ...(params ? { params } : {}) });
        return;
      }
    } catch (_) {}
    const parent = navigation?.getParent?.();
    if (parent?.navigate) parent.navigate(route, params);
    else if (navigation?.navigate) navigation.navigate(route, params);
  }

  function openHelp() {
    setOpen(false);
    navTo('Settings', { screen: 'Help' });
  }

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <TouchableOpacity onPress={() => navTo('Home')} style={styles.logoWrap}>
          <LogoTitle width={240} height={72} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={open ? 'Close menu' : 'Open menu'}
          style={styles.hamburger}
        >
          <Text style={styles.hamburgerText}>{open ? 'Close' : 'Menu'}</Text>
        </TouchableOpacity>

        {open ? (
          <View style={styles.links}>
            <TouchableOpacity onPress={() => { setOpen(false); navTo('Home'); }} style={styles.link}><Text style={styles.linkText}>Home</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { setOpen(false); navTo('Chats'); }} style={styles.link}><Text style={styles.linkText}>Messages</Text></TouchableOpacity>
            {role !== 'therapist' && <TouchableOpacity onPress={() => { setOpen(false); navTo('MyChild'); }} style={styles.link}><Text style={styles.linkText}>{labels.myChild || 'My Child'}</Text></TouchableOpacity>}
            {role === 'therapist' && <TouchableOpacity onPress={() => { setOpen(false); navTo('MyClass'); }} style={styles.link}><Text style={styles.linkText}>{labels.myClass || 'My Class'}</Text></TouchableOpacity>}
            {isAdminRole(role) && <TouchableOpacity onPress={() => { setOpen(false); navTo('Controls'); }} style={styles.link}><Text style={styles.linkText}>{labels.dashboard || 'Dashboard'}</Text></TouchableOpacity>}
            <TouchableOpacity onPress={() => { setOpen(false); navTo('Settings'); }} style={styles.link}><Text style={styles.linkText}>Settings</Text></TouchableOpacity>
            <TouchableOpacity onPress={openHelp} style={styles.link}><Text style={styles.linkText}>Help</Text></TouchableOpacity>

            {user ? (
              <TouchableOpacity onPress={() => { setOpen(false); logout && logout(); }} style={styles.link}>
                <Text style={[styles.linkText, styles.logoutText]}>Logout</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e6e6e6',
    // Ensure header (and its absolutely-positioned dropdown) sit above page content like the Post button
    zIndex: 1000,
    ...(typeof window !== 'undefined' ? { position: 'relative' } : {}),
  },
  inner: {
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 16,
    zIndex: 1000,
  },
  logoWrap: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  links: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    position: 'absolute',
    right: 16,
    top: 72,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 180,
    zIndex: 1001,
    elevation: 24,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  link: {
    paddingVertical: 10,
    width: '100%',
  },
  linkText: {
    color: '#111827',
    fontWeight: '600',
  },
  hamburger: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  hamburgerText: {
    color: '#111827',
    fontWeight: '700',
  },
  logoutText: {
    color: '#ef4444',
  },
});
