import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
// header provided by ScreenWrapper
import { ScreenWrapper } from '../components/ScreenWrapper';
import ImageToggle from '../components/ImageToggle';

const KEY = 'bbs_privacy_defaults_v1';

export default function PrivacyDefaultsScreen(){
  const navigation = useNavigation();
  const [profilePublic, setProfilePublic] = useState(true);
  const [shareContact, setShareContact] = useState(false);
  const [pushNotifications, setPushNotifications] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setProfilePublic(parsed.profilePublic === true);
          setShareContact(parsed.shareContact === true);
          setPushNotifications(parsed.pushNotifications !== false);
        }
      } catch (e) { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    const payload = { profilePublic, shareContact, pushNotifications };
    AsyncStorage.setItem(KEY, JSON.stringify(payload)).catch(() => {});
  }, [profilePublic, shareContact, pushNotifications]);

  return (
    <ScreenWrapper style={styles.container}>
      <View style={styles.body}>
        <View style={styles.row}><Text style={styles.label}>Public profile by default</Text><ImageToggle value={profilePublic} onValueChange={setProfilePublic} accessibilityLabel="Public profile by default" /></View>
        <View style={styles.row}><Text style={styles.label}>Share contact info</Text><ImageToggle value={shareContact} onValueChange={setShareContact} accessibilityLabel="Share contact info" /></View>
        <View style={styles.row}><Text style={styles.label}>Enable push notifications</Text><ImageToggle value={pushNotifications} onValueChange={setPushNotifications} accessibilityLabel="Enable push notifications" /></View>
        <Text style={styles.note}>Changes are saved automatically.</Text>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  body: { padding: 16 },
  p: { color: '#374151' },
  note: { marginTop: 12, color: '#6b7280' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  label: { color: '#111827' }
});