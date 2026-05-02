import React, { useEffect, useMemo, useState } from 'react';
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
  Modal,
  TouchableWithoutFeedback,
  Keyboard,
  TouchableOpacity,
  Linking,
  useWindowDimensions,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Api from '../src/Api';
import { logger } from '../src/utils/logger';
import { reportErrorToSentry, formatSupportDetails } from '../src/utils/reportError';
import { getAuthInitError, getAuthInstance, getFirebaseAppInitError } from '../src/firebase';
import { MaterialIcons } from '@expo/vector-icons';
import { USER_ROLES } from '../src/core/tenant/models';
import { useAuth } from '../src/AuthContext';

const signupLogoImage = require('../assets/titlelogo.png');
const SUPPORT_EMAIL = (() => {
  try {
    const value = (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_SUPPORT_EMAIL)
      ? String(process.env.EXPO_PUBLIC_SUPPORT_EMAIL)
      : '';
    return value.trim() || 'support@communitybridge.app';
  } catch (_) {
    return 'support@communitybridge.app';
  }
})();

export default function SignUpScreen({ onDone, onCancel }) {
  const auth = useAuth();
  const { height: windowHeight } = useWindowDimensions();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [programId, setProgramId] = useState('');
  const [enrollmentCode, setEnrollmentCode] = useState('');
  const [organizations, setOrganizations] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeMenu, setActiveMenu] = useState('');
  const role = USER_ROLES.PARENT;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const result = await Api.listOrganizations();
        const nextItems = Array.isArray(result?.items) ? result.items : [];
        if (!mounted) return;
        setOrganizations(nextItems);
        if (!organizationId && nextItems[0]?.id) {
          setOrganizationId(nextItems[0].id);
        }
      } catch (_) {
        if (!mounted) return;
        setOrganizations([]);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!organizationId) {
      setPrograms([]);
      setProgramId('');
      return () => { mounted = false; };
    }
    (async () => {
      try {
        const result = await Api.listPrograms(organizationId);
        const nextItems = Array.isArray(result?.items) ? result.items : [];
        if (!mounted) return;
        setPrograms(nextItems);
        if (!nextItems.some((item) => item.id === programId)) {
          setProgramId(nextItems[0]?.id || '');
        }
      } catch (_) {
        if (!mounted) return;
        setPrograms([]);
        setProgramId('');
      }
    })();
    return () => { mounted = false; };
  }, [organizationId]);

  const organizationOptions = useMemo(
    () => organizations.map((item) => ({ value: item.id, label: item.name })),
    [organizations]
  );

  const programOptions = useMemo(
    () => programs.map((item) => ({ value: item.id, label: item.name })),
    [programs]
  );

  const menuOptions = activeMenu === 'organization'
      ? organizationOptions
      : activeMenu === 'program'
        ? programOptions
        : [];

  async function requestStaffAccess() {
    const subject = encodeURIComponent('CommunityBridge staff/admin access request');
    const body = encodeURIComponent(
      'I need staff or administrator access for CommunityBridge.\n\n' +
      'Organization: \n' +
      'Program: \n' +
      'Requested role: \n' +
      'Work email: \n\n' +
      'Please send the appropriate invite or next steps.'
    );
    const url = `mailto:${encodeURIComponent(SUPPORT_EMAIL)}?subject=${subject}&body=${body}`;

    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        return;
      }
    } catch (_) {}

    Alert.alert('Staff/Admin access', `Staff, faculty, therapist, BCBA, and admin access must be invited by an existing administrator. Contact ${SUPPORT_EMAIL} from your work email if you need help getting an invite.`);
  }

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

  function getPasswordPolicyError(value) {
    const raw = String(value || '');
    if (raw.length < 8) return 'Password must be at least 8 characters.';
    if (!/[a-z]/.test(raw) || !/[A-Z]/.test(raw) || !/[0-9]/.test(raw)) {
      return 'Password must include uppercase, lowercase, and a number.';
    }
    return '';
  }

  const submit = async () => {
    const cleanedName = String(name || '').trim();
    const cleanedEmail = String(email || '').trim().toLowerCase();
    const cleanedPassword = String(password || '');
    const cleanedEnrollmentCode = String(enrollmentCode || '').trim().toUpperCase();

    if (!cleanedEmail || !cleanedName || !cleanedPassword || !organizationId || !programId || !cleanedEnrollmentCode) {
      Alert.alert('Missing', 'Please provide name, email, password, organization, program, and enrollment code');
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
        organizationId,
        programId,
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
              <Text style={styles.title}>Register</Text>
              <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>Parent registration only</Text>
                <Text style={styles.infoBody}>
                  Staff, faculty, therapists, BCBAs, and administrators must be invited by an existing organization administrator before they can activate an account.
                </Text>
                <TouchableOpacity
                  style={styles.staffAccessBtn}
                  onPress={requestStaffAccess}
                  accessibilityRole="button"
                  accessibilityLabel="Request staff or admin access"
                >
                  <Text style={styles.staffAccessBtnText}>Request Staff/Admin Access</Text>
                </TouchableOpacity>
              </View>

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
                <Text style={styles.sectionLabel}>Organization</Text>
                <TouchableOpacity
                  style={styles.dropdownTrigger}
                  onPress={() => setActiveMenu('organization')}
                  accessibilityRole="button"
                  accessibilityLabel="Choose organization"
                >
                  <Text style={styles.dropdownTriggerText}>
                    {organizationOptions.find((option) => option.value === organizationId)?.label || 'Select organization'}
                  </Text>
                  <MaterialIcons name={activeMenu === 'organization' ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={22} color="#475569" />
                </TouchableOpacity>
              </View>

              <View style={styles.fieldWidth}>
                <Text style={styles.sectionLabel}>Program</Text>
                <TouchableOpacity
                  style={[styles.dropdownTrigger, !organizationId ? styles.dropdownTriggerDisabled : null]}
                  onPress={() => organizationId && setActiveMenu('program')}
                  accessibilityRole="button"
                  accessibilityLabel="Choose program"
                  disabled={!organizationId}
                >
                  <Text style={[styles.dropdownTriggerText, !organizationId ? styles.dropdownTriggerTextDisabled : null]}>
                    {programOptions.find((option) => option.value === programId)?.label || 'Select program'}
                  </Text>
                  <MaterialIcons name={activeMenu === 'program' ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={22} color="#475569" />
                </TouchableOpacity>
              </View>

              <View style={styles.fieldWidth}>
                <TextInput
                  placeholder="Organization / Enrollment code"
                  value={enrollmentCode}
                  onChangeText={(value) => setEnrollmentCode(String(value || '').replace(/[^a-z0-9-]/gi, '').slice(0, 24).toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={styles.input}
                  maxLength={24}
                />
              </View>

              <View style={styles.fieldWidth}>
                <Text style={styles.sectionLabel}>Account type</Text>
                <View style={styles.readonlyBadge}>
                  <Text style={styles.readonlyBadgeText}>Parent</Text>
                </View>
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

              <Modal visible={Boolean(activeMenu)} transparent animationType="fade" onRequestClose={() => setActiveMenu('')}>
                <TouchableWithoutFeedback onPress={() => setActiveMenu('')}>
                  <View style={styles.modalBackdrop}>
                    <TouchableWithoutFeedback>
                      <View style={styles.dropdownModalCard}>
                        <Text style={styles.dropdownModalTitle}>
                          {activeMenu === 'organization' ? 'Select organization' : 'Select program'}
                        </Text>
                        {menuOptions.map((option) => {
                          const currentValue = activeMenu === 'organization' ? organizationId : programId;
                          const isSelected = option.value === currentValue;
                          return (
                            <TouchableOpacity
                              key={option.value}
                              style={[styles.dropdownOption, isSelected ? styles.dropdownOptionSelected : null]}
                              onPress={() => {
                                if (activeMenu === 'organization') {
                                  setOrganizationId(option.value);
                                  setProgramId('');
                                } else {
                                  setProgramId(option.value);
                                }
                                setActiveMenu('');
                              }}
                              accessibilityRole="button"
                            >
                              <Text style={[styles.dropdownOptionText, isSelected ? styles.dropdownOptionTextSelected : null]}>
                                {option.label}
                              </Text>
                              {isSelected ? <MaterialIcons name="check" size={18} color="#2563eb" /> : null}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </TouchableWithoutFeedback>
                  </View>
                </TouchableWithoutFeedback>
              </Modal>
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
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  infoCard: { width: '100%', maxWidth: 360, borderRadius: 12, borderWidth: 1, borderColor: '#dbeafe', backgroundColor: '#eff6ff', padding: 12, marginBottom: 14 },
  infoTitle: { fontSize: 14, fontWeight: '800', color: '#1d4ed8', marginBottom: 6 },
  infoBody: { fontSize: 13, lineHeight: 18, color: '#1e3a8a' },
  staffAccessBtn: { marginTop: 10, alignSelf: 'flex-start', backgroundColor: '#1d4ed8', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  staffAccessBtnText: { color: '#fff', fontWeight: '800' },
  fieldWidth: { width: '100%', maxWidth: 360 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12, borderRadius: 10, backgroundColor: '#fff' },
  dropdownTrigger: { borderWidth: 1, borderColor: '#ccc', paddingVertical: 12, paddingHorizontal: 12, marginBottom: 12, borderRadius: 10, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropdownTriggerText: { color: '#111827', fontSize: 15 },
  dropdownTriggerDisabled: { backgroundColor: '#f8fafc', borderColor: '#e5e7eb' },
  dropdownTriggerTextDisabled: { color: '#94a3b8' },
  readonlyBadge: { borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 12, marginBottom: 12 },
  readonlyBadgeText: { color: '#1d4ed8', fontSize: 15, fontWeight: '700' },
  passwordFieldWrap: { position: 'relative' },
  passwordInput: { paddingRight: 42 },
  peekIconBtn: { position: 'absolute', right: 10, top: '50%', marginTop: -25, width: 28, height: 40, alignItems: 'center', justifyContent: 'center' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: 360 },
  primaryPushBtn: { backgroundColor: '#2563eb', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, minWidth: 170, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  primaryPushBtnText: { color: '#fff', fontWeight: '800' },
  secondaryPushBtn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, minWidth: 120, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f8fafc', marginRight: 10 },
  secondaryPushBtnText: { color: '#111827', fontWeight: '800' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.28)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  dropdownModalCard: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  dropdownModalTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 10 },
  dropdownOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, marginTop: 6, backgroundColor: '#f8fafc' },
  dropdownOptionSelected: { backgroundColor: '#eff6ff' },
  dropdownOptionText: { color: '#111827', fontWeight: '600' },
  dropdownOptionTextSelected: { color: '#1d4ed8' },
});
