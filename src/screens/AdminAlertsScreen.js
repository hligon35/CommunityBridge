import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../AuthContext';
import { useData } from '../DataContext';
import { isBcbaRole } from '../core/tenant/models';
import * as Api from '../Api';

export default function AdminAlertsScreen() {
  const { user } = useAuth();
  const { therapists = [], children = [] } = useData();
  const isBcba = isBcbaRole(user?.role);
  const [tab, setTab] = useState('tracker');
  const [staffWorkspaceMap, setStaffWorkspaceMap] = useState({});
  const [auditItems, setAuditItems] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [workspaceResult, auditResult] = await Promise.all([
          Api.listStaffWorkspaces((therapists || []).map((staff) => staff?.id)),
          Api.getAuditLogs(16).catch(() => ({ items: [] })),
        ]);
        if (!mounted) return;
        const next = {};
        (workspaceResult?.items || []).forEach((item) => {
          if (item?.id) next[item.id] = item;
        });
        setStaffWorkspaceMap(next);
        setAuditItems(Array.isArray(auditResult?.items) ? auditResult.items : []);
      } catch (_) {
        if (mounted) {
          setStaffWorkspaceMap({});
          setAuditItems([]);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [therapists]);

  const complianceItems = useMemo(() => {
    return (therapists || []).map((staff, index) => {
      const workspace = staffWorkspaceMap[staff?.id] || {};
      const exp = String(workspace?.credentials?.certificationExpiration || '').trim();
      const docs = Array.isArray(workspace?.documents) ? workspace.documents : [];
      const expiresAt = exp ? new Date(exp).getTime() : 0;
      const level = !exp || expiresAt < Date.now() ? 'red' : expiresAt < Date.now() + (1000 * 60 * 60 * 24 * 30) || !docs.length ? 'yellow' : 'green';
      return {
        id: staff?.id || `${index}`,
        name: staff?.name || 'Staff member',
        role: staff?.role || 'Staff',
        expiration: exp || 'Not set',
        documents: docs.length,
        level,
      };
    });
  }, [staffWorkspaceMap, therapists]);

  function action(title) {
    Alert.alert(title, isBcba ? 'BCBA can review compliance status here.' : 'Office uploads and maintenance are staged from this compliance hub.');
  }

  return (
    <ScreenWrapper style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Compliance</Text>
          <Text style={styles.title}>Track staff compliance and documentation</Text>
          <Text style={styles.subtitle}>{isBcba ? 'BCBA users can review credential and document status here.' : 'Office users can upload documents, track expirations, and review the compliance audit trail here.'}</Text>
        </View>

        <View style={styles.tabRow}>
          {[
            { key: 'tracker', label: 'Credential Tracker' },
            { key: 'alerts', label: 'Expiration Alerts' },
            { key: 'documents', label: 'Document Uploads' },
            { key: 'audit', label: 'Audit Log' },
          ].map((item) => (
            <TouchableOpacity key={item.key} style={[styles.tabButton, tab === item.key ? styles.tabButtonActive : null]} onPress={() => setTab(item.key)}>
              <Text style={[styles.tabButtonText, tab === item.key ? styles.tabButtonTextActive : null]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {(tab === 'tracker' || tab === 'alerts') ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{tab === 'tracker' ? 'Credential tracker' : 'Expiration alerts'}</Text>
            {complianceItems.map((item) => (
              <View key={item.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.name} • {item.role}</Text>
                  <Text style={styles.rowText}>Certification: {item.expiration}</Text>
                  <Text style={styles.rowText}>Documents: {item.documents}</Text>
                </View>
                <View style={[styles.levelPill, item.level === 'red' ? styles.levelRed : item.level === 'yellow' ? styles.levelYellow : styles.levelGreen]}>
                  <Text style={[styles.levelText, item.level === 'red' ? styles.levelTextRed : item.level === 'yellow' ? styles.levelTextYellow : styles.levelTextGreen]}>{item.level.toUpperCase()}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {tab === 'documents' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Document uploads</Text>
            <Text style={styles.rowText}>{isBcba ? 'BCBA can review uploaded compliance documents here.' : 'Office can upload CPR / First Aid, background check, TB test, and certification documents here.'}</Text>
            {!isBcba ? <TouchableOpacity style={styles.primaryButton} onPress={() => action('Upload compliance document')}><Text style={styles.primaryButtonText}>Upload Document</Text></TouchableOpacity> : null}
          </View>
        ) : null}

        {tab === 'audit' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Audit log</Text>
            {auditItems.length ? auditItems.slice(0, 12).map((item, index) => <Text key={item?.id || index} style={styles.rowText}>{String(item?.action || 'audit.event')} • {item?.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown time'}</Text>) : <Text style={styles.rowText}>No audit activity available yet.</Text>}
          </View>
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
  tabRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14 },
  tabButton: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#f1f5f9', marginRight: 8, marginBottom: 8 },
  tabButtonActive: { backgroundColor: '#2563eb' },
  tabButtonText: { color: '#0f172a', fontWeight: '700' },
  tabButtonTextActive: { color: '#ffffff' },
  card: { marginTop: 12, borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  rowTitle: { fontWeight: '800', color: '#0f172a' },
  rowText: { marginTop: 4, color: '#475569', lineHeight: 20 },
  levelPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  levelRed: { backgroundColor: '#fee2e2' },
  levelYellow: { backgroundColor: '#fef3c7' },
  levelGreen: { backgroundColor: '#dcfce7' },
  levelText: { fontWeight: '800', fontSize: 11 },
  levelTextRed: { color: '#b91c1c' },
  levelTextYellow: { color: '#92400e' },
  levelTextGreen: { color: '#166534' },
  primaryButton: { marginTop: 10, alignSelf: 'flex-start', borderRadius: 12, backgroundColor: '#2563eb', paddingVertical: 12, paddingHorizontal: 14 },
  primaryButtonText: { color: '#ffffff', fontWeight: '800' },
});
