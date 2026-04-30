import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function ReportMetricCard({ label, value, hint = '' }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 140, borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', padding: 12, marginRight: 10, marginBottom: 10 },
  label: { fontSize: 11, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' },
  value: { marginTop: 6, fontSize: 22, fontWeight: '800', color: '#0f172a' },
  hint: { marginTop: 4, color: '#475569', lineHeight: 18 },
});