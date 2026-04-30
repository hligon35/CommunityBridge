import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

function toneForValue(value) {
  const numeric = Number(value) || 0;
  if (numeric >= 6) return '#1d4ed8';
  if (numeric >= 3) return '#60a5fa';
  if (numeric >= 1) return '#dbeafe';
  return '#f8fafc';
}

export default function HeatmapGrid({ title, items = [], emptyText = 'No heatmap data yet.' }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {!items.length ? <Text style={styles.empty}>{emptyText}</Text> : null}
      <View style={styles.grid}>
        {items.map((item) => (
          <View key={`${title}-${item.label}`} style={[styles.cell, { backgroundColor: toneForValue(item.value) }]}>
            <Text style={styles.cellLabel}>{item.label}</Text>
            <Text style={styles.cellValue}>{item.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', padding: 14, marginTop: 12 },
  title: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 8 },
  empty: { color: '#64748b', lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '31%', minHeight: 68, borderRadius: 12, padding: 10, marginRight: '2%', marginBottom: 8, justifyContent: 'space-between' },
  cellLabel: { color: '#334155', fontSize: 11, fontWeight: '700' },
  cellValue: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
});