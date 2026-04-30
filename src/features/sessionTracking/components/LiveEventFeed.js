import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

function formatWhen(value) {
  if (!value) return 'Now';
  try {
    return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch (_) {
    return String(value);
  }
}

export default function LiveEventFeed({ items = [] }) {
  if (!items.length) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Recent Event Feed</Text>
        <Text style={styles.empty}>Queued and synced session events will appear here.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Recent Event Feed</Text>
      {items.map((item) => (
        <View key={item.feedId} style={styles.row}>
          <View style={styles.rowHeader}>
            <Text style={styles.label}>{item.label}</Text>
            <Text style={[styles.status, item.status === 'queued' ? styles.statusQueued : styles.statusSynced]}>
              {item.status === 'queued' ? 'Queued' : 'Synced'}
            </Text>
          </View>
          <Text style={styles.meta}>
            {[item.intensity || '', item.detailLabel || '', formatWhen(item.occurredAt)].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  title: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  empty: { color: '#64748b', lineHeight: 18 },
  row: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontWeight: '700', color: '#0f172a', flex: 1, paddingRight: 8 },
  status: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  statusQueued: { color: '#b45309' },
  statusSynced: { color: '#15803d' },
  meta: { marginTop: 4, color: '#64748b', fontSize: 12 },
});
