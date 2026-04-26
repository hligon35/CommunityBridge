import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../AuthContext';
import { logger } from '../utils/logger';
import { logPress } from '../utils/logger';

export function HelpButton() {
  const navigation = useNavigation();
  return (
    <TouchableOpacity style={styles.btn} onPress={() => { logPress('TopButtons:Help'); navigation.navigate('Settings', { screen: 'Help' }); }}>
      <Text style={styles.help}>Help</Text>
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

export function BackButton({ onPress }) {
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
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { paddingHorizontal: 12 },
  help: { color: '#2563eb', fontWeight: '600' },
  logout: { color: '#ef4444', fontWeight: '600' },
  backBtn: { paddingHorizontal: 6, paddingVertical: 8, backgroundColor: 'transparent' },
  backText: { color: '#111827', fontWeight: '700', fontSize: 14 },
});

export default { HelpButton, LogoutButton };
