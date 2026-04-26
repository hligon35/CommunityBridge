import React, { useState } from 'react';
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

const signupButtonImage = require('../assets/icons/buttons/signupButton.png');

export default function SignUpScreen({ onDone, onCancel }) {
  const { height: windowHeight } = useWindowDimensions();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const cleanedName = String(name || '').trim();
    const cleanedEmail = String(email || '').trim();
    const cleanedPassword = String(password || '');

    if (!cleanedEmail || !cleanedName || !cleanedPassword) {
      Alert.alert('Missing', 'Please provide name, email, and password');
      return;
    }

    setBusy(true);
    try {
      logger.debug('auth', 'Signup submit');
      const res = await Api.signup({
        name: cleanedName,
        email: cleanedEmail,
        password: cleanedPassword,
        role: 'parent',
      });

      try {
        await SecureStore.setItemAsync('bb_bio_enabled', '1');
        await SecureStore.setItemAsync('bb_bio_user', JSON.stringify(res?.user || {}));
      } catch (_) {}

      Alert.alert('Success', 'Account created');
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
  fieldWidth: { width: '100%', maxWidth: 360 },
  input: { borderWidth: 1, borderColor: '#ccc', paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12, borderRadius: 10, backgroundColor: '#fff' },
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
