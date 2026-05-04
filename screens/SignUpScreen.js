import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Api from '../src/Api';
import { logger } from '../src/utils/logger';
import { reportErrorToSentry, formatSupportDetails } from '../src/utils/reportError';
import { getAuthInitError, getAuthInstance, getFirebaseAppInitError } from '../src/firebase';
import { MaterialIcons } from '@expo/vector-icons';
import { USER_ROLES } from '../src/core/tenant/models';
import { getPasswordPolicyError } from '../src/utils/passwordPolicy';
import { useAuth } from '../src/AuthContext';

const signupLogoImage = require('../assets/titlelogo.png');

function getPasswordStrength(password) {
  const raw = String(password || '');
  let score = 0;
  if (raw.length >= 8) score += 1;
  if (/[A-Z]/.test(raw)) score += 1;
  if (/[^A-Za-z0-9]/.test(raw)) score += 1;
  return score;
}

export default function SignUpScreen({ onDone, onCancel }) {
  const auth = useAuth();
  const { height: windowHeight } = useWindowDimensions();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [enrollmentCode, setEnrollmentCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const role = USER_ROLES.PARENT;

  function splitNameParts(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { firstName: '', lastName: '' };
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' '),
    };
  }

  function isValidEmail(value) {
    return /^\S+@\S+\.[^\s@]+$/.test(String(value || '').trim());
  }

  const passwordChecks = useMemo(() => {
    const raw = String(password || '');
    return [
      { label: '8 characters', met: raw.length >= 8 },
      { label: '1 capital letter', met: /[A-Z]/.test(raw) },
      { label: '1 special character', met: /[^A-Za-z0-9]/.test(raw) },
    ];
  }, [password]);

  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);
  const passwordStrengthLabel = passwordStrength <= 1 ? 'Needs work' : passwordStrength === 2 ? 'Almost there' : 'Ready';
  const passwordMismatch = Boolean(confirmPassword) && password !== confirmPassword;

  const submit = async () => {
    const cleanedName = String(name || '').trim();
    const cleanedEmail = String(email || '').trim().toLowerCase();
    const cleanedPassword = String(password || '');
    const cleanedConfirmPassword = String(confirmPassword || '');
    const cleanedEnrollmentCode = String(enrollmentCode || '').trim().toUpperCase();

    if (!cleanedEmail || !cleanedName || !cleanedPassword || !cleanedConfirmPassword || !cleanedEnrollmentCode) {
      Alert.alert('Missing', 'Please provide your full name, email, password, confirmation, and enrollment code.');
      return;
    }
    if (cleanedName.length > 120) {
      Alert.alert('Invalid name', 'Please enter a shorter full name.');
      return;
    }
    if (!isValidEmail(cleanedEmail)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    const passwordPolicyError = getPasswordPolicyError(cleanedPassword);
    if (passwordPolicyError) {
      Alert.alert('Invalid password', passwordPolicyError);
      return;
    }
    if (cleanedPassword !== cleanedConfirmPassword) {
      Alert.alert('Password mismatch', 'Your confirmation password must match exactly.');
      return;
    }
    if (!/^[A-Z0-9-]{4,24}$/.test(cleanedEnrollmentCode)) {
      Alert.alert('Invalid enrollment code', 'Enrollment codes must be 4-24 letters, numbers, or hyphens.');
      return;
    }

    setBusy(true);
    try {
      logger.debug('auth', 'Signup submit');
      const { firstName, lastName } = splitNameParts(cleanedName);
      const res = await Api.signup({
        name: cleanedName,
        firstName,
        lastName,
        email: cleanedEmail,
        password: cleanedPassword,
        role,
        enrollmentCode: cleanedEnrollmentCode,
      });

      try {
        await SecureStore.setItemAsync('bb_bio_enabled', '1');
        await SecureStore.setItemAsync('bb_bio_user', JSON.stringify(res?.user || {}));
      } catch (_) {}

      const gate = await auth?.refreshMfaState?.().catch(() => null);
      if (gate?.needsMfa) {
        auth?.markMfaRequired?.();
        Alert.alert('Account created', 'Enter the verification code we sent to your email to finish creating your account.');
        if (onDone) onDone({ authed: true, needsMfa: true, email: cleanedEmail, fromSignup: true });
        return;
      }

      Alert.alert('Success', 'Account created');
      if (onDone) onDone({ authed: true, email: cleanedEmail });
    } catch (e) {
      const code = e?.code ? String(e.code) : '';
      const msg = e?.message || String(e) || 'Signup failed';
      const fbAppErr = getFirebaseAppInitError();
      const fbAuthErr = getAuthInitError();

      const currentUser = getAuthInstance()?.currentUser || null;
      const permissionDenied = code === 'permission-denied' || String(msg).toLowerCase().includes('missing or insufficient permissions');
      if (permissionDenied && currentUser) {
        auth?.markMfaRequired?.();
        Alert.alert('Verify your email', 'Your account was created. Enter the verification code we sent to your email to finish signing in.');
        if (onDone) onDone({ authed: true, needsMfa: true, email: currentUser.email || cleanedEmail, fromSignup: true });
        return;
      }

      logger.warn('auth', 'Signup failed', { code, message: msg });

      const eventId = reportErrorToSentry(e, {
        area: 'auth',
        action: 'signup',
        errorCode: code,
        firebaseAppInitError: fbAppErr ? String(fbAppErr?.message || fbAppErr) : '',
        firebaseAuthInitError: fbAuthErr ? String(fbAuthErr?.message || fbAuthErr) : '',
      });

      Alert.alert('Error', `${msg}${formatSupportDetails({ code, eventId })}`);
    } finally {
      setBusy(false);
    }
  };

  const brandSectionMinHeight = Platform.OS === 'web'
    ? Math.max(180, Math.round(windowHeight * 0.33))
    : Math.max(120, Math.round(windowHeight * 0.18));
  const OuterWrapper = Platform.OS === 'web' ? View : TouchableWithoutFeedback;
  const outerWrapperProps = Platform.OS === 'web' ? {} : { onPress: Keyboard.dismiss, accessible: false };

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <OuterWrapper {...outerWrapperProps}>
          <ScrollView
            contentContainerStyle={[
              styles.scrollContainer,
              Platform.OS === 'web' ? styles.scrollContainerWeb : styles.scrollContainerMobile,
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={[styles.brandSection, { minHeight: brandSectionMinHeight }]}>
              <Image
                source={signupLogoImage}
                accessibilityLabel="CommunityBridge"
                style={[styles.logo, { height: Math.min(240, Math.round(brandSectionMinHeight * 0.8)) }]}
              />
            </View>

            <View style={styles.formCard}>
              <Text style={styles.title}>First-Time Setup</Text>
              <Text style={styles.subTitle}>
                Create your parent account with the enrollment code provided by your organization.
              </Text>

              <View style={styles.fieldWidth}>
                <TextInput
                  placeholder="Full name"
                  value={name}
                  onChangeText={setName}
                  style={styles.input}
                  autoCapitalize="words"
                  maxLength={120}
                />
              </View>

              <View style={styles.fieldWidth}>
                <TextInput
                  placeholder="Email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
              </View>

              <View style={[styles.fieldWidth, styles.passwordFieldWrap]}>
                <TextInput
                  placeholder="Password"
                  value={password}
                  onChangeText={(value) => setPassword(String(value || '').slice(0, 128))}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  style={[styles.input, styles.passwordInput]}
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

              <View style={styles.fieldWidth}>
                <View style={styles.passwordMeterRow}>
                  {[0, 1, 2].map((index) => (
                    <View
                      key={index}
                      style={[
                        styles.passwordMeterSegment,
                        index < passwordStrength ? styles.passwordMeterSegmentActive : null,
                      ]}
                    />
                  ))}
                </View>
                <Text style={styles.passwordMeterLabel}>Password strength: {passwordStrengthLabel}</Text>
                <View style={styles.requirementsCard}>
                  {passwordChecks.map((item) => (
                    <View key={item.label} style={styles.requirementRow}>
                      <MaterialIcons name={item.met ? 'check-circle' : 'radio-button-unchecked'} size={16} color={item.met ? '#059669' : '#94a3b8'} />
                      <Text style={[styles.requirementText, item.met ? styles.requirementTextMet : null]}>{item.label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={[styles.fieldWidth, styles.passwordFieldWrap]}>
                <TextInput
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChangeText={(value) => setConfirmPassword(String(value || '').slice(0, 128))}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  style={[styles.input, styles.passwordInput, passwordMismatch ? styles.inputError : null]}
                />
                <TouchableOpacity
                  style={styles.peekIconBtn}
                  onPress={() => setShowConfirmPassword((value) => !value)}
                  accessibilityRole="button"
                  accessibilityLabel={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                >
                  <MaterialIcons name={showConfirmPassword ? 'visibility-off' : 'visibility'} size={20} color="#2563eb" />
                </TouchableOpacity>
              </View>
              {passwordMismatch ? <Text style={styles.errorText}>Passwords must match.</Text> : null}

              <View style={styles.fieldWidth}>
                <TextInput
                  placeholder="Enrollment code"
                  value={enrollmentCode}
                  onChangeText={(value) => setEnrollmentCode(String(value || '').replace(/[^a-z0-9-]/gi, '').slice(0, 24).toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={styles.input}
                  maxLength={24}
                />
                <Text style={styles.hintText}>We’ll use this code to find the right organization and link your account to your child or children.</Text>
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  onPress={() => { if (onCancel) onCancel(); }}
                  accessibilityRole="button"
                  style={[styles.secondaryPushBtn, busy ? { opacity: 0.7 } : null]}
                  disabled={busy}
                >
                  <Text style={styles.secondaryPushBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={submit}
                  accessibilityRole="button"
                  accessibilityLabel="Create account"
                  style={[styles.primaryPushBtn, busy ? { opacity: 0.7 } : null]}
                  disabled={busy}
                  activeOpacity={0.9}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryPushBtnText}>Create Account</Text>
                  )}
                </TouchableOpacity>
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
  scrollContainer: { flexGrow: 1, padding: 20, alignItems: 'center' },
  scrollContainerWeb: { justifyContent: 'flex-start' },
  scrollContainerMobile: { justifyContent: 'center', paddingTop: 32, paddingBottom: 32 },
  brandSection: { width: '100%', maxWidth: 420, alignItems: 'center', justifyContent: 'center' },
  logo: { width: '100%', maxWidth: 520, resizeMode: 'contain' },
  formCard: { width: '100%', maxWidth: 420, alignSelf: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  subTitle: { fontSize: 13, lineHeight: 18, color: '#64748b', marginBottom: 14 },
  fieldWidth: { width: '100%', maxWidth: 360 },
  input: { borderWidth: 1, borderColor: '#ccc', paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12, borderRadius: 10, backgroundColor: '#fff' },
  inputError: { borderColor: '#dc2626' },
  passwordFieldWrap: { position: 'relative' },
  passwordInput: { paddingRight: 42 },
  peekIconBtn: { position: 'absolute', right: 10, top: '50%', marginTop: -25, width: 28, height: 40, alignItems: 'center', justifyContent: 'center' },
  passwordMeterRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  passwordMeterSegment: { flex: 1, height: 8, borderRadius: 999, backgroundColor: '#e5e7eb' },
  passwordMeterSegmentActive: { backgroundColor: '#2563eb' },
  passwordMeterLabel: { fontSize: 12, color: '#475569', marginBottom: 8 },
  requirementsCard: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12, backgroundColor: '#f8fafc' },
  requirementRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  requirementText: { marginLeft: 8, fontSize: 12, color: '#64748b' },
  requirementTextMet: { color: '#0f766e', fontWeight: '700' },
  errorText: { color: '#dc2626', fontSize: 12, marginTop: -6, marginBottom: 10 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: 360 },
  primaryPushBtn: { backgroundColor: '#2563eb', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, minWidth: 170, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  primaryPushBtnText: { color: '#fff', fontWeight: '800' },
  secondaryPushBtn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, minWidth: 120, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f8fafc', marginRight: 10 },
  secondaryPushBtnText: { color: '#111827', fontWeight: '800' },
  hintText: { fontSize: 12, color: '#64748b', marginTop: -2, marginBottom: 8 },
});
