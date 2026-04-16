import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform, Linking } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Api from '../src/Api';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export default function ForgotPasswordScreen({ onDone, onCancel }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const supportEmail = useMemo(() => {
    try {
      const v = (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_SUPPORT_EMAIL)
        ? String(process.env.EXPO_PUBLIC_SUPPORT_EMAIL)
        : '';
      return v.trim() || 'support@buddyboard.getsparqd.com';
    } catch (_) {
      return 'support@buddyboard.getsparqd.com';
    }
  }, []);

  async function submitRequest() {
    const e = normalizeEmail(email);
    if (!e) {
      Alert.alert('Missing email', 'Please enter your email address.');
      return;
    }

    setBusy(true);
    try {
      await Api.requestPasswordReset(e);
      // Always show a generic message to avoid account enumeration.
      Alert.alert('Check your email', 'If an account exists for that email, a reset link has been sent.', [
        { text: 'OK', onPress: () => { try { onDone && onDone(); } catch (_) {} } },
      ]);
    } catch (err) {
      Alert.alert('Reset failed', err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  function openSupportEmail() {
    const url = `mailto:${encodeURIComponent(supportEmail)}?subject=${encodeURIComponent('BuddyBoard Password Reset')}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Contact support', `Please email ${supportEmail} for help resetting your password.`);
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Reset Password</Text>
        <TouchableOpacity onPress={() => { try { onCancel && onCancel(); } catch (_) {} }} accessibilityRole="button">
          <MaterialIcons name="close" size={24} color="#111827" />
        </TouchableOpacity>
      </View>

      <Text style={styles.subTitle}>
        Enter your email to receive a password reset link.
      </Text>

      <Text style={styles.label}>Email</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        editable={!busy}
      />

      <TouchableOpacity
        onPress={submitRequest}
        disabled={busy}
        accessibilityRole="button"
        style={[styles.primaryBtn, busy ? { opacity: 0.7 } : null]}
      >
        <Text style={styles.primaryBtnText}>{busy ? 'Sending…' : 'Send reset link'}</Text>
      </TouchableOpacity>

      <View style={{ marginTop: 14 }}>
        <TouchableOpacity onPress={openSupportEmail} accessibilityRole="button" style={styles.supportBtn}>
          <MaterialIcons name="email" size={18} color="#2563eb" />
          <Text style={styles.supportBtnText}>Contact support</Text>
        </TouchableOpacity>
        <Text style={styles.hintText}>
          {Platform.OS === 'web' ? 'Web: email client opens in a new tab.' : `Support: ${supportEmail}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 18, backgroundColor: '#fff' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontWeight: '800', color: '#111827' },
  subTitle: { marginTop: 8, fontSize: 13, color: '#6b7280' },
  label: { marginTop: 14, fontSize: 13, fontWeight: '700', color: '#111827' },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '800' },
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  supportBtnText: { marginLeft: 8, color: '#2563eb', fontWeight: '800' },
  hintText: { marginTop: 8, fontSize: 12, color: '#6b7280' },
});
