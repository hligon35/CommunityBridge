import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../AuthContext';
import { useData } from '../DataContext';
import { isBcbaRole, normalizeUserRole, USER_ROLES } from '../core/tenant/models';
import { childHasParent, findLinkedParentId } from '../utils/directoryLinking';
import * as Api from '../Api';

function Block({ title, children, style }) {
  return (
    <View style={[styles.card, style]}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function InsuranceBillingScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { children = [], parents = [] } = useData();
  const role = normalizeUserRole(user?.role);
  const isBcba = isBcbaRole(user?.role);
  const isParent = role === USER_ROLES.PARENT;
  const [selectedFormat, setSelectedFormat] = useState('csv');
  const [jobs, setJobs] = useState([]);
  const [auditItems, setAuditItems] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);

  const linkedParentId = useMemo(() => {
    if (!isParent) return null;
    return findLinkedParentId(user, parents) || user?.id || null;
  }, [isParent, parents, user]);

  const linkedChild = useMemo(() => {
    if (!isParent || !linkedParentId) return null;
    return (Array.isArray(children) ? children : []).find((child) => childHasParent(child, linkedParentId)) || null;
  }, [children, isParent, linkedParentId]);

  const insurance = useMemo(() => {
    const childInsurance = linkedChild?.insurance && typeof linkedChild.insurance === 'object' ? linkedChild.insurance : {};
    return {
      ...(user?.insurance || {}),
      ...childInsurance,
    };
  }, [linkedChild, user]);

  const childName = useMemo(() => {
    if (linkedChild?.name) return String(linkedChild.name);
    const firstName = String(linkedChild?.firstName || '').trim();
    const lastName = String(linkedChild?.lastName || '').trim();
    return `${firstName} ${lastName}`.trim() || 'Your child';
  }, [linkedChild]);

  const filteredAuditItems = useMemo(() => {
    const billingItems = (auditItems || []).filter((item) => {
      const text = `${item?.action || ''} ${item?.summary || ''}`.toLowerCase();
      return text.includes('billing') || text.includes('authorization') || text.includes('export') || text.includes('verification');
    });
    return billingItems.length ? billingItems : (auditItems || []);
  }, [auditItems]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (isParent) {
        setJobs([]);
        setAuditItems([]);
        setLoadError('');
        return;
      }
      try {
        setLoadError('');
        const [jobResult, auditResult] = await Promise.all([
          Api.listExportJobs(10),
          Api.getAuditLogs(10).catch(() => ({ items: [] })),
        ]);
        if (!mounted) return;
        setJobs((jobResult?.items || []).filter((item) => String(item?.category || '').trim() === 'billing'));
        setAuditItems(Array.isArray(auditResult?.items) ? auditResult.items : []);
      } catch (error) {
        if (mounted) {
          setLoadError(String(error?.message || error || 'Could not load billing workflow data.'));
          setJobs([]);
          setAuditItems([]);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isParent]);

  function toCSV(rows) {
    if (!rows || !rows.length) return '';
    const keys = Object.keys(rows[0]);
    const header = keys.join(',');
    const lines = rows.map((row) => keys.map((key) => `"${String(row[key] ?? '')}"`).join(','));
    return [header, ...lines].join('\n');
  }

  function buildRows() {
    return (children || []).map((child) => ({
      learner: child?.name || 'Learner',
      session: child?.session || 'Unscheduled',
      room: child?.room || 'Room TBD',
      attendanceStatus: child?.attendanceStatus || 'pending',
      authorizationStatus: child?.insuranceStatus || insurance.authorizationStatus || 'pending review',
      assignedStaff: [child?.amTherapist?.name, child?.pmTherapist?.name, child?.bcaTherapist?.name].filter(Boolean).join(' | '),
    }));
  }

  function getExportContent(rows) {
    if (selectedFormat === 'pdf') {
      const summary = rows.map((row) => Object.entries(row).map(([key, value]) => `${key}: ${value ?? ''}`).join('\n')).join('\n\n');
      return {
        extension: 'html',
        mimeType: 'text/html',
        body: `<!doctype html><html><head><meta charset="utf-8" /><title>Billing Export</title><style>body{font-family:Georgia,serif;padding:24px;color:#0f172a;}h1{font-size:24px;}pre{white-space:pre-wrap;font-family:Georgia,serif;line-height:1.5;}</style></head><body><h1>Billing Export</h1><p>Generated ${new Date().toLocaleString()}</p><pre>${summary.replace(/[<>&]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[character]))}</pre></body></html>`,
      };
    }
    return {
      extension: 'csv',
      mimeType: 'text/csv',
      body: toCSV(rows),
    };
  }

  async function createArtifactFile(fileName, body, mimeType) {
    if (Platform.OS === 'web') {
      const blob = new Blob([body], { type: mimeType });
      const uri = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = uri;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return { uri, cleanup: () => URL.revokeObjectURL(uri) };
    }

    const baseDir = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}exports`;
    await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true }).catch(() => {});
    const fileUri = `${baseDir}/${fileName}`;
    await FileSystem.writeAsStringAsync(fileUri, body, { encoding: FileSystem.EncodingType.UTF8 });
    return { uri: fileUri, cleanup: async () => {} };
  }

  async function queueBillingExport() {
    try {
      setBusy(true);
      const rows = buildRows();
      const content = getExportContent(rows);
      const fileName = `billing-${Date.now()}.${content.extension}`;
      const job = await Api.createExportJob({
        title: 'Billing Export',
        category: 'billing',
        format: selectedFormat,
        scope: isBcba ? 'bcba-review' : 'office',
        recordsCount: rows.length,
        summary: 'Billing export queued from Billing & Authorizations.',
      });
      const artifact = await createArtifactFile(fileName, content.body, content.mimeType);
      try {
        const formData = new FormData();
        formData.append('file', {
          uri: artifact.uri,
          name: fileName,
          type: content.mimeType,
        });
        const uploaded = await Api.uploadMedia(formData);
        await Api.updateExportJob(job?.item?.id, {
          status: 'completed',
          summary: 'Billing export generated successfully.',
          artifactName: fileName,
          artifactMimeType: content.mimeType,
          artifactUrl: uploaded?.url || '',
          artifactPath: uploaded?.path || '',
          generatedAt: 'serverTimestamp',
          recordsCount: rows.length,
        });
      } catch (error) {
        await Api.updateExportJob(job?.item?.id, {
          status: 'failed',
          summary: String(error?.message || error || 'Billing export failed.'),
        }).catch(() => {});
        throw error;
      } finally {
        await artifact.cleanup?.();
      }
      const refreshed = await Api.listExportJobs(10);
      setJobs((refreshed?.items || []).filter((item) => String(item?.category || '').trim() === 'billing'));
      Alert.alert('Billing export ready', 'The billing export was generated and added to recent export jobs.');
    } catch (error) {
      Alert.alert('Export failed', String(error?.message || error || 'Could not generate the billing export.'));
    } finally {
      setBusy(false);
    }
  }

  function openArtifact(url) {
    if (!url) return;
    Linking.openURL(url).catch(() => {
      Alert.alert('Unable to open export', 'Your device could not open this export file.');
    });
  }

  function action(title) {
    Alert.alert(title, isBcba ? 'BCBA users can review this workflow, but office users retain edit and submission control.' : `${title} is available from the office workflow surface.`);
  }

  function openEmailAddress(value) {
    const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? `mailto:${match[0]}` : '';
  }

  function openPhoneNumber(value) {
    const digits = String(value || '').replace(/[^\d+]/g, '');
    return digits.length >= 7 ? `tel:${digits}` : '';
  }

  function openParentBilling() {
    const emailUrl = openEmailAddress(insurance.billingContact || insurance.contact || '');
    const phoneUrl = openPhoneNumber(insurance.billingContact || insurance.contact || '');
    const target = emailUrl || phoneUrl;
    if (target) {
      Linking.openURL(target).catch(() => {
        Alert.alert('Billing contact unavailable', 'We could not open the billing contact on this device.');
      });
      return;
    }
    navigation.navigate('ChatsList');
  }

  function openParentContact() {
    navigation.navigate('ChatsList');
  }

  return (
    <ScreenWrapper style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Billing & Authorizations</Text>
          <Text style={styles.title}>{isParent ? 'Insurance and billing summary' : 'Insurance and billing workflow'}</Text>
          <Text style={styles.subtitle}>{isParent ? 'Review your family insurance status, authorization details, and any signature items that still need attention.' : (isBcba ? 'BCBA view only. Review authorization context, session verification, and billing status here.' : 'Office control. Manage authorizations, verification, and billing export handoff here.')}</Text>
        </View>

        {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

        {isParent ? (
          <Block title="Digital Insurance Card">
            <View style={styles.digitalCard}>
              <Text style={styles.digitalCardName}>{childName}</Text>
              <Text style={styles.digitalCardPlan}>{insurance.planName || insurance.provider || 'Insurance plan on file'}</Text>
              <View style={styles.digitalCardGrid}>
                <View style={styles.digitalCardCell}>
                  <Text style={styles.digitalCardLabel}>Member ID</Text>
                  <Text style={styles.digitalCardValue}>{insurance.memberId || 'Not available'}</Text>
                </View>
                <View style={styles.digitalCardCell}>
                  <Text style={styles.digitalCardLabel}>Group</Text>
                  <Text style={styles.digitalCardValue}>{insurance.groupNumber || insurance.groupId || 'Not available'}</Text>
                </View>
                <View style={styles.digitalCardCell}>
                  <Text style={styles.digitalCardLabel}>Authorization</Text>
                  <Text style={styles.digitalCardValue}>{insurance.authorizationStatus || 'On file'}</Text>
                </View>
                <View style={styles.digitalCardCell}>
                  <Text style={styles.digitalCardLabel}>Effective</Text>
                  <Text style={styles.digitalCardValue}>{insurance.expirationDate || insurance.effectiveDate || 'Not available'}</Text>
                </View>
              </View>
            </View>
            <View style={styles.parentActionRow}>
              <TouchableOpacity style={styles.primaryButton} onPress={openParentBilling}>
                <Text style={styles.primaryButtonText}>Billing</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={openParentContact}>
                <Text style={styles.secondaryButtonText}>Contact</Text>
              </TouchableOpacity>
            </View>
          </Block>
        ) : (
          <>
            <View style={styles.splitRow}>
              <Block title="Authorizations" style={styles.splitCard}>
                <Text style={styles.rowText}>Hours approved: {insurance.approvedHours || 'N/A'}</Text>
                <Text style={styles.rowText}>Hours remaining: {insurance.remainingHours || 'N/A'}</Text>
                <Text style={styles.rowText}>Expiration date: {insurance.expirationDate || 'N/A'}</Text>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => action('Review authorizations')}><Text style={styles.secondaryButtonText}>{isBcba ? 'Review Authorization' : 'Update Authorization'}</Text></TouchableOpacity>
              </Block>

              <Block title="Session verification" style={styles.splitCard}>
                <Text style={styles.rowText}>Timesheets: {insurance.timesheetStatus || 'Pending verification'}</Text>
                <Text style={styles.rowText}>Parent signatures: {insurance.parentSignatureStatus || 'No signature on file'}</Text>
                <Text style={styles.rowText}>Session status: {insurance.sessionStatus || 'Pending verification'}</Text>
                {!isBcba ? <TouchableOpacity style={styles.primaryButton} onPress={() => action('Approve verification')}><Text style={styles.primaryButtonText}>Approve Verification</Text></TouchableOpacity> : null}
                {isBcba ? <TouchableOpacity style={styles.secondaryButton} onPress={() => action('Review verification')}><Text style={styles.secondaryButtonText}>Review Verification</Text></TouchableOpacity> : null}
              </Block>
            </View>

            <Block title="Billing exports">
              <View style={styles.exportRow}>
                {['csv', 'pdf'].map((format) => (
                  <TouchableOpacity key={format} style={[styles.exportCard, selectedFormat === format ? styles.exportCardActive : null]} onPress={() => setSelectedFormat(format)}>
                    <Text style={styles.exportTitle}>{format.toUpperCase()}</Text>
                    <Text style={styles.exportText}>{format === 'pdf' ? 'Generate a printable billing handoff summary.' : 'Generate a billing handoff spreadsheet.'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {!isParent ? (
                <View style={styles.exportActionRow}>
                  <TouchableOpacity style={[styles.primaryButton, busy ? styles.primaryButtonDisabled : null]} onPress={queueBillingExport} disabled={busy}>
                    <Text style={styles.primaryButtonText}>{busy ? 'Generating...' : 'Generate Billing Export'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('ExportData')}>
                    <Text style={styles.secondaryButtonText}>Open Export Center</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {jobs.length ? jobs.map((job) => (
                <View key={job.id} style={styles.jobRow}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.rowText}>{job.title || 'Billing export'} • {String(job.status || 'ready').toUpperCase()}</Text>
                    <Text style={styles.jobMeta}>{String(job.format || 'csv').toUpperCase()} • {job.recordsCount || 0} records • {job.createdAt ? new Date(job.createdAt).toLocaleString() : 'Recently created'}</Text>
                  </View>
                  {job.artifactUrl ? <TouchableOpacity style={styles.secondaryButton} onPress={() => openArtifact(job.artifactUrl)}><Text style={styles.secondaryButtonText}>Open</Text></TouchableOpacity> : null}
                </View>
              )) : <Text style={styles.rowText}>No billing exports queued yet.</Text>}
            </Block>

            <Block title="Audit log">
              {filteredAuditItems.length ? filteredAuditItems.slice(0, 6).map((item, index) => <Text key={item?.id || index} style={styles.rowText}>{String(item?.action || 'audit.event')} • {item?.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown time'}</Text>) : <Text style={styles.rowText}>No billing audit activity available yet.</Text>}
            </Block>
          </>
        )}
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
  errorText: { color: '#b91c1c', marginTop: 12 },
  subtitle: { marginTop: 8, color: '#475569', lineHeight: 20 },
  splitRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  card: { marginTop: 12, borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', padding: 16 },
  splitCard: { width: '48%', marginTop: 0 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  rowText: { color: '#475569', lineHeight: 20, marginBottom: 8 },
  digitalCard: { borderRadius: 18, backgroundColor: '#1e3a8a', padding: 18 },
  digitalCardName: { color: '#ffffff', fontSize: 22, fontWeight: '800' },
  digitalCardPlan: { marginTop: 6, color: '#dbeafe', fontSize: 15, fontWeight: '700' },
  digitalCardGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 18, justifyContent: 'space-between' },
  digitalCardCell: { width: '48%', marginBottom: 14 },
  digitalCardLabel: { color: '#bfdbfe', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  digitalCardValue: { marginTop: 4, color: '#ffffff', fontSize: 15, fontWeight: '700' },
  parentActionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 12 },
  exportRow: { flexDirection: 'row', justifyContent: 'space-between' },
  exportCard: { width: '48%', borderRadius: 16, backgroundColor: '#f8fafc', padding: 14, marginBottom: 10 },
  exportTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  exportText: { marginTop: 6, color: '#64748b' },
  exportCardActive: { borderWidth: 1, borderColor: '#93c5fd', backgroundColor: '#eff6ff' },
  exportActionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 },
  primaryButton: { marginTop: 10, alignSelf: 'flex-start', borderRadius: 12, backgroundColor: '#2563eb', paddingVertical: 12, paddingHorizontal: 14 },
  primaryButtonDisabled: { opacity: 0.55 },
  primaryButtonText: { color: '#ffffff', fontWeight: '800' },
  secondaryButton: { marginTop: 10, marginRight: 10, alignSelf: 'flex-start', borderRadius: 12, backgroundColor: '#e2e8f0', paddingVertical: 12, paddingHorizontal: 14 },
  secondaryButtonText: { color: '#0f172a', fontWeight: '800' },
  jobRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10 },
  jobMeta: { color: '#64748b', marginBottom: 2 },
});
