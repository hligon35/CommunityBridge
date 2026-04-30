import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function MiniBarChart({ title, items = [], accentColor = '#2563eb', emptyText = 'No data yet.' }) {
  const maxValue = Math.max(1, ...items.map((item) => Number(item?.value) || 0));
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {!items.length ? <Text style={styles.empty}>{emptyText}</Text> : null}
      {items.map((item) => {
        const value = Number(item?.value) || 0;
        return (
          <View key={`${title}-${item.label}`} style={styles.row}>
            <View style={styles.labelWrap}><Text style={styles.label}>{item.label}</Text></View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.max(6, (value / maxValue) * 100)}%`, backgroundColor: accentColor }]} />
            </View>
            <Text style={styles.value}>{value}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', padding: 14, marginTop: 12 },
  title: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 6 },
  empty: { color: '#64748b', lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  labelWrap: { width: 78, marginRight: 10 },
  label: { color: '#475569', fontSize: 12 },
  barTrack: { flex: 1, height: 10, borderRadius: 999, backgroundColor: '#e2e8f0', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999 },
  value: { width: 44, textAlign: 'right', fontWeight: '700', color: '#0f172a', marginLeft: 10 },
});