import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../AuthContext';
import { ADMIN_SECTION_KEYS, canAccessAdminSection, hasFullAdminSectionAccess, isBcbaRole } from '../core/tenant/models';

export default function AdminSettingsHubScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const isBcba = isBcbaRole(user?.role);
  const canManageOfficeSettings = hasFullAdminSectionAccess(user?.role, ADMIN_SECTION_KEYS.SETTINGS);
  const canSeeSettingsWorkspace = canAccessAdminSection(user?.role, ADMIN_SECTION_KEYS.SETTINGS);

  const sections = [
    { title: 'Organization Settings', description: 'Office configuration for organization profile, campuses, and operating defaults.', action: () => Alert.alert('Organization Settings', 'Organization profile editing is staged through the office configuration workspace.'), hidden: !canManageOfficeSettings },
    { title: 'User Roles & Permissions', description: 'Office role and access management.', action: () => navigation.navigate('ManagePermissions'), hidden: !canManageOfficeSettings },
    { title: 'Clinical Templates', description: 'BCBA clinical templates and reusable programming standards.', action: () => navigation.navigate('ProgramDirectory', { focusMode: 'library' }), hidden: !isBcba },
    { title: 'Import Center', description: 'Office imports for users, rosters, and documents.', action: () => navigation.navigate('ImportCenter'), hidden: !canManageOfficeSettings },
    { title: 'Integrations', description: 'Operational integrations and external service setup.', action: () => Alert.alert('Integrations', 'Integration controls are ready for the admin settings shell and can be connected to live providers next.'), hidden: !canManageOfficeSettings },
    { title: 'Branding', description: 'Logo, visual identity, and published experience controls.', action: () => Alert.alert('Branding', 'Branding controls are staged for the admin settings shell.'), hidden: !canManageOfficeSettings },
    { title: 'Notification Settings', description: 'Cross-role notification defaults and delivery preferences.', action: () => navigation.navigate('PrivacyDefaults'), hidden: !canSeeSettingsWorkspace },
  ].filter((item) => !item.hidden);

  return (
    <ScreenWrapper style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Settings</Text>
          <Text style={styles.title}>System configuration and operational controls</Text>
          <Text style={styles.subtitle}>{isBcba ? 'BCBAs see clinical templates and shared notification controls here.' : 'Office admins manage organizational setup, imports, integrations, branding, and permissions here.'}</Text>
        </View>

        {sections.map((section) => (
          <View key={section.title} style={styles.card}>
            <Text style={styles.cardTitle}>{section.title}</Text>
            <Text style={styles.cardText}>{section.description}</Text>
            <TouchableOpacity style={styles.button} onPress={section.action}>
              <Text style={styles.buttonText}>Open</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16 },
  hero: { borderRadius: 20, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', padding: 18 },
  eyebrow: { color: '#1d4ed8', fontWeight: '800', textTransform: 'uppercase', fontSize: 12 },
  title: { marginTop: 6, fontSize: 24, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 8, color: '#475569', lineHeight: 20 },
  card: { marginTop: 14, borderRadius: 18, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  cardText: { marginTop: 8, color: '#64748b', lineHeight: 20 },
  button: { marginTop: 14, alignSelf: 'flex-start', borderRadius: 10, backgroundColor: '#2563eb', paddingVertical: 10, paddingHorizontal: 14 },
  buttonText: { color: '#fff', fontWeight: '800' },
});