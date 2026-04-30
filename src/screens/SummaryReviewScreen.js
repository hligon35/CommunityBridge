import React, { useMemo } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useData } from '../DataContext';
import { useAuth } from '../AuthContext';
import { avatarSourceFor } from '../utils/idVisibility';
import { isAdminRole, isStaffRole } from '../core/tenant/models';
import TherapySessionPanel from '../features/sessionTracking/components/TherapySessionPanel';
import { useTherapySessionWorkspace } from '../features/sessionTracking/hooks/useTherapySessionWorkspace';
const { PREVIEW_CHILD } = require('../features/sessionTracking/utils/previewWorkspace');

export default function SummaryReviewScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { childId, sessionPreview } = route.params || {};
  const { children = [], fetchAndSync } = useData();
  const canManageSession = isAdminRole(user?.role) || isStaffRole(user?.role);
  const child = (children || []).find((entry) => entry.id === childId) || null;
  const preview = Boolean(sessionPreview) || !child;
  const displayChild = child || PREVIEW_CHILD;
  const workspace = useTherapySessionWorkspace({ child, preview, canManageSession, fetchAndSync });

  const subtitle = useMemo(() => {
    if (preview) return 'Interactive preview';
    return [displayChild.age, displayChild.room].filter(Boolean).join(' • ');
  }, [displayChild.age, displayChild.room, preview]);

  return (
    <ScreenWrapper style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <Image source={avatarSourceFor(displayChild)} style={styles.avatar} />
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>Summary Review</Text>
              <Text style={styles.name}>{displayChild.name}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
          </View>
          <View style={styles.linkRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('TapTracker', { childId: child?.id || null, sessionPreview: preview })}>
              <Text style={styles.secondaryButtonText}>Open Tap Tracker</Text>
            </TouchableOpacity>
          </View>
        </View>
        <TherapySessionPanel workspace={workspace} mode="summary" title="Session Summary Review" />
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16 },
  headerCard: { borderRadius: 18, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', padding: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#e5e7eb' },
  headerTextWrap: { marginLeft: 12, flex: 1 },
  title: { color: '#2563eb', fontWeight: '800', textTransform: 'uppercase', fontSize: 12 },
  name: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginTop: 4 },
  subtitle: { marginTop: 4, color: '#64748b' },
  linkRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 },
  secondaryButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#e2e8f0' },
  secondaryButtonText: { color: '#0f172a', fontWeight: '700' },
});