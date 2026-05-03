import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function CampusRollupCard({ campus }) {
  const item = campus || {};
  return (
    <View style={styles.card}>
      <Text style={styles.name}>{item.name || 'Campus'}</Text>
      <Text style={styles.meta}>Sessions: {Number(item.sessions || 0)} · Approved: {Number(item.approvedSummaries || 0)}</Text>
      <Text style={styles.meta}>Average mood: {item.averageMood == null ? '—' : item.averageMood}</Text>
      <Text style={styles.meta}>Behavior events: {Number(item.behaviorEvents || 0)}</Text>
      <Text style={styles.meta}>Approval rate: {item.approvalRateLabel || '0%'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 12, borderRadius: 16, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', padding: 14 },
  name: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  meta: { marginTop: 6, color: '#475569', lineHeight: 19 },
});