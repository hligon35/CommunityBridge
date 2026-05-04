import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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

function TrendCard({ title, items, accent = '#2563eb', horizontalInset = 26 }) {
  const [chartWidth, setChartWidth] = useState(0);
  const yAxisTicks = [15, 10, 5, 0];
  const chartMax = Math.max(15, ...(items || []).map((item) => Number(item?.value || 0)));
  const hasItems = Array.isArray(items) && items.length > 0;
  const chartHeight = 150;
  const topPadding = 12;
  const plotHeight = 92;
  const yAxisWidth = 28;
  const effectiveChartWidth = Math.max(chartWidth, 240);
  const plotWidth = Math.max(0, effectiveChartWidth - yAxisWidth - (horizontalInset * 2));
  const step = (items?.length || 1) > 1 ? plotWidth / ((items.length || 1) - 1) : 0;
  const points = (items || []).map((item, index) => ({
    key: item.label,
    label: item.label,
    value: Number(item?.value || 0),
    x: yAxisWidth + horizontalInset + (step * index),
    y: topPadding + (1 - ((Number(item?.value || 0) || 0) / chartMax)) * plotHeight,
  }));
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {hasItems ? (
        <View style={styles.lineChartWrap} onLayout={(event) => setChartWidth(Math.max(0, event?.nativeEvent?.layout?.width || 0))}>
          <View style={[styles.lineChartSurface, { width: effectiveChartWidth, height: chartHeight }]}> 
            {yAxisTicks.map((tick, index) => (
              <View key={`grid-${tick}`} style={[styles.lineChartGrid, { left: yAxisWidth, top: topPadding + (plotHeight / (yAxisTicks.length - 1)) * index }]} />
            ))}
            {yAxisTicks.map((tick, index) => (
              <View key={`label-${tick}`} style={[styles.yAxisLabelWrap, { top: topPadding + (plotHeight / (yAxisTicks.length - 1)) * index - 8 }]}>
                <Text style={styles.yAxisLabel}>{tick}</Text>
              </View>
            ))}
            {points.slice(0, -1).map((point, index) => {
              const nextPoint = points[index + 1];
              const dx = nextPoint.x - point.x;
              const dy = nextPoint.y - point.y;
              const length = Math.sqrt((dx * dx) + (dy * dy));
              const angle = `${Math.atan2(dy, dx)}rad`;
              return (
                <View
                  key={`segment-${point.key}-${nextPoint.key}`}
                  style={[
                    styles.lineSegment,
                    {
                      left: point.x + (dx / 2) - (length / 2),
                      top: point.y + (dy / 2) - 1.5,
                      width: length,
                      backgroundColor: accent,
                      transform: [{ rotate: angle }],
                    },
                  ]}
                />
              );
            })}
            {points.map((point) => (
              <View key={point.key} style={[styles.linePointColumn, { left: point.x - 26, top: 0 }]}> 
                <View style={[styles.linePointValueWrap, { top: Math.max(0, point.y - 4) }]}>
                  <Text style={styles.linePointValue}>{point.value}</Text>
                </View>
                <View style={[styles.linePoint, { top: point.y - 5, borderColor: accent }]}>
                  <View style={[styles.linePointInner, { backgroundColor: accent }]} />
                </View>
                <Text style={styles.linePointLabel}>{point.label}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <Text style={styles.emptyTrendText}>No staffing data is available yet for this graph.</Text>
      )}
    </View>
  );
}

export default function AdminControlsScreen() {
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
    const attendanceTrend = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, index) => ({ label, value: Math.max(1, sessionsToday - Math.min(index, 4)) }));
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
        {isBcba ? <TrendCard title="Behavior incidents" items={summary.behaviorTrend} accent="#dc2626" horizontalInset={36} /> : null}
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
  lineChartWrap: { overflow: 'hidden', width: '100%' },
  lineChartSurface: { position: 'relative', width: '100%' },
  yAxisLabelWrap: { position: 'absolute', left: 0, width: 24, alignItems: 'flex-end' },
  yAxisLabel: { color: '#64748b', fontSize: 11, fontWeight: '700' },
  lineChartGrid: { position: 'absolute', right: 0, height: 1, borderTopWidth: 1, borderTopColor: '#e2e8f0', borderStyle: 'dashed' },
  lineSegment: { position: 'absolute', height: 3, borderRadius: 999 },
  linePointColumn: { position: 'absolute', width: 52, height: 150, alignItems: 'center' },
  linePointValueWrap: { position: 'absolute', alignItems: 'center', width: 52 },
  linePointValue: { color: '#64748b', fontSize: 11, fontWeight: '700' },
  linePoint: { position: 'absolute', width: 12, height: 12, borderRadius: 999, borderWidth: 2, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  linePointInner: { width: 4, height: 4, borderRadius: 999 },
  linePointLabel: { marginTop: 'auto', fontSize: 11, fontWeight: '700', color: '#334155', textAlign: 'center' },
  emptyTrendText: { color: '#64748b', lineHeight: 20 },
  alertRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  alertTextWrap: { flex: 1, marginLeft: 10 },
  alertTitle: { fontWeight: '800', color: '#0f172a' },
  alertBody: { marginTop: 4, color: '#64748b', lineHeight: 18 },
});
