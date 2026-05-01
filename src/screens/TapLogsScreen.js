import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useData } from '../DataContext';
import { useAuth } from '../AuthContext';
import { isAdminRole, isStaffRole } from '../core/tenant/models';
import { useTherapySessionWorkspace } from '../features/sessionTracking/hooks/useTherapySessionWorkspace';
import { THERAPY_ROLE_LABELS } from '../utils/roleTerminology';

export default function TapLogsScreen() {
  const route = useRoute();
  const { childId, sessionPreview } = route.params || {};
  const { user } = useAuth();
  const { children = [], fetchAndSync } = useData();
  const role = String(user?.role || '').trim().toLowerCase();
  const isTherapist = role === 'therapist';
  const canManageSession = isAdminRole(user?.role) || isStaffRole(user?.role);
  const child = (children || []).find((entry) => entry.id === childId) || null;
  const preview = Boolean(sessionPreview) || !child;
  const inactivePreview = isTherapist && preview;
  const workspace = useTherapySessionWorkspace({ child, preview, canManageSession, fetchAndSync });
  const items = inactivePreview ? [] : [...(workspace.recentEvents || [])];

  return (
    <ScreenWrapper bannerTitle="Tap Logs" style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Tap Logs</Text>
        <Text style={styles.subtitle}>{inactivePreview ? 'Start a sessions to activate' : `Review logged session events. Post-submission edits still need admin approval routing, but the ${THERAPY_ROLE_LABELS.therapist.toLowerCase()} review screen is now available from the left rail.`}</Text>
        {inactivePreview ? (
          <View style={[styles.card, styles.inactiveCard]}>
            <Text style={styles.inactiveTitle}>Start a sessions to activate</Text>
            <Text style={styles.empty}>No recorded data available.</Text>
          </View>
        ) : null}
        {items.length ? items.map((item) => (
          <View key={item.feedId || `${item.label}-${item.occurredAt}`} style={styles.card}>
            <View style={styles.cardTextWrap}>
              <Text style={styles.cardTitle}>{item.label}</Text>
              <View style={styles.detailActionRow}>
                <Text style={[styles.cardMeta, styles.cardMetaInline]}>{item.detailLabel || item.intensity || 'Logged event'}</Text>
                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.secondaryBtn, styles.secondaryBtnInline]} onPress={() => Alert.alert('Edit request', 'Admin approval routing for therapy-event edits still needs a dedicated server mutation path.')}>
                    <Text style={styles.secondaryBtnText}>Request Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.secondaryBtn, styles.secondaryBtnInline]} onPress={() => Alert.alert('Remove request', 'Admin approval routing for therapy-event removals still needs a dedicated server mutation path.')}>
                    <Text style={styles.secondaryBtnText}>Request Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.cardMeta}>{item.occurredAt ? new Date(item.occurredAt).toLocaleString() : 'Unknown time'}</Text>
            </View>
          </View>
        )) : (!inactivePreview ? <Text style={styles.empty}>No logged events yet.</Text> : null)}
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
  cardTextWrap: { flex: 1 },
  cardTitle: { fontWeight: '800', color: '#0f172a' },
  detailActionRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center' },
  cardMeta: { marginTop: 6, color: '#64748b' },
  cardMetaInline: { marginTop: 0, flex: 1, paddingRight: 12 },
  actions: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center' },
  secondaryBtn: { marginTop: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#e2e8f0' },
  secondaryBtnInline: { marginTop: 0, marginLeft: 8 },
  secondaryBtnText: { color: '#0f172a', fontWeight: '700' },
  inactiveCard: { opacity: 0.6 },
  inactiveTitle: { fontWeight: '800', color: '#0f172a' },
  empty: { marginTop: 20, color: '#64748b' },
});