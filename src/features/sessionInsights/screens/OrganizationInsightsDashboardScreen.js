import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenWrapper } from '../../../components/ScreenWrapper';
import useOrganizationInsights from '../hooks/useOrganizationInsights';
import InsightStatCard from '../components/InsightStatCard';
import CampusRollupCard from '../components/CampusRollupCard';
import DocumentationStatusList from '../components/DocumentationStatusList';
import EmptyInsightsState from '../components/EmptyInsightsState';

export default function OrganizationInsightsDashboardScreen() {
  const { loading, error, data } = useOrganizationInsights();

  return (
    <ScreenWrapper style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Organization Insights</Text>
          <Text style={styles.title}>Campus and program rollups</Text>
          <Text style={styles.subtitle}>A lightweight operational view of approved summaries, sessions, and campus-level documentation health.</Text>
        </View>

        {loading ? <ActivityIndicator style={styles.loader} color="#2563eb" /> : null}
        {!loading && error ? <EmptyInsightsState title="Could not load organization insights" message={error} /> : null}
        {!loading && !error && data ? (
          <>
            <View style={styles.statsRow}>
              <InsightStatCard label="Active children" value={data.stats.activeChildren} hint="Visible children in your scoped organization view." />
              <InsightStatCard label="Sessions" value={data.stats.sessions} hint="Tracked sessions in the selected rollup." accent="#0ea5e9" />
              <InsightStatCard label="Approved summaries" value={data.stats.approvedSummaries} hint="Approved summaries available for reporting." accent="#16a34a" />
              <InsightStatCard label="Active campuses" value={data.stats.activeCampuses} hint="Campuses with visible summary activity." accent="#7c3aed" />
            </View>

            {(data.campuses || []).length ? (data.campuses || []).map((campus, index) => <CampusRollupCard key={`${campus.id || campus.name || 'campus'}-${index}`} campus={campus} />) : <EmptyInsightsState title="No campus rollups yet" message="Campus summary rollups will appear when approved session summaries are available." />}
            <DocumentationStatusList title="Program rollups" items={data.programs || []} emptyText="No program rollups are available yet." />
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