import React from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { MaterialIcons } from '@expo/vector-icons';
// header provided by ScreenWrapper

const SUPPORT_EMAIL = (() => {
  try {
    const v = (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_SUPPORT_EMAIL)
      ? String(process.env.EXPO_PUBLIC_SUPPORT_EMAIL)
      : '';
    return v.trim() || 'support@buddyboard.getsparqd.com';
  } catch (e) {
    return 'support@buddyboard.getsparqd.com';
  }
})();

export default function HelpScreen() {
  return (
    <ScreenWrapper hideBanner style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        <Text style={styles.sectionTitle}>Arrival Detection</Text>
        <Text style={styles.paragraph}>
          Arrival Detection helps the center know when you're approaching for pickup. It uses your device's location to
          detect when you're nearby. This feature requires you to grant location permissions in your device settings.
        </Text>

        <Text style={styles.sectionTitle}>Push Notifications</Text>
        <Text style={styles.paragraph}>
          Use the Push Notifications settings to control which notifications you receive (chats, timeline posts,
          mentions, comments, and reminders). If notifications are disabled in your device, enable them from Settings → Apps → BuddyBoard → Notifications.
        </Text>

        <Text style={styles.sectionTitle}>Chats</Text>
        <Text style={styles.paragraph}>
          The Chats area contains private messages between you and staff or other parents. Use the Messages screen to
          view threads and reply. If you don't see a new message, try pulling down to refresh the list.
        </Text>

        <Text style={styles.sectionTitle}>My Child</Text>
        <Text style={styles.paragraph}>
          The My Child screen shows your child's profile, assigned therapists, care plan, and notes. Tap the avatar to
          view more details or to load demo data.
        </Text>

        <Text style={styles.sectionTitle}>Account & Support</Text>
        <Text style={styles.paragraph}>
          To sign out, use the Logout button in the top-right. For account issues or to request help, tap the button below to email support.
        </Text>

        <TouchableOpacity style={styles.contact} onPress={() => Linking.openURL(`mailto:${encodeURIComponent(SUPPORT_EMAIL)}?subject=${encodeURIComponent('BuddyBoard Support')}`) }>
          <MaterialIcons name="email" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.contactText}>Email Support</Text>
        </TouchableOpacity>

        <View style={{ height: 28 }} />
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 18, paddingTop: 12 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 10 },
  sectionTitle: { marginTop: 12, fontSize: 16, fontWeight: '700' },
  paragraph: { marginTop: 6, color: '#374151', lineHeight: 20 },
  contact: { marginTop: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: '#2563eb', padding: 10, borderRadius: 8, alignSelf: 'flex-start' },
  contactText: { color: '#fff', fontWeight: '700' }
});
