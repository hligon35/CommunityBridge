import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../src/AuthContext';
import * as Api from '../src/Api';

export default function TwoFactorScreen({ navigation }) {
  const auth = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const didAutoSendRef = useRef(false);
  const email = auth?.user?.email ? String(auth.user.email) : '';

  const fieldWidthStyle = useMemo(() => ({ width: '100%', maxWidth: 360 }), []);

  async function sendCode() {
    setSending(true);
    try {
      await Api.resend2fa({ method: 'email' });
    } catch (e) {
      const msg = String(e?.message || '').trim();
      if (String(e?.code || '').includes('BB_MFA_FUNCTION_FORBIDDEN')) {
        Alert.alert('Two-step verification is blocked', msg || 'Cloud Function access is forbidden (403).');
      } else {
        Alert.alert('Could not send code', msg || 'Please try again.');
      }
    } finally {
      setSending(false);
    }
  }

  async function verify() {
    const cleaned = String(code || '').trim();
    if (!cleaned) {
      Alert.alert('Missing code', 'Enter the verification code.');
      return;
    }

    setBusy(true);
    try {
      await Api.verify2fa({ code: cleaned });
      await auth.refreshMfaState();
      navigation.replace('Main');
    } catch (e) {
      Alert.alert('Verification failed', e?.message || 'Please check the code and try again.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    try { console.info('[TwoFactor] mount effect', { hasToken: !!auth?.token, needsMfa: !!auth?.needsMfa, loading: !!auth?.loading }); } catch (_) {}
    if (!auth?.token) return;
    if (!auth?.needsMfa) {
      try { console.info('[TwoFactor] needsMfa false → replacing with Main'); } catch (_) {}
      navigation.replace('Main');
      return;
    }

    // Auto-send once on entry (best effort). Avoid spamming when tokens refresh.
    if (didAutoSendRef.current) return;
    didAutoSendRef.current = true;
    sendCode().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token, auth?.needsMfa]);

  if (auth?.loading) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.brandSection}>
            <Image
              source={require('../public/logo.png')}
              accessibilityLabel="CommunityBridge"
              style={styles.logo}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Two-step verification</Text>
            <Text style={styles.subtitle}>
              {email ? `Enter the code we sent to ${email}.` : 'Enter the verification code we sent to you.'}
            </Text>

            <View style={fieldWidthStyle}>
              <TextInput
                value={code}
                onChangeText={setCode}
                style={styles.input}
                placeholder="Verification code"
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={8}
              />
            </View>

            <TouchableOpacity
              onPress={verify}
              accessibilityRole="button"
              style={[styles.primaryBtn, (busy || sending) ? { opacity: 0.7 } : null]}
              disabled={busy || sending}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryBtnText}>{busy ? 'Verifying…' : 'Verify'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={sendCode}
              accessibilityRole="button"
              style={[styles.secondaryBtn, (busy || sending) ? { opacity: 0.7 } : null]}
              disabled={busy || sending}
            >
              <Text style={styles.secondaryBtnText}>{sending ? 'Sending…' : 'Resend code'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => auth.logout().catch(() => {})}
              accessibilityRole="button"
              style={styles.linkBtn}
            >
              <Text style={styles.linkText}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  scrollContainer: { flexGrow: 1, padding: 20, alignItems: 'center', justifyContent: 'flex-start' },
  brandSection: { width: '100%', maxWidth: 420, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  logo: { width: '100%', maxWidth: 260, height: 110, resizeMode: 'contain' },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginTop: 10,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#374151', marginBottom: 12, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderRadius: 10,
    backgroundColor: '#fff',
    textAlign: 'center',
    fontSize: 18,
    letterSpacing: 2,
  },
  primaryBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '800' },
  secondaryBtn: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#111827', fontWeight: '700' },
  linkBtn: { marginTop: 12, alignItems: 'center' },
  linkText: { color: '#2563eb', fontWeight: '700' },
});
