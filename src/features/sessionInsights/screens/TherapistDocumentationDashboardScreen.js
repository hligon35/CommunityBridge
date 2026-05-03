import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenWrapper } from '../../../components/ScreenWrapper';
import useTherapistDocumentationInsights from '../hooks/useTherapistDocumentationInsights';
import InsightStatCard from '../components/InsightStatCard';
import DocumentationStatusList from '../components/DocumentationStatusList';
import EmptyInsightsState from '../components/EmptyInsightsState';

export default function TherapistDocumentationDashboardScreen() {
  const { loading, error, data } = useTherapistDocumentationInsights();

  return (
    <ScreenWrapper style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Documentation Dashboard</Text>
          <Text style={styles.title}>Therapist documentation status</Text>
          <Text style={styles.subtitle}>Track ended sessions, generated summaries, approvals, and follow-up work without leaving the existing therapy workflow.</Text>
        </View>

        {loading ? <ActivityIndicator style={styles.loader} color="#2563eb" /> : null}
        {!loading && error ? <EmptyInsightsState title="Could not load documentation insights" message={error} /> : null}
        {!loading && !error && data ? (
          <>
            <View style={styles.statsRow}>
              <InsightStatCard label="Sessions ended" value={data.stats.sessionsEnded} hint="Sessions ready for summary work." />
              <InsightStatCard label="Summaries generated" value={data.stats.summariesGenerated} hint="Draft or final summaries generated." accent="#0ea5e9" />
              <InsightStatCard label="Summaries approved" value={data.stats.summariesApproved} hint="Approved documentation ready for parent reporting." accent="#16a34a" />
              <InsightStatCard label="Overdue summaries" value={data.stats.overdueSummaries} hint="Sessions still waiting on timely documentation." accent="#dc2626" />
            </View>
            <DocumentationStatusList title="Needs review" items={(data.items || []).filter((item) => String(item?.status || '').toLowerCase() !== 'approved')} emptyText="No summaries need review right now." />
            <DocumentationStatusList title="Recent approved summaries" items={(data.items || []).filter((item) => String(item?.status || '').toLowerCase() === 'approved').slice(0, 5)} emptyText="No approved summaries yet." />
          </>
        ) : null}
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
  loader: { marginTop: 24 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 12 },
});