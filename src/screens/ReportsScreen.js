import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../AuthContext';
import { useData } from '../DataContext';
import { isBcbaRole } from '../core/tenant/models';
import { useBehaviorSystemReports } from '../features/reporting/hooks/useBehaviorSystemReports';
import { childHasParent, findLinkedParentId } from '../utils/directoryLinking';
import * as Api from '../Api';
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

function SectionCard({ title, children }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function MiniBars({ items = [], color = '#2563eb' }) {
  const max = Math.max(1, ...items.map((item) => Number(item?.value || 0)));
  return (
    <View style={styles.barRow}>
      {items.map((item) => (
        <View key={item.label} style={styles.barItem}>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { backgroundColor: color, height: `${Math.max(10, (Number(item.value || 0) / max) * 100)}%` }]} />
          </View>
          <Text style={styles.barLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ReportsScreen() {
  const { user } = useAuth();
  const { children = [], parents = [], urgentMemos = [], messages = [] } = useData();
  const { width } = useWindowDimensions();
  const isBcba = isBcbaRole(user?.role);
  const isWideLayout = width >= 900;
  const reportChildren = useMemo(() => findReportChildren(user, children, parents), [user, children, parents]);
  const [selectedChildId, setSelectedChildId] = useState(reportChildren[0]?.id || null);
  const [tab, setTab] = useState(isBcba ? 'clinical' : 'operational');
  const [jobs, setJobs] = useState([]);
  const [jobsError, setJobsError] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);
  const selectedChild = useMemo(() => resolveSelectedDashboardChild(reportChildren, selectedChildId), [reportChildren, selectedChildId]);
  const { loading, childReports, schoolWide, sessionSummariesByChild } = useBehaviorSystemReports({
    selectedChildId: selectedChild?.id || null,
    reportChildIds: reportChildren.map((child) => child.id),
    children: reportChildren,
    urgentMemos,
  });

  useEffect(() => {
    if (!reportChildren.some((child) => child?.id === selectedChildId)) setSelectedChildId(reportChildren[0]?.id || null);
  }, [reportChildren, selectedChildId]);

  useEffect(() => {
    let mounted = true;
    const loadJobs = async () => {
      try {
        const result = await Api.listExportJobs(12);
        if (mounted) setJobsError('');
        if (mounted) setJobs(Array.isArray(result?.items) ? result.items : []);
      } catch (error) {
        if (mounted) setJobs([]);
        if (mounted) setJobsError(String(error?.message || error || 'Could not load recent transfer jobs.'));
      }
    };
    loadJobs();
    return () => {
      mounted = false;
    };
  }, []);

  const abcLogs = useMemo(() => (sessionSummariesByChild[selectedChild?.id] || []).slice(0, 4).map((item, index) => ({
    id: item?.sessionId || `${index}`,
    antecedent: item?.summary?.dailyRecap?.antecedent || 'Routine transition',
    behavior: item?.summary?.dailyRecap?.topBehavior || 'Task refusal',
    consequence: item?.summary?.dailyRecap?.consequence || 'Prompted return to task',
  })), [selectedChild?.id, sessionSummariesByChild]);

  const commLogs = useMemo(() => (messages || []).slice(0, 4).map((message, index) => ({
    id: message?.id || `${index}`,
    title: message?.subject || message?.body || 'Message thread',
    when: message?.createdAt ? new Date(message.createdAt).toLocaleString() : 'Recently',
  })), [messages]);

  async function refreshJobs() {
    try {
      const result = await Api.listExportJobs(12);
      setJobsError('');
      setJobs(Array.isArray(result?.items) ? result.items : []);
    } catch (error) {
      setJobs([]);
      setJobsError(String(error?.message || error || 'Could not load recent transfer jobs.'));
    }
  }

  async function queueTransferJob(format) {
    const normalizedFormat = String(format || 'csv').trim().toLowerCase();
    const result = await Api.createExportJob({
      title: `${normalizedFormat.toUpperCase()} Transfer`,
      category: 'transfer-center',
      format: normalizedFormat,
      scope: isBcba ? 'clinical' : 'office',
      summary: `${normalizedFormat.toUpperCase()} transfer queued from Reports.`,
      recordsCount: reportChildren.length,
    });
    const jobId = result?.item?.id;
    if (jobId) {
      await Api.updateExportJob(jobId, {
        status: 'ready',
        summary: `${normalizedFormat.toUpperCase()} transfer is ready for handoff.`,
        generatedAt: 'serverTimestamp',
      });
    }
  }

  async function handleImportAction() {
    if (transferBusy) return;
    setTransferBusy(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: [
          'application/pdf',
          'text/csv',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/json',
          'text/plain',
        ],
      });

      if (picked?.canceled) return;

      const asset = Array.isArray(picked?.assets) ? picked.assets[0] : null;
      if (!asset?.uri) throw new Error('No file was selected.');

      const created = await Api.createExportJob({
        title: `Import ${asset.name || 'file'}`,
        category: 'transfer-center',
        format: 'import',
        scope: isBcba ? 'clinical' : 'office',
        summary: 'Import file selected and upload started.',
        recordsCount: 1,
        artifactName: String(asset.name || '').trim(),
        artifactMimeType: String(asset.mimeType || 'application/octet-stream').trim(),
      });

      const jobId = created?.item?.id;
      const formData = { _parts: [[
        'file',
        {
          uri: asset.uri,
          name: asset.name || `import-${Date.now()}`,
          type: asset.mimeType || 'application/octet-stream',
        },
      ]] };
      const uploaded = await Api.uploadMedia(formData);

      if (jobId) {
        await Api.updateExportJob(jobId, {
          status: 'completed',
          summary: `Imported ${asset.name || 'file'} into the Transfer Center queue.`,
          artifactName: asset.name || `import-${Date.now()}`,
          artifactUrl: uploaded?.url || '',
          artifactPath: uploaded?.path || '',
          artifactMimeType: asset.mimeType || 'application/octet-stream',
          generatedAt: 'serverTimestamp',
        });
      }

      await refreshJobs();
      Alert.alert('Import complete', `${asset.name || 'File'} was uploaded to the Transfer Center.`);
    } catch (error) {
      Alert.alert('Import failed', String(error?.message || error || 'Unable to import this file.'));
    } finally {
      setTransferBusy(false);
    }
  }

  async function handleTransferAction(format) {
    if (transferBusy) return;
    if (String(format || '').toLowerCase() === 'import') {
      await handleImportAction();
      return;
    }
    setTransferBusy(true);
    try {
      await queueTransferJob(format);
      await refreshJobs();
      Alert.alert('Transfer queued', `${String(format || '').toUpperCase()} transfer is now listed in Recent transfer jobs.`);
    } catch (error) {
      Alert.alert('Transfer failed', String(error?.message || error || 'Unable to queue this transfer.'));
    } finally {
      setTransferBusy(false);
    }
  }

  return (
    <ScreenWrapper style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, isWideLayout ? styles.contentWide : null]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Data & Reports</Text>
          <Text style={styles.title}>Clinical and operational reporting</Text>
          <Text style={styles.subtitle}>{isBcba ? 'BCBA reporting emphasizes skill acquisition, behavior trends, ABC logging, and communication review.' : 'Office reporting emphasizes attendance, verification, staff utilization, and export workflow.'}</Text>
        </View>

        <View style={styles.tabRow}>
          {(isBcba ? ['clinical', 'export'] : ['operational', 'export']).map((key) => (
            <TouchableOpacity key={key} style={[styles.tabButton, tab === key ? styles.tabButtonActive : null]} onPress={() => setTab(key)}>
              <Text style={[styles.tabButtonText, tab === key ? styles.tabButtonTextActive : null]}>{key === 'clinical' ? 'Clinical Reports' : key === 'operational' ? 'Operational Reports' : 'Transfer Center'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {reportChildren.length ? (
          <View style={styles.filterRow}>
            {reportChildren.map((child) => (
              <TouchableOpacity key={child.id} style={[styles.filterChip, selectedChild?.id === child.id ? styles.filterChipActive : null]} onPress={() => setSelectedChildId(child.id)}>
                <Text style={[styles.filterChipText, selectedChild?.id === child.id ? styles.filterChipTextActive : null]}>{child.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {loading ? <View style={styles.loading}><ActivityIndicator color="#2563eb" /></View> : null}

        {tab === 'clinical' ? (
          <>
            <SectionCard title="Skill acquisition graphs">
              <MiniBars items={(childReports.programMastery || []).map((item) => ({ label: item.program, value: item.sessions }))} color="#16a34a" />
            </SectionCard>
            <SectionCard title="Behavior frequency / duration graphs">
              <MiniBars items={childReports.behaviorTrends || []} color="#dc2626" />
            </SectionCard>
            <SectionCard title="ABC logs">
              {abcLogs.length ? abcLogs.map((log) => <Text key={log.id} style={styles.rowText}>A: {log.antecedent} • B: {log.behavior} • C: {log.consequence}</Text>) : <Text style={styles.rowText}>No ABC logs available yet.</Text>}
            </SectionCard>
            <SectionCard title="Parent communication logs">
              {commLogs.length ? commLogs.map((item) => <Text key={item.id} style={styles.rowText}>{item.title} • {item.when}</Text>) : <Text style={styles.rowText}>No communication logs available yet.</Text>}
            </SectionCard>
          </>
        ) : null}

        {tab === 'operational' ? (
          <>
            <View style={[styles.summaryRow, isWideLayout ? styles.summaryRowWide : null]}>
              <View style={[styles.summaryCard, isWideLayout ? styles.summaryCardWide : null]}>
                <Text style={styles.summaryCardTitle}>Attendance</Text>
                <Text style={styles.summaryCardValue}>Present: {childReports.attendanceSummary.present}</Text>
                <Text style={styles.summaryCardValue}>Absent: {childReports.attendanceSummary.absent}</Text>
                <Text style={styles.summaryCardValue}>Tardy: {childReports.attendanceSummary.tardy}</Text>
              </View>
              <View style={[styles.summaryCard, isWideLayout ? styles.summaryCardWide : null]}>
                <Text style={styles.summaryCardTitle}>Session Verification</Text>
                <Text style={styles.summaryCardValue}>{schoolWide.totalSessions} summaries logged</Text>
                <Text style={styles.summaryCardValue}>{schoolWide.activeLearners} active learners</Text>
              </View>
              <View style={[styles.summaryCard, isWideLayout ? styles.summaryCardWide : null]}>
                <Text style={styles.summaryCardTitle}>Staff Hours</Text>
                <Text style={styles.summaryCardValue}>{(schoolWide.parentEngagement || []).length} service channels</Text>
                <Text style={styles.summaryCardValue}>Available for staffing review</Text>
              </View>
            </View>
            <SectionCard title="Utilization">
              <MiniBars items={(schoolWide.parentEngagement || []).map((item) => ({ label: item.label, value: item.value }))} color="#0ea5e9" />
            </SectionCard>
          </>
        ) : null}

        {tab === 'export' ? (
          <>
            <SectionCard title="Transfer Center">
              <View style={[styles.transferIntroRow, isWideLayout ? styles.transferIntroRowWide : null]}>
                <Text style={styles.transferIntroText}>Move reports out as handoff-ready files or bring outside files into the workspace queue for review.</Text>
                {transferBusy ? <ActivityIndicator color="#2563eb" /> : null}
              </View>
              <View style={styles.exportRow}>
                {[
                  { label: 'PDF', detail: 'Export packet ready.' },
                  { label: 'CSV', detail: 'Structured export ready.' },
                  { label: 'Excel', detail: 'Workbook handoff ready.' },
                  { label: 'Import', detail: 'Upload and reconcile incoming files.' },
                ].map((format) => <View key={format.label} style={[styles.exportCard, isWideLayout ? styles.exportCardWide : null]}><Text style={styles.exportTitle}>{format.label}</Text><Text style={styles.exportText}>{format.detail}</Text><TouchableOpacity style={[styles.transferButton, transferBusy ? styles.transferButtonDisabled : null]} disabled={transferBusy} onPress={() => handleTransferAction(format.label)}><Text style={styles.transferButtonText}>{format.label === 'Import' ? 'Import' : 'Transfer'}</Text></TouchableOpacity></View>)}
              </View>
            </SectionCard>
            <SectionCard title="Recent transfer jobs">
              {jobsError ? (
                <View style={styles.errorCard}>
                  <Text style={styles.errorText}>{jobsError}</Text>
                  <TouchableOpacity style={styles.retryButton} onPress={refreshJobs}>
                    <Text style={styles.retryButtonText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {jobs.length ? jobs.map((job) => <View key={job.id} style={styles.jobRow}><View style={styles.jobTextWrap}><Text style={styles.jobTitle}>{job.title || 'Transfer'}</Text><Text style={styles.rowText}>{String(job.format || 'csv').toUpperCase()} • {String(job.status || 'ready').toUpperCase()}</Text></View><Text style={styles.jobMeta}>{job.createdAt ? new Date(job.createdAt).toLocaleString() : 'Recently'}</Text></View>) : <Text style={styles.rowText}>No transfer jobs have been created yet.</Text>}
            </SectionCard>
          </>
        ) : null}
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16 },
  contentWide: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 24, paddingBottom: 28 },
  hero: { borderRadius: 22, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', padding: 18 },
  eyebrow: { color: '#1d4ed8', fontWeight: '800', fontSize: 12, textTransform: 'uppercase' },
  title: { marginTop: 6, fontSize: 24, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 8, color: '#475569', lineHeight: 20 },
  tabRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14 },
  tabButton: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#f1f5f9', marginRight: 8, marginBottom: 8 },
  tabButtonActive: { backgroundColor: '#2563eb' },
  tabButtonText: { color: '#0f172a', fontWeight: '700' },
  tabButtonTextActive: { color: '#ffffff' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  filterChip: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#e2e8f0', marginRight: 8, marginBottom: 8 },
  filterChipActive: { backgroundColor: '#0f172a' },
  filterChipText: { color: '#0f172a', fontWeight: '700' },
  filterChipTextActive: { color: '#ffffff' },
  loading: { paddingVertical: 20, alignItems: 'center' },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 12 },
  summaryRowWide: { marginHorizontal: -6 },
  summaryCard: { width: '100%', borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', padding: 16, marginBottom: 10 },
  summaryCardWide: { width: '32%', marginHorizontal: 6, minHeight: 144 },
  summaryCardTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  summaryCardValue: { color: '#475569', lineHeight: 20, marginBottom: 6 },
  card: { marginTop: 12, borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  rowText: { color: '#475569', lineHeight: 20, marginBottom: 8 },
  barRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  barItem: { flex: 1, alignItems: 'center', marginHorizontal: 4 },
  barTrack: { height: 110, width: 28, borderRadius: 14, backgroundColor: '#e2e8f0', justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 14 },
  barLabel: { marginTop: 8, fontSize: 11, fontWeight: '700', color: '#334155', textAlign: 'center' },
  exportRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  transferIntroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  transferIntroRowWide: { minHeight: 32 },
  transferIntroText: { flex: 1, color: '#475569', lineHeight: 20, paddingRight: 12 },
  exportCard: { width: '100%', borderRadius: 16, backgroundColor: '#f8fafc', padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  exportCardWide: { width: '48.75%', minHeight: 144 },
  exportTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  exportText: { marginTop: 6, color: '#64748b' },
  transferButton: { marginTop: 10, alignSelf: 'flex-start', borderRadius: 10, backgroundColor: '#2563eb', paddingVertical: 8, paddingHorizontal: 12 },
  transferButtonDisabled: { opacity: 0.6 },
  transferButtonText: { color: '#ffffff', fontWeight: '800' },
  errorCard: { borderRadius: 12, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', padding: 12, marginBottom: 12 },
  errorText: { color: '#991b1b' },
  retryButton: { alignSelf: 'flex-start', marginTop: 8, borderRadius: 999, backgroundColor: '#991b1b', paddingVertical: 8, paddingHorizontal: 12 },
  retryButtonText: { color: '#ffffff', fontWeight: '700' },
  jobRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginBottom: 10 },
  jobTextWrap: { flex: 1, paddingRight: 12 },
  jobTitle: { color: '#0f172a', fontWeight: '800', marginBottom: 4 },
  jobMeta: { color: '#64748b', fontSize: 12, textAlign: 'right' },
});
