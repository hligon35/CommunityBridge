import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useData } from '../DataContext';
import { useNavigation } from '@react-navigation/native';
import * as Api from '../Api';

export default function AdminAlertsScreen() {
  const { urgentMemos, respondToUrgentMemo, fetchAndSync, children = [], therapists = [] } = useData();
  const [list, setList] = useState([]);
  const [selectedTab, setSelectedTab] = useState('urgent');
  const [auditItems, setAuditItems] = useState([]);
  const [staffWorkspaceMap, setStaffWorkspaceMap] = useState({});
  const navigation = useNavigation();

  useEffect(() => {
    const HANDLED = new Set(['accepted', 'denied', 'opened', 'read', 'resolved', 'dismissed']);
    setList(
      (urgentMemos || [])
        .filter((m) => !HANDLED.has(String(m?.status || 'pending').toLowerCase()))
        .slice()
        .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
    );
  }, [urgentMemos]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const response = await Api.getAuditLogs(14);
        if (!mounted) return;
        setAuditItems(Array.isArray(response?.items) ? response.items : []);
      } catch (_) {
        if (mounted) setAuditItems([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const response = await Api.listStaffWorkspaces((therapists || []).map((staff) => staff?.id));
        if (!mounted) return;
        const next = {};
        (response?.items || []).forEach((item) => {
          if (item?.id) next[item.id] = item;
        });
        setStaffWorkspaceMap(next);
      } catch (_) {
        if (mounted) setStaffWorkspaceMap({});
      }
    })();
    return () => {
      mounted = false;
    };
  }, [therapists]);

  const complianceItems = useMemo(() => {
    const childList = Array.isArray(children) ? children : [];
    const childIdsByStaff = new Map();
    childList.forEach((child) => {
      [child?.amTherapist, child?.pmTherapist, child?.bcaTherapist].forEach((entry) => {
        const id = typeof entry === 'string' ? entry : entry?.id;
        if (!id) return;
        const next = childIdsByStaff.get(id) || new Set();
        next.add(child?.id || child?.name || 'child');
        childIdsByStaff.set(id, next);
      });
    });
    return (Array.isArray(therapists) ? therapists : []).map((staff, index) => {
      const caseloadSize = Array.from(childIdsByStaff.get(staff?.id) || []).length;
      const missingContact = !staff?.email || !staff?.phone;
      const workspace = staffWorkspaceMap[staff?.id] || {};
      const docs = Array.isArray(workspace?.documents) ? workspace.documents : [];
      const certificationExpiration = String(workspace?.credentials?.certificationExpiration || '').trim();
      const expired = certificationExpiration ? (new Date(certificationExpiration).getTime() < Date.now()) : false;
      const dueSoon = certificationExpiration ? (new Date(certificationExpiration).getTime() < Date.now() + (1000 * 60 * 60 * 24 * 30)) : false;
      const level = missingContact || expired ? 'red' : !docs.length || dueSoon || caseloadSize === 0 ? 'yellow' : 'green';
      const note = missingContact
        ? 'Missing phone or email on file.'
        : expired
          ? `Credential expired on ${certificationExpiration}.`
          : !docs.length
            ? 'No compliance documents uploaded.'
            : dueSoon
              ? `Credential review due by ${certificationExpiration}.`
              : caseloadSize === 0
                ? 'No assigned learners in the current directory.'
                : `${caseloadSize} assigned learner${caseloadSize === 1 ? '' : 's'} tracked.`;
      return {
        id: staff?.id || `staff-${index}`,
        label: staff?.name || staff?.email || 'Staff member',
        role: staff?.role || 'Staff',
        level,
        note,
      };
    });
  }, [children, staffWorkspaceMap, therapists]);

  function childNameForId(id) {
    const c = (children || []).find((x) => x.id === id);
    return c ? c.name : id;
  }

  function typeLabel(m) {
    const t = (m && m.type) ? String(m.type).toLowerCase() : 'urgent_memo';
    if (t === 'time_update') return (m.updateType === 'pickup' ? 'Pickup' : 'Drop-off');
    if (t === 'arrival_alert') return 'Arrival';
    if (t === 'admin_memo') return 'Admin Memo';
    return 'Alert';
  }

  function metaLine(m) {
    const t = (m && m.type) ? String(m.type).toLowerCase() : 'urgent_memo';
    const when = m.createdAt ? new Date(m.createdAt).toLocaleString() : '';
    if (t === 'arrival_alert') {
      const who = (m.actorRole || '').toString().toLowerCase();
      const whoLabel = who ? who.toUpperCase() : 'USER';
      return `${whoLabel} • ${when}`;
    }
    return `${typeLabel(m)} • ${when}`;
  }

  function primaryText(m) {
    const t = (m && m.type) ? String(m.type).toLowerCase() : 'urgent_memo';
    if (t === 'admin_memo') return m.subject || m.title || 'Admin Memo';
    if (t === 'arrival_alert') return m.title || 'Arrival';
    if (t === 'time_update') return `${m.updateType === 'pickup' ? 'Pickup' : 'Drop-off'} Time Update`;
    return m.title || 'Alert';
  }

  async function handleRespond(id, action) {
    try {
      const ok = await respondToUrgentMemo(id, action);
      if (ok) {
        Alert.alert('Updated', `Alert ${action}`);
        // refresh from server if available
        fetchAndSync().catch(() => {});
      } else {
        Alert.alert('Failed', 'Could not update alert');
      }
    } catch (e) {
      console.warn('handleRespond failed', e?.message || e);
      Alert.alert('Error', 'Failed to update');
    }
  }

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>Compliance & Alerts</Text>
        <View style={styles.tabRow}>
          {[
            { key: 'urgent', label: 'Urgent' },
            { key: 'compliance', label: 'Compliance' },
            { key: 'audit', label: 'Audit' },
          ].map((tab) => (
            <TouchableOpacity key={tab.key} style={[styles.tabChip, selectedTab === tab.key ? styles.tabChipActive : null]} onPress={() => setSelectedTab(tab.key)}>
              <Text style={[styles.tabChipText, selectedTab === tab.key ? styles.tabChipTextActive : null]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {selectedTab === 'urgent' && list.length === 0 ? (
          <Text style={styles.empty}>No urgent alerts currently.</Text>
        ) : null}
        {selectedTab === 'urgent' ? (
          <FlatList
            data={list}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => {
              const cname = childNameForId(item.childId);
              const status = item.status || 'pending';
              const statusColor = status === 'accepted' ? '#10B981' : status === 'denied' ? '#ef4444' : status === 'opened' ? '#F59E0B' : '#F59E0B';
              const t = (item && item.type) ? String(item.type).toLowerCase() : 'urgent_memo';
              return (
                <View style={styles.card}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.meta}>{metaLine(item)}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                      <Text style={{ marginLeft: 8, color: '#6b7280' }}>{status.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={styles.child}>{primaryText(item)}</Text>
                  {item.childId ? (
                    <TouchableOpacity onPress={() => navigation.navigate('ChildDetail', { childId: item.childId })}>
                      <Text style={[styles.note, { fontWeight: '700' }]}>Child: {cname}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {t === 'time_update' ? (
                    <Text style={styles.note}>{item.note}</Text>
                  ) : t === 'admin_memo' ? (
                    <Text style={styles.note}>{item.body || ''}</Text>
                  ) : t === 'arrival_alert' ? (
                    <Text style={styles.note}>Arrival detected. Mark opened to acknowledge.</Text>
                  ) : (
                    <Text style={styles.note}>{item.body || item.note || ''}</Text>
                  )}
                  <View style={styles.row}>
                    <TouchableOpacity style={[styles.btn, { backgroundColor: '#2563eb' }]} onPress={() => handleRespond(item.id, 'opened')}>
                      <Text style={styles.btnLabel}>Mark Opened</Text>
                    </TouchableOpacity>
                    {t === 'time_update' ? (
                      <>
                        <TouchableOpacity style={[styles.btn, { backgroundColor: '#10B981' }]} onPress={() => handleRespond(item.id, 'accepted')}>
                          <Text style={styles.btnLabel}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.btn, { backgroundColor: '#ef4444' }]} onPress={() => handleRespond(item.id, 'denied')}>
                          <Text style={styles.btnLabel}>Deny</Text>
                        </TouchableOpacity>
                      </>
                    ) : null}
                  </View>
                </View>
              );
            }}
          />
        ) : null}

        {selectedTab === 'compliance' ? (
          <FlatList
            data={complianceItems}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const color = item.level === 'red' ? '#dc2626' : item.level === 'yellow' ? '#f59e0b' : '#16a34a';
              return (
                <View style={styles.card}>
                  <View style={styles.complianceHeader}>
                    <View>
                      <Text style={styles.child}>{item.label}</Text>
                      <Text style={styles.meta}>{item.role}</Text>
                    </View>
                    <View style={[styles.compliancePill, { backgroundColor: `${color}18` }]}>
                      <Text style={[styles.compliancePillText, { color }]}>{item.level.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={styles.note}>{item.note}</Text>
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.empty}>No staff compliance items yet.</Text>}
          />
        ) : null}

        {selectedTab === 'audit' ? (
          <FlatList
            data={auditItems}
            keyExtractor={(item, index) => String(item?.id || item?.createdAt || index)}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.child}>{String(item?.action || 'audit.event')}</Text>
                <Text style={styles.meta}>{item?.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown time'}</Text>
                {item?.details ? <Text style={styles.note}>{JSON.stringify(item.details)}</Text> : null}
              </View>
            )}
            ListEmptyComponent={<Text style={styles.empty}>No audit activity available.</Text>}
          />
        ) : null}
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, flex: 1 },
  title: { fontWeight: '700', fontSize: 18, marginBottom: 12 },
  empty: { color: '#6b7280' },
  tabRow: { flexDirection: 'row', marginBottom: 12 },
  tabChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#f1f5f9', marginRight: 8 },
  tabChipActive: { backgroundColor: '#2563eb' },
  tabChipText: { color: '#0f172a', fontWeight: '700' },
  tabChipTextActive: { color: '#fff' },
  card: { backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 10 },
  meta: { color: '#6b7280', fontSize: 12 },
  child: { fontWeight: '700', marginTop: 6 },
  note: { color: '#374151', marginTop: 6 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  btn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginLeft: 8 },
  btnLabel: { color: '#fff', fontWeight: '700' },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginLeft: 8 },
  complianceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  compliancePill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  compliancePillText: { fontWeight: '800', fontSize: 12 },
});
