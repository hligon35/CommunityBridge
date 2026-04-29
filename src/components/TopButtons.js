import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../AuthContext';
import { logger } from '../utils/logger';
import { logPress } from '../utils/logger';

const helpIcon = require('../../assets/icons/help.png');

export function HelpButton() {
  const navigation = useNavigation();
  return (
    <TouchableOpacity
      style={[styles.btn, styles.helpBtn]}
      onPress={() => { logPress('TopButtons:Help'); navigation.navigate('Settings', { screen: 'Help' }); }}
      accessibilityRole="button"
      accessibilityLabel="Help"
      activeOpacity={0.85}
    >
      <Image source={helpIcon} style={styles.helpIcon} resizeMode="contain" />
    </TouchableOpacity>
  );
}

export function LogoutButton() {
  const { logout } = useAuth();
  return (
    <TouchableOpacity style={styles.btn} onPress={() => { logPress('TopButtons:Logout'); logout(); }}>
      <Text style={styles.logout}>Logout</Text>
    </TouchableOpacity>
  );
}

export function BackButton({ onPress, label = '' }) {
  const logEvent = (ev) => { logger.debug('ui', `TopButtons.BackButton:${ev}`); };
  return (
    <TouchableOpacity
      style={[styles.btn, styles.backBtn]}
      onPress={() => { logPress('TopButtons:Back'); logEvent('onPress'); onPress && onPress(); }}
      onPressIn={() => logEvent('onPressIn')}
      onPressOut={() => logEvent('onPressOut')}
      onLongPress={() => logEvent('onLongPress')}
      delayLongPress={600}
      accessibilityLabel="Go back"
      hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
      activeOpacity={0.85}
    >
      <MaterialIcons name="chevron-left" size={26} color="#111827" />
      {label ? <Text style={styles.backText}>{label}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { paddingHorizontal: 6 },
  helpBtn: { paddingVertical: 2 },
  helpIcon: { width: 32, height: 32 },
  help: { color: '#2563eb', fontWeight: '600' },
  logout: { color: '#ef4444', fontWeight: '600' },
  backBtn: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 8,
    paddingVertical: 0,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  backText: { color: '#111827', fontWeight: '700', fontSize: 14, marginLeft: 2 },
});

export default { HelpButton, LogoutButton };
