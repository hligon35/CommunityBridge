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
  TouchableWithoutFeedback,
  Keyboard,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Api from '../src/Api';
import { logger } from '../src/utils/logger';
import { reportErrorToSentry, formatSupportDetails } from '../src/utils/reportError';
import { getAuthInitError, getFirebaseAppInitError } from '../src/firebase';
import { MaterialIcons } from '@expo/vector-icons';
import { listActiveOrganizations } from '../src/core/tenant/OrganizationRepository';
import { listBranchesByOrganization } from '../src/core/tenant/BranchRepository';
import { resolveSelection } from '../src/core/tenant/EnrollmentService';
import { USER_ROLES } from '../src/core/tenant/models';

const signupButtonImage = require('../assets/icons/buttons/signupButton.png');

export default function SignUpScreen({ onDone, onCancel }) {
  const { height: windowHeight } = useWindowDimensions();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(USER_ROLES.PARENT);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [directoryBusy, setDirectoryBusy] = useState(true);
  const [organizations, setOrganizations] = useState([]);
  const [branches, setBranches] = useState([]);
  const [organizationSearch, setOrganizationSearch] = useState('');
  const [branchSearch, setBranchSearch] = useState('');
  const [selectedOrganization, setSelectedOrganization] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [enrollmentCode, setEnrollmentCode] = useState('');
  const [resolvedCampusName, setResolvedCampusName] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      setDirectoryBusy(true);
      try {
        const items = await listActiveOrganizations();
        if (!mounted) return;
        setOrganizations(items);
      } catch (e) {
        if (!mounted) return;
        Alert.alert('Directory unavailable', e?.message || 'Unable to load organizations right now.');
      } finally {
        if (mounted) setDirectoryBusy(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!selectedOrganization?.id) {
        setBranches([]);
        setSelectedBranch(null);
        return;
      }
      setDirectoryBusy(true);
      try {
        const items = await listBranchesByOrganization(selectedOrganization.id);
        if (!mounted) return;
        setBranches(items);
      } catch (e) {
        if (!mounted) return;
        Alert.alert('Directory unavailable', e?.message || 'Unable to load branches right now.');
      } finally {
        if (mounted) setDirectoryBusy(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedOrganization]);

  const filteredOrganizations = useMemo(() => {
    const needle = String(organizationSearch || '').trim().toLowerCase();
    if (!needle) return organizations;
    return organizations.filter((organization) => String(organization?.name || '').toLowerCase().includes(needle));
  }, [organizations, organizationSearch]);

  const filteredBranches = useMemo(() => {
    const needle = String(branchSearch || '').trim().toLowerCase();
    if (!needle) return branches;
    return branches.filter((branch) => String(branch?.name || '').toLowerCase().includes(needle));
  }, [branches, branchSearch]);

  const roleOptions = [
    { value: USER_ROLES.PARENT, label: 'Parent' },
    { value: USER_ROLES.FACULTY, label: 'Faculty' },
    { value: USER_ROLES.THERAPIST, label: 'Therapist' },
    { value: USER_ROLES.BCBA, label: 'BCBA' },
  ];

  function splitNameParts(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { firstName: '', lastName: '' };
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' '),
    };
  }

  const submit = async () => {
    const cleanedName = String(name || '').trim();
    const cleanedEmail = String(email || '').trim();
    const cleanedPassword = String(password || '');
    const cleanedEnrollmentCode = String(enrollmentCode || '').trim();

    if (!cleanedEmail || !cleanedName || !cleanedPassword) {
      Alert.alert('Missing', 'Please provide name, email, and password');
      return;
    }

    if (!selectedOrganization?.id || !selectedBranch?.id || !cleanedEnrollmentCode) {
      Alert.alert('Missing', 'Please select an organization, branch, and enrollment code.');
      return;
    }

    setBusy(true);
    try {
      logger.debug('auth', 'Signup submit');
      const resolvedContext = await resolveSelection({
        organizationId: selectedOrganization.id,
        branchId: selectedBranch.id,
        enrollmentCode: cleanedEnrollmentCode,
      });
      setResolvedCampusName(resolvedContext?.campus?.name || '');
      const { firstName, lastName } = splitNameParts(cleanedName);
      const res = await Api.signup({
        name: cleanedName,
        firstName,
        lastName,
        email: cleanedEmail,
        password: cleanedPassword,
        role,
        organizationId: selectedOrganization.id,
        branchId: selectedBranch.id,
        campusId: resolvedContext?.campus?.id || '',
        enrollmentCode: cleanedEnrollmentCode,
      });

      try {
        await SecureStore.setItemAsync('bb_bio_enabled', '1');
        await SecureStore.setItemAsync('bb_bio_user', JSON.stringify(res?.user || {}));
      } catch (_) {}

      Alert.alert('Success', `Account created${resolvedContext?.campus?.name ? ` for ${resolvedContext.campus.name}` : ''}`);
      if (onDone) onDone({ authed: true });
    } catch (e) {
      const code = e?.code ? String(e.code) : '';
      const msg = e?.message || String(e) || 'Signup failed';
      const fbAppErr = getFirebaseAppInitError();
      const fbAuthErr = getAuthInitError();

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
                source={require('../assets/icon.png')}
                accessibilityLabel="CommunityBridge"
                style={[styles.logo, { height: Math.min(180, Math.round(brandSectionMinHeight * 0.65)) }]}
              />
            </View>

            <View style={styles.formCard}>
              <Text style={styles.title}>Register</Text>

              <View style={styles.fieldWidth}>
                <TextInput
                  placeholder="Full name"
                  value={name}
                  onChangeText={setName}
                  style={styles.input}
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.fieldWidth}>
                <TextInput
                  placeholder="Email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.input}
                />
              </View>

              <View style={styles.fieldWidth}>
                <Text style={styles.sectionLabel}>Account type</Text>
                <View style={styles.roleRow}>
                  {roleOptions.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.roleChip, role === option.value ? styles.roleChipActive : null]}
                      onPress={() => setRole(option.value)}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.roleChipText, role === option.value ? styles.roleChipTextActive : null]}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.fieldWidth}>
                <Text style={styles.sectionLabel}>Organization</Text>
                <TextInput
                  placeholder="Search organizations"
                  value={organizationSearch}
                  onChangeText={setOrganizationSearch}
                  style={styles.input}
                />
                <View style={styles.directoryList}>
                  {directoryBusy && !organizations.length ? <ActivityIndicator color="#2563eb" /> : null}
                  {filteredOrganizations.slice(0, 6).map((organization) => (
                    <TouchableOpacity
                      key={organization.id}
                      style={[styles.directoryItem, selectedOrganization?.id === organization.id ? styles.directoryItemActive : null]}
                      onPress={() => {
                        setSelectedOrganization(organization);
                        setSelectedBranch(null);
                        setResolvedCampusName('');
                      }}
                    >
                      <Text style={[styles.directoryItemTitle, selectedOrganization?.id === organization.id ? styles.directoryItemTitleActive : null]}>{organization.name}</Text>
                      {organization.shortCode ? <Text style={styles.directoryItemMeta}>{organization.shortCode}</Text> : null}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.fieldWidth}>
                <Text style={styles.sectionLabel}>Branch</Text>
                <TextInput
                  placeholder="Search branches"
                  value={branchSearch}
                  onChangeText={setBranchSearch}
                  style={styles.input}
                  editable={Boolean(selectedOrganization?.id)}
                />
                <View style={styles.directoryList}>
                  {directoryBusy && selectedOrganization?.id ? <ActivityIndicator color="#2563eb" /> : null}
                  {filteredBranches.slice(0, 6).map((branch) => (
                    <TouchableOpacity
                      key={branch.id}
                      style={[styles.directoryItem, selectedBranch?.id === branch.id ? styles.directoryItemActive : null]}
                      onPress={() => {
                        setSelectedBranch(branch);
                        setResolvedCampusName('');
                      }}
                    >
                      <Text style={[styles.directoryItemTitle, selectedBranch?.id === branch.id ? styles.directoryItemTitleActive : null]}>{branch.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.fieldWidth}>
                <Text style={styles.sectionLabel}>Enrollment code</Text>
                <TextInput
                  placeholder="Enter enrollment code"
                  value={enrollmentCode}
                  onChangeText={setEnrollmentCode}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={styles.input}
                />
                {resolvedCampusName ? <Text style={styles.resolvedText}>Matched campus: {resolvedCampusName}</Text> : null}
              </View>

              <View style={[styles.fieldWidth, styles.passwordFieldWrap]}>
                <TextInput
                  placeholder="Password"
                  value={password}
                  onChangeText={setPassword}
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
                    <Image source={signupButtonImage} style={styles.primaryButtonImage} resizeMode="contain" />
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
  logo: { width: '100%', maxWidth: 320, resizeMode: 'contain' },
  formCard: { width: '100%', maxWidth: 420, alignSelf: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 8 },
  fieldWidth: { width: '100%', maxWidth: 360 },
  input: { borderWidth: 1, borderColor: '#ccc', paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12, borderRadius: 10, backgroundColor: '#fff' },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  roleChip: { borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#f8fafc', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, marginRight: 8, marginBottom: 8 },
  roleChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  roleChipText: { color: '#1e293b', fontWeight: '700' },
  roleChipTextActive: { color: '#fff' },
  directoryList: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 8, marginBottom: 12, minHeight: 52 },
  directoryItem: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#f8fafc', marginBottom: 8 },
  directoryItemActive: { backgroundColor: '#dbeafe' },
  directoryItemTitle: { color: '#0f172a', fontWeight: '700' },
  directoryItemTitleActive: { color: '#1d4ed8' },
  directoryItemMeta: { color: '#64748b', marginTop: 2 },
  resolvedText: { color: '#0f766e', fontWeight: '600', marginBottom: 12 },
  passwordFieldWrap: { position: 'relative' },
  passwordInput: { paddingRight: 42 },
  peekIconBtn: { position: 'absolute', right: 10, top: 10, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: 360 },
  primaryPushBtn: { backgroundColor: '#2563eb', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, minWidth: 170, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  primaryPushBtnText: { color: '#fff', fontWeight: '800' },
  secondaryPushBtn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, minWidth: 120, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f8fafc', marginRight: 10 },
  secondaryPushBtnText: { color: '#111827', fontWeight: '800' },
  primaryButtonImage: { width: 150, height: 36 },
});
