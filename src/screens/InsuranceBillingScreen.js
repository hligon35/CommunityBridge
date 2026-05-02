import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../AuthContext';
import { isBcbaRole } from '../core/tenant/models';
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
  const { user } = useAuth();
  const isBcba = isBcbaRole(user?.role);
  const isParent = String(user?.role || '').trim().toLowerCase().includes('parent');
  const insurance = user?.insurance || {};
  const [jobs, setJobs] = useState([]);
  const [auditItems, setAuditItems] = useState([]);
  const [loadError, setLoadError] = useState('');

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

  function action(title) {
    Alert.alert(title, isBcba ? 'BCBA users can review this workflow, but office users retain edit and submission control.' : `${title} is available from the office workflow surface.`);
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

        <View style={styles.splitRow}>
          <Block title="Authorizations" style={styles.splitCard}>
            <Text style={styles.rowText}>Hours approved: {insurance.approvedHours || 'N/A'}</Text>
            <Text style={styles.rowText}>Hours remaining: {insurance.remainingHours || 'N/A'}</Text>
            <Text style={styles.rowText}>Expiration date: {insurance.expirationDate || 'N/A'}</Text>
          </Block>

          <Block title={isParent ? 'Session paperwork' : 'Session verification'} style={styles.splitCard}>
            <Text style={styles.rowText}>Timesheets: {insurance.timesheetStatus || 'Pending verification'}</Text>
            <Text style={styles.rowText}>Parent signatures: {insurance.parentSignatureStatus || 'No signature on file'}</Text>
            <Text style={styles.rowText}>Session status: {insurance.sessionStatus || 'Pending verification'}</Text>
            {!isParent && !isBcba ? <TouchableOpacity style={styles.primaryButton} onPress={() => action('Approve verification')}><Text style={styles.primaryButtonText}>Approve Verification</Text></TouchableOpacity> : null}
          </Block>
        </View>

        {isParent ? (
          <Block title="Need help?">
            <Text style={styles.rowText}>Questions about billing: {insurance.billingContact || 'Contact your center billing team.'}</Text>
            <Text style={styles.rowText}>Insurance plan: {insurance.planName || insurance.provider || 'No plan on file'}</Text>
            <Text style={styles.rowText}>Member ID: {insurance.memberId || 'Not available'}</Text>
          </Block>
        ) : (
          <>
            <Block title="Billing exports">
              <View style={styles.exportRow}>
                {['837P', 'CSV'].map((format) => (
                  <View key={format} style={styles.exportCard}>
                    <Text style={styles.exportTitle}>{format}</Text>
                    <Text style={styles.exportText}>{format === '837P' ? 'Reserved for future support.' : 'Available for export handoff.'}</Text>
                  </View>
                ))}
              </View>
              {jobs.length ? jobs.map((job) => <Text key={job.id} style={styles.rowText}>{job.title || 'Billing export'} • {String(job.status || 'ready').toUpperCase()}</Text>) : <Text style={styles.rowText}>No billing exports queued yet.</Text>}
            </Block>

            <Block title="Audit log">
              {auditItems.length ? auditItems.slice(0, 6).map((item, index) => <Text key={item?.id || index} style={styles.rowText}>{String(item?.action || 'audit.event')} • {item?.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown time'}</Text>) : <Text style={styles.rowText}>No billing audit activity available yet.</Text>}
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
  exportRow: { flexDirection: 'row', justifyContent: 'space-between' },
  exportCard: { width: '48%', borderRadius: 16, backgroundColor: '#f8fafc', padding: 14, marginBottom: 10 },
  exportTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  exportText: { marginTop: 6, color: '#64748b' },
  primaryButton: { marginTop: 10, alignSelf: 'flex-start', borderRadius: 12, backgroundColor: '#2563eb', paddingVertical: 12, paddingHorizontal: 14 },
  primaryButtonText: { color: '#ffffff', fontWeight: '800' },
});
