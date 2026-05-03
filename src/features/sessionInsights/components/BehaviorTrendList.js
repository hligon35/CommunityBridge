import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import SummarySectionCard from './SummarySectionCard';

export default function BehaviorTrendList({ items = [] }) {
  const values = Array.isArray(items) ? items : [];
  return (
    <SummarySectionCard title="Interfering behaviors">
      {values.length ? values.map((item, index) => (
        <View key={`${item.behavior}-${index}`} style={styles.row}>
          <Text style={styles.behavior}>{item.behavior}</Text>
          <Text style={styles.meta}>{item.frequency}x · {item.intensity}</Text>
        </View>
      )) : <Text style={styles.empty}>No interfering behaviors recorded.</Text>}
    </SummarySectionCard>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  behavior: { fontWeight: '700', color: '#0f172a' },
  meta: { marginTop: 4, color: '#64748b' },
  empty: { color: '#64748b', lineHeight: 20 },
});