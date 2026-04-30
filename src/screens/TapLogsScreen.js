import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useData } from '../DataContext';
import { useAuth } from '../AuthContext';
import { isAdminRole, isStaffRole } from '../core/tenant/models';
import { useTherapySessionWorkspace } from '../features/sessionTracking/hooks/useTherapySessionWorkspace';

export default function TapLogsScreen() {
  const route = useRoute();
  const { childId, sessionPreview } = route.params || {};
  const { user } = useAuth();
  const { children = [], fetchAndSync } = useData();
  const canManageSession = isAdminRole(user?.role) || isStaffRole(user?.role);
  const child = (children || []).find((entry) => entry.id === childId) || null;
  const workspace = useTherapySessionWorkspace({ child, preview: Boolean(sessionPreview) || !child, canManageSession, fetchAndSync });
  const items = [...(workspace.recentEvents || [])];

  return (
    <ScreenWrapper bannerTitle="Tap Logs" style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Tap Logs</Text>
        <Text style={styles.subtitle}>Review logged session events. Post-submission edits still need admin approval routing, but the therapist review screen is now available from the left rail.</Text>
        {items.length ? items.map((item) => (
          <View key={item.feedId || `${item.label}-${item.occurredAt}`} style={styles.card}>
            <Text style={styles.cardTitle}>{item.label}</Text>
            <Text style={styles.cardMeta}>{item.detailLabel || item.intensity || 'Logged event'}</Text>
            <Text style={styles.cardMeta}>{item.occurredAt ? new Date(item.occurredAt).toLocaleString() : 'Unknown time'}</Text>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => Alert.alert('Edit request', 'Admin approval routing for therapy-event edits still needs a dedicated server mutation path.')}>
                <Text style={styles.secondaryBtnText}>Request Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => Alert.alert('Remove request', 'Admin approval routing for therapy-event removals still needs a dedicated server mutation path.')}>
                <Text style={styles.secondaryBtnText}>Request Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        )) : <Text style={styles.empty}>No logged events yet.</Text>}
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 8, color: '#64748b', lineHeight: 20 },
  card: { marginTop: 14, borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', padding: 14 },
  cardTitle: { fontWeight: '800', color: '#0f172a' },
  cardMeta: { marginTop: 6, color: '#64748b' },
  actions: { flexDirection: 'row', marginTop: 12 },
  secondaryBtn: { marginRight: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#e2e8f0' },
  secondaryBtnText: { color: '#0f172a', fontWeight: '700' },
  empty: { marginTop: 20, color: '#64748b' },
});