import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function InsightStatCard({ label, value, hint = '', accent = '#2563eb' }) {
  return (
    <View style={styles.card}>
      <Text style={[styles.value, { color: accent }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '48%', borderRadius: 16, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', padding: 14, marginBottom: 12 },
  value: { fontSize: 24, fontWeight: '800' },
  label: { marginTop: 6, fontWeight: '800', color: '#0f172a' },
  hint: { marginTop: 6, color: '#64748b', lineHeight: 18 },
});