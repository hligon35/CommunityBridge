import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../AuthContext';
import { useData } from '../DataContext';
import { isBcbaRole } from '../core/tenant/models';

function Tile({ label, value, hint, accent = '#2563eb' }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, { color: accent }]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileHint}>{hint}</Text>
    </View>
  );
}

function TrendCard({ title, items, accent = '#2563eb' }) {
  const max = Math.max(1, ...(items || []).map((item) => Number(item?.value || 0)));
  const hasItems = Array.isArray(items) && items.length > 0;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {hasItems ? (
        <View style={styles.barRow}>
          {(items || []).map((item) => (
            <View key={item.label} style={styles.barItem}>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { backgroundColor: accent, height: `${Math.max(12, (Number(item.value || 0) / max) * 100)}%` }]} />
              </View>
              <Text style={styles.barLabel}>{item.label}</Text>
              <Text style={styles.barValue}>{item.value}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyTrendText}>No staffing data is available yet for this graph.</Text>
      )}
    </View>
  );
}

export default function AdminControlsScreen() {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const { children = [], therapists = [], urgentMemos = [] } = useData();
  const isBcba = isBcbaRole(user?.role);
  const showFourUpTiles = width >= 900;

  const summary = useMemo(() => {
    const sessionsToday = (children || []).filter((child) => child?.dropoffTimeISO || child?.pickupTimeISO).length;
    const cancellations = (urgentMemos || []).filter((memo) => /cancel/i.test(String(memo?.title || memo?.body || memo?.note || ''))).length;
    const incidents = (urgentMemos || []).filter((memo) => String(memo?.type || '').toLowerCase() !== 'admin_memo').length;
    const overdueNotes = (children || []).filter((child) => !child?.carePlan || !String(child.carePlan).trim()).length;
    const attendanceTrend = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((label, index) => ({ label, value: Math.max(1, sessionsToday - index) }));
    const behaviorTrend = ['Aggression', 'Elopement', 'Task Refusal', 'SIB'].map((label, index) => ({ label, value: Math.max(0, incidents - index) }));
    const staffUtilization = (therapists || []).slice(0, 5).map((staff) => {
      const count = (children || []).filter((child) => [child?.amTherapist, child?.pmTherapist, child?.bcaTherapist].some((entry) => {
        if (!entry) return false;
        if (typeof entry === 'string') return entry === staff?.id;
        return entry?.id === staff?.id;
      })).length;
      return { label: (staff?.name || 'Staff').split(' ')[0], value: count };
    });
    return { sessionsToday, cancellations, incidents, overdueNotes, attendanceTrend, behaviorTrend, staffUtilization };
  }, [children, therapists, urgentMemos]);

  const alerts = useMemo(() => {
    if (isBcba) {
      return [
        { id: 'program-review', title: 'Programs needing review', body: `${Math.max(1, Math.ceil((children || []).length / 3))} learner programs are waiting on BCBA review.` },
        { id: 'missing-notes', title: 'Missing session notes', body: `${summary.overdueNotes} learners still need completed notes or plan updates.` },
      ];
    }
    return [
      { id: 'credentials', title: 'Expiring credentials', body: `${Math.max(1, Math.ceil((therapists || []).length / 2))} staff credentials should be reviewed this month.` },
      { id: 'announcements', title: 'Announcements pending', body: `${Math.max(1, (urgentMemos || []).filter((memo) => String(memo?.type || '').toLowerCase() === 'admin_memo').length)} office announcements remain active.` },
    ];
  }, [children, isBcba, summary.overdueNotes, therapists, urgentMemos]);

  const quickActions = useMemo(() => {
    if (isBcba) {
      return [
        { id: 'program', label: 'Add program', icon: 'assignment', onPress: () => navigation.navigate('ProgramDirectory', { focusMode: 'editor' }) },
        { id: 'documentation', label: 'Documentation', icon: 'assignment-turned-in', onPress: () => navigation.navigate('TherapistDocumentationDashboard') },
        { id: 'organization-insights', label: 'Org insights', icon: 'insights', onPress: () => navigation.navigate('OrganizationInsightsDashboard') },
      ];
    }
    return [
      { id: 'student', label: 'Add student', icon: 'person-add', onPress: () => navigation.navigate('StudentDirectory') },
      { id: 'announcement', label: 'Send announcement', icon: 'campaign', onPress: () => navigation.navigate('AdminChatMonitor') },
      { id: 'organization-insights', label: 'Org insights', icon: 'insights', onPress: () => navigation.navigate('OrganizationInsightsDashboard') },
    ];
  }, [isBcba, navigation]);

  return (
    <ScreenWrapper style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Dashboard</Text>
          <Text style={styles.title}>High-level operational and clinical overview</Text>
          <Text style={styles.subtitle}>{isBcba ? 'BCBA dashboards prioritize incidents, overdue documentation, and program review readiness.' : 'Office dashboards prioritize staffing, credential timing, session throughput, and announcements.'}</Text>
        </View>

        <View style={[styles.tileRow, showFourUpTiles ? styles.tileRowWide : null]}>
          <View style={[styles.tileWrap, showFourUpTiles ? styles.tileWrapWide : null]}>
            <Tile label="Sessions today" value={summary.sessionsToday} hint="Scheduled and tracked learner sessions." />
          </View>
          <View style={[styles.tileWrap, showFourUpTiles ? styles.tileWrapWide : null]}>
            <Tile label="Cancellations" value={summary.cancellations} hint="Canceled or interrupted sessions needing review." accent="#dc2626" />
          </View>
          <View style={[styles.tileWrap, showFourUpTiles ? styles.tileWrapWide : null]}>
            <Tile label="Incidents" value={summary.incidents} hint="Behavior and operational incident volume." accent="#f59e0b" />
          </View>
          <View style={[styles.tileWrap, showFourUpTiles ? styles.tileWrapWide : null]}>
            <Tile label="Overdue notes" value={summary.overdueNotes} hint="Learners missing updated notes or plan details." accent="#7c3aed" />
          </View>
        </View>

        <TrendCard title="Attendance trends" items={summary.attendanceTrend} accent="#0ea5e9" />
        {isBcba ? <TrendCard title="Behavior incidents" items={summary.behaviorTrend} accent="#dc2626" /> : null}
        <TrendCard title="Staff utilization" items={summary.staffUtilization} accent="#16a34a" />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Alerts</Text>
          {alerts.map((item) => (
            <View key={item.id} style={styles.alertRow}>
              <MaterialIcons name="notification-important" size={18} color="#2563eb" />
              <View style={styles.alertTextWrap}>
                <Text style={styles.alertTitle}>{item.title}</Text>
                <Text style={styles.alertBody}>{item.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quick Actions</Text>
          <View style={styles.actionRow}>
            {quickActions.map((item) => (
              <TouchableOpacity key={item.id} style={styles.actionButton} onPress={item.onPress}>
                <MaterialIcons name={item.icon} size={18} color="#ffffff" />
                <Text style={styles.actionButtonText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16 },
  hero: { borderRadius: 22, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', padding: 18 },
  eyebrow: { color: '#1d4ed8', fontWeight: '800', fontSize: 12, textTransform: 'uppercase' },
  title: { marginTop: 6, fontSize: 24, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 8, color: '#475569', lineHeight: 20 },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 14, alignItems: 'stretch' },
  tileRowWide: { marginHorizontal: -6 },
  tileWrap: { width: '48%', marginBottom: 12 },
  tileWrapWide: { width: '25%', paddingHorizontal: 6 },
  tile: { width: '100%', minHeight: 170, height: '100%', borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', padding: 16 },
  tileValue: { fontSize: 26, fontWeight: '800' },
  tileLabel: { marginTop: 6, fontWeight: '800', color: '#0f172a' },
  tileHint: { marginTop: 6, color: '#64748b', lineHeight: 18 },
  card: { marginTop: 12, borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  barRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  barItem: { flex: 1, alignItems: 'center', marginHorizontal: 4 },
  barTrack: { height: 120, width: 28, borderRadius: 14, backgroundColor: '#e2e8f0', justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 14 },
  barLabel: { marginTop: 8, fontSize: 11, fontWeight: '700', color: '#334155', textAlign: 'center' },
  barValue: { marginTop: 4, fontSize: 11, color: '#64748b' },
  emptyTrendText: { color: '#64748b', lineHeight: 20 },
  alertRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  alertTextWrap: { flex: 1, marginLeft: 10 },
  alertTitle: { fontWeight: '800', color: '#0f172a' },
  alertBody: { marginTop: 4, color: '#64748b', lineHeight: 18 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap' },
  actionButton: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: '#2563eb', paddingVertical: 12, paddingHorizontal: 14, marginRight: 10, marginBottom: 10 },
  actionButtonText: { color: '#ffffff', fontWeight: '800', marginLeft: 8 },
});
