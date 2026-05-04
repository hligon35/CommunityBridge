import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Platform, Linking, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Api from '../src/Api';
import { formatSupportDetails, reportErrorToSentry } from '../src/utils/reportError';
import LogoTitle from '../src/components/LogoTitle';

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
      return v.trim() || 'info@communitybridge.app';
    } catch (_) {
      return 'info@communitybridge.app';
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
      const code = String(err?.code || '');
      const eventId = reportErrorToSentry(err, {
        area: 'auth',
        action: 'password-reset',
        errorCode: code,
      });
      Alert.alert('Reset failed', `${err?.message || String(err)}${formatSupportDetails({ code, eventId })}`);
    } finally {
      setBusy(false);
    }
  }

  function openSupportEmail() {
    const url = `mailto:${encodeURIComponent(supportEmail)}?subject=${encodeURIComponent('CommunityBridge Password Reset')}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Contact support', `Please email ${supportEmail} for help resetting your password.`);
    });
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" translucent={false} backgroundColor="#ffffff" />
      <View style={styles.headerShell}>
        <View style={styles.headerRow}>
          <LogoTitle width={132} height={42} />
          <Text style={styles.greeting}>Hello</Text>
        </View>
      </View>

      <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Password Assistance</Text>
      </View>

      <Text style={styles.subTitle}>
        Enter your email to receive a secure reset link. Office-managed accounts can also be updated from the admin permissions workspace.
      </Text>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Self-service reset</Text>
        <Text style={styles.infoBody}>If an account exists for your email, CommunityBridge will send a reset link. This message stays generic to protect account privacy.</Text>
      </View>

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
          {Platform.OS === 'web' ? 'Web: your email client opens in a new tab.' : `Support: ${supportEmail}`}
        </Text>
      </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  headerShell: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingHorizontal: 18, paddingVertical: 12 },
  container: { flex: 1, padding: 18, backgroundColor: '#fff' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  titleRow: { marginTop: 8 },
  greeting: { marginLeft: 18, color: '#475569', fontWeight: '700', fontSize: 16 },
  title: { fontSize: 20, fontWeight: '800', color: '#111827' },
  subTitle: { marginTop: 8, fontSize: 13, color: '#6b7280' },
  infoCard: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eff6ff',
  },
  infoTitle: { color: '#1d4ed8', fontWeight: '800', marginBottom: 4 },
  infoBody: { color: '#1e3a8a', lineHeight: 19, fontSize: 12 },
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
