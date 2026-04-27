import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useData } from '../DataContext';
import { useNavigation } from '@react-navigation/native';

export default function AdminAlertsScreen() {
  const { urgentMemos, respondToUrgentMemo, fetchAndSync, children = [] } = useData();
  const [list, setList] = useState([]);
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
        <Text style={styles.title}>Urgent Alerts</Text>
        {list.length === 0 ? (
          <Text style={styles.empty}>No urgent alerts currently.</Text>
        ) : (
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
        )}
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, flex: 1 },
  title: { fontWeight: '700', fontSize: 18, marginBottom: 12 },
  empty: { color: '#6b7280' },
  card: { backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 10 },
  meta: { color: '#6b7280', fontSize: 12 },
  child: { fontWeight: '700', marginTop: 6 },
  note: { color: '#374151', marginTop: 6 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  btn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginLeft: 8 },
  btnLabel: { color: '#fff', fontWeight: '700' },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginLeft: 8 }
});
