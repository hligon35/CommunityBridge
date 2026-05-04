import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import LogoTitle from '../src/components/LogoTitle';
import { useAuth } from '../src/AuthContext';
import { getPasswordPolicyError } from '../src/utils/passwordPolicy';
import { consumeApprovalAccessIntent, getApprovalAccessNavigationParams } from '../src/utils/approvalAccessIntent';

export default function CreatePasswordScreen({ navigation }) {
  const auth = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const policyError = useMemo(() => getPasswordPolicyError(password), [password]);

  async function submit() {
    if (policyError) {
      Alert.alert('Password requirements', policyError);
      return;
    }
    if (!password) {
      Alert.alert('Password required', 'Enter a new password to finish activation.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Re-enter the same password in both fields.');
      return;
    }

    setBusy(true);
    try {
      // This completes the one-time invite session and switches the account to normal password sign-in.
      await auth.completeInvitePasswordSetup(password);
      const gate = await auth.refreshMfaState();
      if (gate?.needsMfa) {
        navigation.replace('TwoFactor');
        return;
      }
      const approvalIntent = consumeApprovalAccessIntent();
      const approvalParams = getApprovalAccessNavigationParams(approvalIntent);
      navigation.replace('Main', approvalParams || undefined);
    } catch (error) {
      Alert.alert('Could not save password', String(error?.message || error || 'Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" translucent={false} backgroundColor="#ffffff" />
      <View style={styles.headerShell}>
        <View style={styles.headerRow}>
          <LogoTitle width={132} height={42} />
          <Text style={styles.greeting}>Account setup</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.formCard}>
          <Text style={styles.title}>Create New Password</Text>
          <Text style={styles.subtitle}>Your access code worked. Create a permanent password to activate normal sign-in for this account.</Text>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Password rules</Text>
            <Text style={styles.infoBody}>Minimum 8 characters, at least 1 uppercase letter, and at least 1 special character.</Text>
          </View>

          <Text style={styles.label}>New password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              style={[styles.input, styles.passwordInput]}
              placeholder="Create password"
              secureTextEntry={!showPassword}
              editable={!busy}
              autoCapitalize="none"
              maxLength={128}
            />
            <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword((current) => !current)} disabled={busy}>
              <MaterialIcons name={showPassword ? 'visibility-off' : 'visibility'} size={22} color="#475569" />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Confirm password</Text>
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            style={styles.input}
            placeholder="Confirm password"
            secureTextEntry={!showPassword}
            editable={!busy}
            autoCapitalize="none"
            maxLength={128}
          />

          {password ? <Text style={[styles.helperText, policyError ? styles.helperTextError : null]}>{policyError || 'Password meets the required rules.'}</Text> : null}

          <TouchableOpacity style={[styles.primaryButton, busy ? styles.primaryButtonDisabled : null]} onPress={submit} disabled={busy}>
            <Text style={styles.primaryButtonText}>{busy ? 'Saving...' : 'Save password'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  headerShell: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingHorizontal: 18, paddingVertical: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  greeting: { marginLeft: 18, color: '#475569', fontWeight: '700', fontSize: 16 },
  scrollContent: { flexGrow: 1, padding: 18, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  formCard: { width: '100%', maxWidth: 560, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 20, padding: 22, backgroundColor: '#fff', shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 3 },
  title: { fontSize: 20, fontWeight: '800', color: '#111827' },
  subtitle: { marginTop: 8, color: '#6b7280', lineHeight: 20 },
  infoCard: { marginTop: 14, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#dbeafe', backgroundColor: '#eff6ff' },
  infoTitle: { color: '#1d4ed8', fontWeight: '800', marginBottom: 4 },
  infoBody: { color: '#1e3a8a', lineHeight: 19, fontSize: 12 },
  label: { marginTop: 14, fontSize: 13, fontWeight: '700', color: '#111827' },
  input: { marginTop: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: '#fff' },
  passwordRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, marginTop: 0 },
  eyeButton: { marginLeft: 8, width: 46, height: 46, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  helperText: { marginTop: 10, color: '#166534', lineHeight: 20 },
  helperTextError: { color: '#b91c1c' },
  primaryButton: { marginTop: 18, backgroundColor: '#111827', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: '#fff', fontWeight: '800' },
});