import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../AuthContext';
import { useData } from '../DataContext';
import { isAdminRole } from '../core/tenant/models';
import { useBehaviorSystemReports } from '../features/reporting/hooks/useBehaviorSystemReports';
import ReportMetricCard from '../features/reporting/components/ReportMetricCard';
import MiniBarChart from '../features/reporting/components/MiniBarChart';
import HeatmapGrid from '../features/reporting/components/HeatmapGrid';
import { childHasParent, findLinkedParentId } from '../utils/directoryLinking';
const { isChildLinkedToTherapist, resolveSelectedDashboardChild } = require('../features/sessionTracking/utils/dashboardSessionTarget');
const { getEffectiveChatIdentity } = require('../utils/demoIdentity');

function findReportChildren(user, children, parents) {
  const items = Array.isArray(children) ? children : [];
  const role = String(user?.role || '').trim().toLowerCase();
  const effectiveUser = getEffectiveChatIdentity(user);
  if (role === 'therapist') return items.filter((child) => isChildLinkedToTherapist(child, effectiveUser?.id));
  if (role.includes('parent')) {
    const linkedParentId = findLinkedParentId(user, parents) || user?.id;
    return items.filter((child) => childHasParent(child, linkedParentId));
  }
  return items;
}

export default function ReportsScreen() {
  const route = useRoute();
  const { user } = useAuth();
  const { children = [], parents = [], urgentMemos = [] } = useData();
  const reportChildren = useMemo(() => findReportChildren(user, children, parents), [user, children, parents]);
  const [selectedChildId, setSelectedChildId] = useState(route?.params?.childId || reportChildren[0]?.id || null);
  const [reportScope, setReportScope] = useState('clinical');

  useEffect(() => {
    if (route?.params?.childId && route.params.childId !== selectedChildId) {
      setSelectedChildId(route.params.childId);
    }
  }, [route?.params?.childId, selectedChildId]);

  useEffect(() => {
    const next = resolveSelectedDashboardChild(reportChildren, selectedChildId || route?.params?.childId || null);
    if (next?.id !== selectedChildId) setSelectedChildId(next?.id || null);
  }, [reportChildren, route?.params?.childId, selectedChildId]);

  const selectedChild = useMemo(() => resolveSelectedDashboardChild(reportChildren, selectedChildId), [reportChildren, selectedChildId]);
  const { loading, error, childReports, schoolWide, sessionSummariesByChild } = useBehaviorSystemReports({
    selectedChildId: selectedChild?.id || null,
    reportChildIds: reportChildren.map((child) => child.id),
    children: reportChildren,
    urgentMemos,
  });
  const isAdmin = isAdminRole(user?.role);

  return (
    <ScreenWrapper style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Reporting Engine</Text>
          <Text style={styles.title}>Behavior, mood, mastery, and operational reporting</Text>
          <Text style={styles.subtitle}>Reusable reporting services aggregate therapy summaries, attendance, mood history, and communication activity into parent, clinician, and admin views.</Text>
        </View>

        <View style={styles.filterCard}>
          <Text style={styles.sectionTitle}>Learner Filter</Text>
          <View style={styles.scopeRow}>
            {[
              { key: 'clinical', label: 'Clinical Reports' },
              { key: 'operational', label: 'Operational Reports' },
            ].map((scope) => (
              <TouchableOpacity key={scope.key} style={[styles.scopeChip, reportScope === scope.key ? styles.scopeChipActive : null]} onPress={() => setReportScope(scope.key)}>
                <Text style={[styles.scopeChipText, reportScope === scope.key ? styles.scopeChipTextActive : null]}>{scope.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.filterRow}>
            {reportChildren.map((child) => (
              <TouchableOpacity key={child.id} style={[styles.filterChip, child.id === selectedChild?.id ? styles.filterChipActive : null]} onPress={() => setSelectedChildId(child.id)}>
                <Text style={[styles.filterChipText, child.id === selectedChild?.id ? styles.filterChipTextActive : null]}>{child.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {loading ? <View style={styles.loadingWrap}><ActivityIndicator color="#2563eb" /></View> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {reportScope === 'clinical' ? (
          <>
            <View style={styles.metricRow}>
              <ReportMetricCard label="Sessions" value={String((sessionSummariesByChild[selectedChild?.id] || []).length)} hint="Approved and draft summaries in the selected range." />
              <ReportMetricCard label="Attendance" value={`${childReports.attendanceSummary.present} present`} hint={`${childReports.attendanceSummary.absent} absent • ${childReports.attendanceSummary.tardy} tardy`} />
              <ReportMetricCard label="School-wide" value={`${schoolWide.totalSessions} summaries`} hint={`${schoolWide.activeLearners} active learners in scope`} />
            </View>
            <MiniBarChart title="Behavior Trends" items={childReports.behaviorTrends} accentColor="#dc2626" emptyText="No behavior trend data yet." />
            <MiniBarChart title="Mood Trends" items={childReports.moodTrends} accentColor="#16a34a" emptyText="No mood trend data yet." />
            <MiniBarChart title="Monthly Summary" items={childReports.monthlySummary.map((item) => ({ label: item.month, value: item.sessions }))} accentColor="#7c3aed" emptyText="No monthly summaries yet." />
            <MiniBarChart title="Reinforcer Effectiveness" items={childReports.reinforcerEffectiveness.map((item) => ({ label: item.reinforcer, value: item.momentum }))} accentColor="#f59e0b" emptyText="No reinforcer effectiveness data yet." />
            <HeatmapGrid title="Behavior Heatmap" items={childReports.behaviorHeatmap} emptyText="No heatmap data for the selected learner yet." />

            <View style={styles.tableCard}>
              <Text style={styles.sectionTitle}>Program Mastery</Text>
              {(childReports.programMastery || []).length ? childReports.programMastery.map((row) => (
                <View key={row.program} style={styles.tableRow}>
                  <Text style={styles.tablePrimary}>{row.program}</Text>
                  <Text style={styles.tableMeta}>{row.sessions} sessions • {row.milestones} milestones</Text>
                </View>
              )) : <Text style={styles.empty}>No program mastery data yet.</Text>}
            </View>
          </>
        ) : null}

        {reportScope === 'operational' ? (
          <>
            <View style={styles.metricRow}>
              <ReportMetricCard label="Attendance" value={`${childReports.attendanceSummary.present} present`} hint={`${childReports.attendanceSummary.absent} absent • ${childReports.attendanceSummary.tardy} tardy`} />
              <ReportMetricCard label="Utilization" value={`${schoolWide.activeLearners} learners`} hint={`${schoolWide.totalSessions} summaries logged`} />
              <ReportMetricCard label="Communication" value={`${schoolWide.parentEngagement.length} channels`} hint="Operational engagement surfaces." />
            </View>
            <MiniBarChart title="Parent Engagement" items={schoolWide.parentEngagement} accentColor="#0ea5e9" emptyText="No parent communication activity yet." />
            <HeatmapGrid title="School-Wide Behavior Heatmap" items={schoolWide.behaviorHeatmap} emptyText="No school-wide heatmap data yet." />
            <View style={styles.tableCard}>
              <Text style={styles.sectionTitle}>Operational Reports</Text>
              {[
                { program: 'Attendance', sessions: childReports.attendanceSummary.present, milestones: childReports.attendanceSummary.absent },
                { program: 'Session Verification', sessions: schoolWide.totalSessions, milestones: schoolWide.activeLearners },
                { program: 'Staff Hours', sessions: schoolWide.parentEngagement.length, milestones: schoolWide.totalSessions },
              ].map((row) => (
                <View key={row.program} style={styles.tableRow}>
                  <Text style={styles.tablePrimary}>{row.program}</Text>
                  <Text style={styles.tableMeta}>{row.sessions} tracked • {row.milestones} supporting metric</Text>
                </View>
              ))}
            </View>
            {isAdmin ? (
              <View style={styles.tableCard}>
                <Text style={styles.sectionTitle}>Admin-only Exports & Billing</Text>
                <Text style={styles.empty}>Use the admin Export Center and Billing & Authorizations screens for operational handoff and reimbursement workflow.</Text>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16 },
  hero: { borderRadius: 20, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', padding: 16 },
  eyebrow: { color: '#1d4ed8', fontWeight: '800', textTransform: 'uppercase', fontSize: 12 },
  title: { marginTop: 6, fontSize: 24, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 8, color: '#475569', lineHeight: 20 },
  filterCard: { borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', padding: 14, marginTop: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 8 },
  scopeRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  scopeChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#f1f5f9', marginRight: 8, marginBottom: 8 },
  scopeChipActive: { backgroundColor: '#2563eb' },
  scopeChipText: { color: '#0f172a', fontWeight: '700' },
  scopeChipTextActive: { color: '#fff' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap' },
  filterChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#f1f5f9', marginRight: 8, marginBottom: 8 },
  filterChipActive: { backgroundColor: '#2563eb' },
  filterChipText: { color: '#0f172a', fontWeight: '700' },
  filterChipTextActive: { color: '#fff' },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14 },
  tableCard: { borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', padding: 14, marginTop: 12 },
  tableRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  tablePrimary: { fontWeight: '700', color: '#0f172a' },
  tableMeta: { marginTop: 4, color: '#64748b' },
  empty: { color: '#64748b', lineHeight: 18 },
  loadingWrap: { paddingVertical: 20, alignItems: 'center' },
  error: { marginTop: 12, color: '#dc2626' },
});