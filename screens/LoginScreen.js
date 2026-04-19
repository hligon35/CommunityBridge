import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ActivityIndicator, TouchableOpacity, Modal, Platform, Image, KeyboardAvoidingView, ScrollView, TouchableWithoutFeedback, Keyboard, useWindowDimensions } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { MaterialIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import * as Google from 'expo-auth-session/providers/google';
import * as AuthSession from 'expo-auth-session';
import SignUpScreen from './SignUpScreen';
import ForgotPasswordScreen from './ForgotPasswordScreen';
import { useAuth } from '../src/AuthContext';
import { logger } from '../src/utils/logger';
import { Sentry } from '../src/sentry';
import { reportErrorToSentry, formatSupportDetails } from '../src/utils/reportError';
import { getAuthInitError, getFirebaseAppInitError } from '../src/firebase';

WebBrowser.maybeCompleteAuthSession();

function getExpoExtraValue(key) {
  try {
    return (
      Constants?.expoConfig?.extra?.[key] ??
      Constants?.easConfig?.extra?.[key] ??
      Constants?.manifest2?.extra?.[key] ??
      Constants?.manifest?.extra?.[key]
    );
  } catch (_) {
    return undefined;
  }
}

export default function LoginScreen({ navigation, suppressAutoRedirect = false }) {
  const { height: windowHeight } = useWindowDimensions();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Use biometrics');
  const [hasBiometricAuthStored, setHasBiometricAuthStored] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const auth = useAuth();

  const iosGoogleClientId = String(
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
      getExpoExtraValue('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID') ||
      ''
  );
  const androidGoogleClientId = String(
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
      getExpoExtraValue('EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID') ||
      ''
  );
  const webGoogleClientId = String(
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
      getExpoExtraValue('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID') ||
      ''
  );

  // IMPORTANT:
  // Do NOT fall back to the web client ID on native platforms.
  // Using a web client ID on iOS/Android is a common cause of Google OAuth
  // `redirect_uri_mismatch` errors.
  const googleEnabled = Boolean(
    (Platform.OS === 'ios' && iosGoogleClientId) ||
      (Platform.OS === 'android' && androidGoogleClientId) ||
      (Platform.OS === 'web' && webGoogleClientId)
  );

  const googleRedirectUri = useMemo(() => {
    // For the deployed web app we want to land back on /home.
    if (Platform.OS === 'web') {
      try {
        const origin = String(globalThis?.location?.origin || '').trim();
        if (origin) return `${origin}/home`;
      } catch (_) {}
      return AuthSession.makeRedirectUri();
    }

    // Native: use an app scheme deep link.
    return AuthSession.makeRedirectUri({ scheme: 'communitybridge', path: 'oauthredirect' });
  }, []);

  // IMPORTANT:
  // - On native (iOS/Android), Google AuthSession defaults to ResponseType.Code and will
  //   exchange for tokens (including idToken) without requiring us to force an implicit flow.
  // - Forcing ResponseType.IdToken on native commonly results in Google 400 errors.
  const [googleRequest, googleResponse, googlePromptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: iosGoogleClientId || undefined,
    androidClientId: androidGoogleClientId || undefined,
    webClientId: webGoogleClientId || undefined,
    redirectUri: googleRedirectUri,
    scopes: ['profile', 'email'],
  });

  const SENTRY_OTLP_BASE = 'https://o4510654674632704.ingest.us.sentry.io/api/4510654676533248/otlp';
  const SENTRY_OTLP_TRACES_URL = `${SENTRY_OTLP_BASE}/v1/traces`;
  const SENTRY_OTLP_METRICS_URL = `${SENTRY_OTLP_BASE}/v1/metrics`;
  const SENTRY_OTLP_LOGS_URL = `${SENTRY_OTLP_BASE}/v1/logs`;
  const sentryEnv = String(
    process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ||
      getExpoExtraValue('EXPO_PUBLIC_SENTRY_ENVIRONMENT') ||
      ''
  ).toLowerCase();
  const sentryDsn = String(
    process.env.EXPO_PUBLIC_SENTRY_DSN ||
      getExpoExtraValue('EXPO_PUBLIC_SENTRY_DSN') ||
      ''
  );
  let updatesChannel = '';
  try {
    updatesChannel = String(Updates.channel || Updates.releaseChannel || '').toLowerCase();
  } catch (_) {
    updatesChannel = '';
  }

  const showSentryTestButton = (
    updatesChannel === 'testflight-internal' ||
    sentryEnv === 'internal' ||
    sentryEnv === 'testflight-internal'
  );

  const fieldWidthStyle = useMemo(() => ({ width: '100%', maxWidth: 360 }), []);

  async function doLogin(){
    const cleanedEmail = String(email || '').trim();
    const cleanedPassword = String(password || '');
    if (!cleanedEmail) {
      Alert.alert('Missing email', 'Please enter your email.');
      return;
    }
    if (!cleanedPassword) {
      Alert.alert('Missing password', 'Please enter your password.');
      return;
    }

    setBusy(true);
    try{
      logger.debug('auth', 'Login submit', { hasEmail: !!cleanedEmail });
      const res = await auth.login(cleanedEmail, cleanedPassword);
      try {
        await SecureStore.setItemAsync('bb_bio_enabled', '1');
        await SecureStore.setItemAsync('bb_bio_user', JSON.stringify(res?.user || auth?.user || {}));
        setHasBiometricAuthStored(true);
      } catch (_) {}
      const gate = await auth.refreshMfaState();
      navigation.replace(gate?.needsMfa ? 'TwoFactor' : 'Main');
    } catch (e) {
      const code = e?.code ? String(e.code) : '';
      const msg = e?.message || String(e) || 'Please check your credentials and try again.';
      const fbAppErr = getFirebaseAppInitError();
      const fbAuthErr = getAuthInitError();

      logger.warn('auth', 'Login failed', { code, message: msg });

      const eventId = reportErrorToSentry(e, {
        area: 'auth',
        action: 'login',
        errorCode: code,
        firebaseAppInitError: fbAppErr ? String(fbAppErr?.message || fbAppErr) : '',
        firebaseAuthInitError: fbAuthErr ? String(fbAuthErr?.message || fbAuthErr) : '',
      });

      Alert.alert(
        'Login failed',
        `${msg}${formatSupportDetails({ code, eventId })}`
      );
    } finally {
      setBusy(false);
    }
  }

  function showGoogleConfigHelp() {
    Alert.alert(
      'Google sign-in not configured',
      `Missing the Google Client ID for this platform.\n\nFor EAS builds, add these to your build profile env (or EAS project env vars):\n- EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID\n- EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID\n- EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID\n\nThis build will use redirect URI:\n${googleRedirectUri}\n\nThen rebuild the app binary.`
    );
  }

  useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type !== 'success') return;

    const idToken =
      googleResponse?.authentication?.idToken ||
      googleResponse?.params?.id_token ||
      '';

    if (!idToken) {
      Alert.alert('Google sign-in failed', 'Missing Google ID token.');
      return;
    }

    (async () => {
      setBusy(true);
      try {
        await auth.loginWithGoogle(idToken);
        const gate = await auth.refreshMfaState();
        navigation.replace(gate?.needsMfa ? 'TwoFactor' : 'Main');
      } catch (e) {
        Alert.alert('Google sign-in failed', e?.message || 'Please try again.');
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleResponse]);

  useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type === 'success') return;

    // Surface useful details for debugging OAuth 400s.
    const err = String(googleResponse?.error?.message || googleResponse?.error || '').trim();
    const desc = String(googleResponse?.params?.error_description || '').trim();
    const code = String(googleResponse?.params?.error || '').trim();
    if (googleResponse.type === 'error') {
      Alert.alert(
        'Google sign-in failed',
        `${desc || err || 'Google OAuth error.'}` +
          `${code ? `\n\nCode: ${code}` : ''}` +
          `${googleRequest?.redirectUri ? `\n\nRedirect URI: ${googleRequest.redirectUri}` : ''}`
      );
    }
  }, [googleResponse]);

  async function sendInternalSentryTestError() {
    try {
      if (!sentryDsn) {
        Alert.alert(
          'Sentry not configured',
          'Sentry DSN is empty in this build/update. Add EXPO_PUBLIC_SENTRY_DSN to EAS project env (or build profile env) and publish again.'
        );
        return;
      }

      let eventId;
      Sentry.withScope((scope) => {
        scope.setTag('bb_sentry_test', '1');
        scope.setTag('bb_env', sentryEnv || 'unknown');
        scope.setExtra('apiBaseUrl', String(process.env.EXPO_PUBLIC_API_BASE_URL || ''));
        scope.setExtra('time', new Date().toISOString());
        eventId = Sentry.captureException(new Error('First error'));
      });

      try {
        await Sentry.flush(2000);
      } catch (_) {
        // ignore flush failures
      }

      Alert.alert(
        'Sentry test event sent',
        `Event ID: ${eventId || '(none)'}\n\nCheck Sentry Issues to confirm it arrived:\nhttps://sparq-digital.sentry.io/issues/?project=4511236400873472`
      );
    } catch (e) {
      Alert.alert('Failed', e?.message || 'Could not send test error.');
    }
  }

  async function doBiometricUnlock() {
    setBiometricBusy(true);
    try {
      const storedEnabled = await SecureStore.getItemAsync('bb_bio_enabled');
      const storedUser = await SecureStore.getItemAsync('bb_bio_user');
      if (!storedEnabled || !storedUser) {
        Alert.alert('Biometric sign-in', 'No saved sign-in found. Please sign in with email and password first.');
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock CommunityBridge',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      if (result?.success) {
        if (!auth?.token) {
          Alert.alert('Biometric unlock', 'Please sign in with email and password.');
          return;
        }
        const gate = await auth.refreshMfaState();
        navigation.replace(gate?.needsMfa ? 'TwoFactor' : 'Main');
        return;
      }

      // user_cancel / system_cancel are expected; don't throw noisy alerts
      const err = result?.error ? String(result.error) : '';
      if (err && err !== 'user_cancel' && err !== 'system_cancel' && err !== 'app_cancel') {
        Alert.alert('Biometric unlock failed', 'Please sign in with email and password.');
      }
    } catch (e) {
      Alert.alert('Biometric unlock failed', e?.message || 'Please sign in with email and password.');
    } finally {
      setBiometricBusy(false);
    }
  }

  // If already authenticated (e.g. dev auto-login), redirect to Home
  // This effect must be declared before any early returns to preserve
  // the order of Hooks between renders.
  useEffect(() => {
    if (suppressAutoRedirect) return;
    if (!auth.loading && auth.token) {
      navigation.replace('Main');
    }
  }, [auth.loading, auth.token, suppressAutoRedirect]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (auth.loading) return;

      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();

        let label = 'Use biometrics';
        try {
          const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
          if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) label = 'Use Face ID';
          else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) label = 'Use Touch ID';
        } catch (e) {
          // ignore; default label
        }

        if (mounted) {
          setBiometricAvailable(Boolean(hasHardware && enrolled));
          setBiometricLabel(label);
        }
      } catch (e) {
        if (mounted) setBiometricAvailable(false);
      }
    })();

    return () => { mounted = false; };
  }, [auth.loading]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const storedEnabled = await SecureStore.getItemAsync('bb_bio_enabled');
        const storedUser = await SecureStore.getItemAsync('bb_bio_user');
        if (mounted) setHasBiometricAuthStored(!!storedEnabled && !!storedUser);
      } catch (e) {
        if (mounted) setHasBiometricAuthStored(false);
      }
    })();
    return () => { mounted = false; };
  }, [auth.loading, showSignUp]);

  const brandSectionMinHeight = Math.max(180, Math.round(windowHeight * 0.33));
  const OuterWrapper = Platform.OS === 'web' ? View : TouchableWithoutFeedback;
  const outerWrapperProps = Platform.OS === 'web' ? {} : { onPress: Keyboard.dismiss, accessible: false };

  if (auth.loading) return (
    <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator size="large" />
    </View>
  );

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <OuterWrapper {...outerWrapperProps}>
          <ScrollView
            contentContainerStyle={styles.scrollContainer}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={[styles.brandSection, { minHeight: brandSectionMinHeight }]}>
              <Image
                source={require('../public/logo.png')}
                accessibilityLabel="CommunityBridge"
                style={[styles.loginLogo, { height: Math.min(180, Math.round(brandSectionMinHeight * 0.65)) }]}
              />
            </View>
            <View style={styles.formCard}>
              <View style={fieldWidthStyle}>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  style={styles.input}
                  placeholder="Email"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={[fieldWidthStyle, styles.passwordFieldWrap]}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  style={[styles.input, styles.passwordInput]}
                  placeholder="Password"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                />
                <TouchableOpacity
                  style={styles.peekIconBtn}
                  onPress={() => setShowPassword((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <MaterialIcons name={showPassword ? 'visibility-off' : 'visibility'} size={20} color="#2563eb" />
                </TouchableOpacity>
              </View>

          <View style={styles.actionsRow}>
            {showSentryTestButton ? (
              <TouchableOpacity
                onPress={sendInternalSentryTestError}
                accessibilityRole="button"
                accessibilityLabel="Internal: send Sentry test error"
                style={[styles.iconPushBtn, { marginRight: 10 }]}
                disabled={busy}
              >
                <MaterialIcons name="bug-report" size={20} color="#2563eb" />
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              onPress={doLogin}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              style={[styles.primaryPushBtn, busy ? { opacity: 0.7 } : null]}
              disabled={busy}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryPushBtnText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
            </TouchableOpacity>

            {biometricAvailable && hasBiometricAuthStored ? (
              <TouchableOpacity
                onPress={doBiometricUnlock}
                accessibilityRole="button"
                accessibilityLabel={biometricLabel}
                style={[styles.iconPushBtn, { marginLeft: 10 }, (biometricBusy || busy) ? { opacity: 0.7 } : null]}
                disabled={biometricBusy || busy}
              >
                <MaterialIcons
                  name={String(biometricLabel).toLowerCase().includes('face') ? 'face' : 'fingerprint'}
                  size={22}
                  color="#2563eb"
                />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.linksRow}>
            <TouchableOpacity
              onPress={() => setShowSignUp(true)}
              accessibilityRole="button"
              disabled={busy}
            >
              <Text style={styles.linkText}>Register</Text>
            </TouchableOpacity>

            <Text style={styles.linkSeparator} accessibilityElementsHidden accessibilityIgnoresInvertColors>
              /
            </Text>

            <TouchableOpacity
              onPress={() => {
                setShowForgotPassword(true);
              }}
              accessibilityRole="button"
              disabled={busy}
            >
              <Text style={styles.linkText}>Forgot password?</Text>
            </TouchableOpacity>
          </View>

          <Modal visible={showSignUp} animationType="slide" onRequestClose={() => setShowSignUp(false)}>
            <SignUpScreen
              onDone={(result) => {
                setShowSignUp(false);
                    if (result && result.authed) {
                      auth.refreshMfaState()
                        .then((gate) => navigation.replace(gate?.needsMfa ? 'TwoFactor' : 'Main'))
                        .catch(() => navigation.replace('Main'));
                    }
              }}
              onCancel={() => setShowSignUp(false)}
            />
          </Modal>

          <Modal visible={showForgotPassword} animationType="slide" onRequestClose={() => setShowForgotPassword(false)}>
            <ForgotPasswordScreen
              onDone={() => setShowForgotPassword(false)}
              onCancel={() => setShowForgotPassword(false)}
            />
          </Modal>

          {/* Google sign-in at the bottom of the form */}
          <View style={styles.secondaryActions}>
            {googleEnabled ? (
              <View style={{ width: '100%', maxWidth: 360 }}>
                <TouchableOpacity
                  onPress={() => {
                    if (!googleRequest) {
                      showGoogleConfigHelp();
                      return;
                    }
                    googlePromptAsync().catch(() => {
                      Alert.alert('Google sign-in failed', 'Could not start sign-in.');
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Google"
                  style={[styles.secondaryBtn, busy ? { opacity: 0.7 } : null]}
                  disabled={busy}
                >
                  <MaterialIcons name="g-translate" size={18} color="#2563eb" />
                  <Text style={styles.secondaryBtnText}>Continue with Google</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {showSentryTestButton ? (
              <View style={{ width: '100%', maxWidth: 360, marginTop: 10 }}>
                {/* Debug Sentry test is available via the bug icon near Sign In */}
              </View>
            ) : null}

            {showSentryTestButton ? (
              <View style={{ width: '100%', maxWidth: 360, marginTop: 10 }}>
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert(
                      'Sentry OTLP endpoints',
                      `These are ingest endpoints (not browsable in a browser).\n\nTraces:\n${SENTRY_OTLP_TRACES_URL}\n\nMetrics:\n${SENTRY_OTLP_METRICS_URL}\n\nLogs:\n${SENTRY_OTLP_LOGS_URL}`
                    );
                  }}
                  accessibilityRole="button"
                  style={styles.secondaryBtn}
                >
                  <MaterialIcons name="info-outline" size={18} color="#2563eb" />
                  <Text style={styles.secondaryBtnText}>Show Sentry OTLP endpoints</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Internal Sentry test moved to icon button near Sign In */}
          </View>
              </View>
            </ScrollView>
          </OuterWrapper>
        </KeyboardAvoidingView>
      </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  scrollContainer: { flexGrow: 1, padding: 20, alignItems: 'center', justifyContent: 'flex-start' },
  brandSection: { width: '100%', maxWidth: 420, alignItems: 'center', justifyContent: 'center' },
  loginLogo: { width: '100%', maxWidth: 320, resizeMode: 'contain' },
  formCard: { width: '100%', maxWidth: 420, alignSelf: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 20 },
  input: { borderWidth: 1, borderColor: '#ccc', paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12, borderRadius: 10, backgroundColor: '#fff' },
  registerWrap: { marginTop: 12, alignItems: 'center' },
  registerText: { color: '#2563eb', fontWeight: '600' },
  passwordFieldWrap: { position: 'relative' },
  passwordInput: { paddingRight: 42 },
  peekIconBtn: { position: 'absolute', right: 10, top: 10, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  primaryPushBtn: { backgroundColor: '#2563eb', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10, minWidth: 140, alignItems: 'center' },
  primaryPushBtnText: { color: '#fff', fontWeight: '800' },
  iconPushBtn: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' },
  linksRow: { marginTop: 12, width: '100%', maxWidth: 360, flexDirection: 'row', justifyContent: 'center', alignSelf: 'center', alignItems: 'center' },
  linkText: { color: '#2563eb', fontWeight: '700' },
  linkSeparator: { marginHorizontal: 10, color: '#6b7280', fontWeight: '700' },
  secondaryActions: { marginTop: 10, alignItems: 'center' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f8fafc', width: '100%', maxWidth: 360 },
  secondaryBtnText: { marginLeft: 8, color: '#111827', fontWeight: '700' },
});
