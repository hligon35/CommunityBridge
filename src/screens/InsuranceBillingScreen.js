import React, { useEffect, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../AuthContext';
import * as Api from '../Api';

const BILLING_PHONE = '+18556030370';
const PAYMENT_URL = 'https://centriahealthcare.com/payment-portal';

function openUrl(url) {
  Linking.openURL(url).catch(() => Alert.alert('Cannot open link', 'Please try again later.'));
}

function Field({ label, value }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || 'N/A'}</Text>
    </View>
  );
}

export default function InsuranceBillingScreen() {
  const { user } = useAuth();
  const role = String(user?.role || '').trim().toLowerCase();
  const insurance = user?.insurance || {};
  const subscriberName = insurance.subscriberName || user?.name || 'N/A';
  const memberId = insurance.memberId || 'N/A';
  const groupNumber = insurance.groupNumber || 'N/A';
  const expirationDate = insurance.expirationDate || 'N/A';
  const relation = insurance.relationToSubscriber || 'Self';
  const planLabel = insurance.planLabel || 'Primary';
  const approvedHours = insurance.approvedHours || 'N/A';
  const remainingHours = insurance.remainingHours || 'N/A';
  const sessionStatus = insurance.sessionStatus || 'Pending verification';
  const signatureStatus = insurance.parentSignatureStatus || 'No signature on file';
  const [jobs, setJobs] = useState([]);

  const onMakePayment = () => {
    if (Platform.OS === 'web') {
      openUrl(PAYMENT_URL);
    } else {
      openUrl(PAYMENT_URL);
    }
  };

  const onContact = () => {
    openUrl(`tel:${BILLING_PHONE}`);
  };

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const result = await Api.listExportJobs(10);
        if (disposed) return;
        const items = Array.isArray(result?.items) ? result.items : [];
        setJobs(items.filter((item) => String(item?.category || '').trim() === 'billing'));
      } catch (_) {
        if (!disposed) setJobs([]);
      }
    })();
    return () => {
      disposed = true;
    };
  }, []);

  return (
    <ScreenWrapper bannerTitle="Billing & Insurance" style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>{role.includes('bcba') ? 'BCBA view only' : 'Operational access'}</Text>
          <Text style={styles.noticeText}>{role.includes('bcba') ? 'BCBA users can review authorization context here, but office users retain full billing control.' : 'Office roles can use this screen as the reimbursement and authorization overview surface.'}</Text>
        </View>
        <Text style={styles.sectionTitle}>Your Insurance Plans</Text>

        <View style={styles.card}>
          <View style={styles.planBadge}>
            <Text style={styles.planBadgeText}>{planLabel}</Text>
          </View>

          <View style={styles.row}>
            <Field label="Expiration Date" value={expirationDate} />
            <Field label="Subscriber Name" value={subscriberName} />
          </View>

          <View style={styles.row}>
            <Field label="Relation to Subscriber" value={relation} />
            <Field label="Member ID" value={memberId} />
          </View>

          <View style={styles.row}>
            <Field label="Group Number" value={groupNumber} />
            <View style={styles.field} />
          </View>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionButton} onPress={onMakePayment} accessibilityRole="button">
            <Text style={styles.actionButtonText}>Make Payment</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={onContact} accessibilityRole="button">
            <Text style={styles.actionButtonText}>Contact</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>Authorizations</Text>
          <View style={styles.row}>
            <Field label="Hours Approved" value={approvedHours} />
            <Field label="Hours Remaining" value={remainingHours} />
          </View>
          <View style={styles.row}>
            <Field label="Session Status" value={sessionStatus} />
            <Field label="Parent Signature" value={signatureStatus} />
          </View>
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>Billing Exports</Text>
          <Text style={styles.detailText}>Operational exports and audit logs are handled from the admin Export Center. This screen now acts as the authorization and session verification summary for that workflow.</Text>
          {jobs.length ? jobs.map((job) => (
            <View key={job.id} style={styles.jobRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.jobTitle}>{job.title || 'Billing Export'}</Text>
                <Text style={styles.jobMeta}>{String(job.format || 'csv').toUpperCase()} • {job.createdAt ? new Date(job.createdAt).toLocaleString() : 'Recently created'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <View style={[styles.jobStatusPill, job.status === 'failed' ? styles.jobStatusPillFailed : null]}>
                  <Text style={[styles.jobStatusText, job.status === 'failed' ? styles.jobStatusTextFailed : null]}>{String(job.status || 'ready').toUpperCase()}</Text>
                </View>
                {job.artifactUrl ? (
                  <TouchableOpacity style={styles.openBtn} onPress={() => openUrl(job.artifactUrl)}>
                    <Text style={styles.openBtnText}>Open Export</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          )) : <Text style={[styles.detailText, { marginTop: 12 }]}>No billing exports queued yet.</Text>}
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f5f6f8',
  },
  content: {
    padding: 16,
    paddingBottom: 16,
  },
  noticeCard: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  noticeTitle: { color: '#1d4ed8', fontWeight: '800', marginBottom: 4 },
  noticeText: { color: '#1e3a8a', lineHeight: 20 },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  actionButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#1d4ed8',
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  actionButtonText: {
    color: '#1d4ed8',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    color: '#111827',
    marginBottom: 12,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  detailCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 18,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  detailTitle: { color: '#111827', fontWeight: '800', fontSize: 16, marginBottom: 12 },
  detailText: { color: '#475569', lineHeight: 20 },
  jobRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  jobTitle: { color: '#0f172a', fontWeight: '800' },
  jobMeta: { color: '#64748b', marginTop: 4 },
  jobStatusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#dcfce7' },
  jobStatusText: { color: '#16a34a', fontWeight: '800', fontSize: 12 },
  jobStatusPillFailed: { backgroundColor: '#fee2e2' },
  jobStatusTextFailed: { color: '#dc2626' },
  openBtn: { marginTop: 8, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  openBtnText: { color: '#334155', fontWeight: '700' },
  planBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 18,
  },
  planBadgeText: {
    color: '#1d4ed8',
    fontWeight: '600',
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  field: {
    flex: 1,
    paddingRight: 8,
  },
  fieldLabel: {
    color: '#6b7280',
    fontSize: 13,
    marginBottom: 4,
  },
  fieldValue: {
    color: '#111827',
    fontSize: 16,
  },
});
