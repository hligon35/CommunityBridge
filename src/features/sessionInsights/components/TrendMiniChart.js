import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function TrendMiniChart({ title, items = [], color = '#2563eb', emptyText = 'No trend data recorded yet.' }) {
  const values = Array.isArray(items) ? items : [];
  const max = Math.max(1, ...values.map((item) => Number(item?.value || 0)));
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {values.length ? (
        <View style={styles.row}>
          {values.map((item, index) => (
            <View key={`${item.label}-${index}`} style={styles.barItem}>
              <View style={styles.track}>
                <View style={[styles.fill, { backgroundColor: color, height: `${Math.max(12, (Number(item.value || 0) / max) * 100)}%` }]} />
              </View>
              <Text style={styles.label}>{item.label}</Text>
              <Text style={styles.value}>{item.value}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>{emptyText}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 12, borderRadius: 16, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', padding: 14 },
  title: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  barItem: { flex: 1, alignItems: 'center', marginHorizontal: 4 },
  track: { height: 110, width: 28, borderRadius: 14, backgroundColor: '#e2e8f0', justifyContent: 'flex-end', overflow: 'hidden' },
  fill: { width: '100%', borderRadius: 14 },
  label: { marginTop: 8, fontSize: 11, color: '#475569', fontWeight: '700' },
  value: { marginTop: 4, fontSize: 11, color: '#64748b' },
  empty: { color: '#64748b', lineHeight: 20 },
});