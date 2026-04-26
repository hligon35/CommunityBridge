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
  useWindowDimensions,
  View,
} from 'react-native';
import { useAuth } from '../src/AuthContext';
import * as Api from '../src/Api';
import { formatSupportDetails, reportErrorToSentry } from '../src/utils/reportError';

function getRetryAfterSeconds(error) {
  const fromStatus = Number(error?.httpStatus || 0);
  if (fromStatus === 429) {
    const match = String(error?.message || '').match(/wait\s+(\d+)s/i);
    if (match) return Number(match[1]) || 0;
  }
  return 0;
}

export default function TwoFactorScreen({ navigation }) {
  const auth = useAuth();
  const { height: windowHeight } = useWindowDimensions();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [resendStatus, setResendStatus] = useState('');
  const [resendStatusTone, setResendStatusTone] = useState('muted');
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [countdownNow, setCountdownNow] = useState(Date.now());
  const didAutoSendRef = useRef(false);
  const email = auth?.user?.email ? String(auth.user.email) : '';

  const fieldWidthStyle = useMemo(() => ({ width: '100%', maxWidth: 360 }), []);
  const resendSecondsRemaining = resendAvailableAt > countdownNow
    ? Math.max(0, Math.ceil((resendAvailableAt - countdownNow) / 1000))
    : 0;

  async function sendCode({ manual = true } = {}) {
    if (manual && resendSecondsRemaining > 0) {
      setResendStatus(`A code was already sent. You can resend in ${resendSecondsRemaining}s.`);
      setResendStatusTone('muted');
      return;
    }

    setSending(true);
    try {
      const result = await Api.resend2fa({ method: 'email' });
      const sentAtMs = Number(result?.challenge?.sentAtMs || Date.now());
      const destination = String(result?.challenge?.to || email || '').trim();
      setResendAvailableAt(sentAtMs + 60 * 1000);
      setCountdownNow(Date.now());
      setResendStatus(destination ? `Code sent to ${destination}.` : 'Verification code sent.');
      setResendStatusTone('success');
    } catch (e) {
      const retryAfterSeconds = getRetryAfterSeconds(e);
      if (retryAfterSeconds > 0) {
        setResendAvailableAt(Date.now() + (retryAfterSeconds * 1000));
        setCountdownNow(Date.now());
        setResendStatus(`A code was already sent. You can resend in ${retryAfterSeconds}s.`);
        setResendStatusTone('muted');
        return;
      }

      const msg = String(e?.message || '').trim();
      const eventId = reportErrorToSentry(e, {
        area: 'auth',
        action: 'resend-2fa',
        errorCode: String(e?.code || ''),
        httpStatus: Number(e?.httpStatus || 0),
      });
      if (String(e?.code || '').includes('BB_MFA_FUNCTION_FORBIDDEN')) {
        Alert.alert(
          'Two-step verification is blocked',
          `${msg || 'Cloud Function access is forbidden (403).'}${formatSupportDetails({ code: e?.code, eventId })}`
        );
      } else {
        setResendStatus(msg || 'Could not send code. Please try again.');
        setResendStatusTone('error');
        Alert.alert(
          'Could not send code',
          `${msg || 'Please try again.'}${formatSupportDetails({ code: e?.code, eventId })}`
        );
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
      try { console.info('[TwoFactor] verify: calling Api.verify2fa', { codeLen: cleaned.length }); } catch (_) {}
      await Api.verify2fa({ code: cleaned });
      try { console.info('[TwoFactor] verify: api success, refreshing MFA state'); } catch (_) {}
      const gate = await auth.refreshMfaState();
      try { console.info('[TwoFactor] verify: gate', gate); } catch (_) {}
      if (gate && gate.needsMfa) {
        try { console.warn('[TwoFactor] verify: gate still needsMfa=true after refresh; not navigating'); } catch (_) {}
        Alert.alert('Verification incomplete', 'The server accepted the code but the session is still gated. Please refresh and try again.');
        return;
      }
      try { console.info('[TwoFactor] verify: navigating to Main'); } catch (_) {}
      navigation.replace('Main');
    } catch (e) {
      try { console.error('[TwoFactor] verify failed', { code: e?.code, status: e?.httpStatus, message: e?.message }); } catch (_) {}
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
    sendCode({ manual: false }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token, auth?.needsMfa]);

  useEffect(() => {
    if (resendAvailableAt <= Date.now()) return undefined;

    const interval = setInterval(() => {
      setCountdownNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [resendAvailableAt]);

  try { console.info('[TwoFactor] render', { loading: !!auth?.loading, needsMfa: !!auth?.needsMfa, hasToken: !!auth?.token, email }); } catch (_) {}

  if (auth?.loading) {
    return (
      <View style={[styles.screen, Platform.OS === 'web' ? { minHeight: '100vh' } : null, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={{ marginTop: 12, color: '#374151', fontSize: 16 }}>Loading two-step verification…</Text>
      </View>
    );
  }

  let logoSource = null;
  try { logoSource = require('../assets/icon.png'); } catch (_) { logoSource = null; }

  // On web, use real viewport height so the centered card can't render at 0 height.
  const webViewportStyle = Platform.OS === 'web'
    ? { minHeight: '100vh', width: '100%' }
    : null;
  const brandSectionMinHeight = Platform.OS === 'web'
    ? 120
    : Math.max(110, Math.round(windowHeight * 0.16));

  return (
    <View style={[styles.screen, webViewportStyle]}>
      <KeyboardAvoidingView style={{ flex: 1, minHeight: Platform.OS === 'web' ? '100vh' : undefined }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContainer,
            Platform.OS === 'web' ? styles.scrollContainerWeb : styles.scrollContainerMobile,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.brandSection, { minHeight: brandSectionMinHeight }]}>
            {logoSource ? (
              <Image
                source={logoSource}
                accessibilityLabel="CommunityBridge"
                style={[styles.logo, { height: Math.min(130, Math.round(brandSectionMinHeight * 0.72)) }]}
              />
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Two-step verification</Text>
            <Text style={styles.subtitle}>
              {email ? `Enter the code we sent to ${email}.` : 'Enter the verification code we sent to you.'}
            </Text>
            {resendStatus ? (
              <Text style={[
                styles.statusText,
                resendStatusTone === 'error'
                  ? styles.statusTextError
                  : resendStatusTone === 'success'
                    ? styles.statusTextSuccess
                    : styles.statusTextMuted,
              ]}
              >
                {resendStatus}
              </Text>
            ) : null}

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
              onPress={() => sendCode({ manual: true })}
              accessibilityRole="button"
              style={[styles.secondaryBtn, (busy || sending || resendSecondsRemaining > 0) ? { opacity: 0.7 } : null]}
              disabled={busy || sending || resendSecondsRemaining > 0}
            >
              <Text style={styles.secondaryBtnText}>
                {sending ? 'Sending…' : resendSecondsRemaining > 0 ? `Resend in ${resendSecondsRemaining}s` : 'Resend code'}
              </Text>
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
  scrollContainer: { flexGrow: 1, padding: 20, alignItems: 'center' },
  scrollContainerWeb: { justifyContent: 'flex-start' },
  scrollContainerMobile: { justifyContent: 'center', paddingTop: 32, paddingBottom: 32 },
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
  statusText: { width: '100%', maxWidth: 360, textAlign: 'center', fontSize: 13, marginBottom: 12 },
  statusTextMuted: { color: '#475569' },
  statusTextSuccess: { color: '#15803d' },
  statusTextError: { color: '#b91c1c' },
});
