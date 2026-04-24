import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import LogoTitle from './LogoTitle';
import { useAuth } from '../AuthContext';
import { navigationRef } from '../navigationRef';

export default function WebNav() {
  const navigation = useNavigation();
  const { user, logout } = useAuth();
  const role = (user && user.role) ? (user.role || '').toString().toLowerCase() : 'parent';
  const [open, setOpen] = useState(false);

  function navTo(route) {
    // Top-level tab targets (Home/Chats/Settings/Controls/MyClass/MyChild)
    // live inside the `Main` screen of the outer AppStack. Use the root
    // navigationRef with an explicit nested-screen payload so the call works
    // regardless of how deep in the stack tree this component is rendered.
    try {
      if (navigationRef?.isReady?.() && typeof navigationRef.navigate === 'function') {
        navigationRef.navigate('Main', { screen: route });
        return;
      }
    } catch (_) {}
    const parent = navigation?.getParent?.();
    if (parent?.navigate) parent.navigate(route);
    else if (navigation?.navigate) navigation.navigate(route);
  }

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <TouchableOpacity onPress={() => navTo('Home')} style={styles.logoWrap}>
          <LogoTitle small />
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
            {role === 'therapist' && <TouchableOpacity onPress={() => { setOpen(false); navTo('MyClass'); }} style={styles.link}><Text style={styles.linkText}>My Class</Text></TouchableOpacity>}
            {(role === 'admin' || role === 'administrator') && <TouchableOpacity onPress={() => { setOpen(false); navTo('Controls'); }} style={styles.link}><Text style={styles.linkText}>Dashboard</Text></TouchableOpacity>}
            <TouchableOpacity onPress={() => { setOpen(false); navTo('Settings'); }} style={styles.link}><Text style={styles.linkText}>Settings</Text></TouchableOpacity>

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
  },
  inner: {
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  links: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    position: 'absolute',
    right: 16,
    top: 56,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 180,
  },
  link: {
    paddingVertical: 10,
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
