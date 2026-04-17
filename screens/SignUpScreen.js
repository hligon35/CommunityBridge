import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Api from '../src/Api';
import { logger } from '../src/utils/logger';

export default function SignUpScreen({ onDone, onCancel }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      logger.warn('auth', 'Signup failed', { message: e?.message || String(e) });
      Alert.alert('Error', e?.message || 'Signup failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ImageBackground
      source={require('../assets/bbbg.png')}
      resizeMode="cover"
      style={{ flex: 1, backgroundColor: '#fff' }}
      imageStyle={{ transform: [{ scale: 0.92 }] }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, padding: 20, justifyContent: 'center' }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={styles.formCard}>
              <View>
                <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 12 }}>Sign Up</Text>
                <TextInput placeholder="Full name" value={name} onChangeText={setName} style={styles.input} />
                <TextInput
                  placeholder="Email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.input}
                />
                <TextInput placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry style={styles.input} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                  <Button title="Cancel" onPress={() => { if (onCancel) onCancel(); }} />
                  <Button title={busy ? 'Submitting...' : 'Submit'} onPress={submit} disabled={busy} />
                </View>
              </View>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  formCard: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    marginBottom: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
  },
});
