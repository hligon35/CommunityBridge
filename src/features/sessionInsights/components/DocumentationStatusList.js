import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import SummarySectionCard from './SummarySectionCard';

export default function DocumentationStatusList({ title, items = [], emptyText = 'No documentation items to review.' }) {
  const values = Array.isArray(items) ? items : [];
  return (
    <SummarySectionCard title={title}>
      {values.length ? values.map((item, index) => (
        <View key={`${item.sessionId || item.childId || item.title || 'item'}-${index}`} style={styles.row}>
          <Text style={styles.title}>{item.childName || item.title || 'Session item'}</Text>
          <Text style={styles.meta}>{item.sessionDateLabel || item.statusLabel || item.status || 'Needs review'}</Text>
        </View>
      )) : <Text style={styles.empty}>{emptyText}</Text>}
    </SummarySectionCard>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  title: { fontWeight: '700', color: '#0f172a' },
  meta: { marginTop: 4, color: '#64748b' },
  empty: { color: '#64748b', lineHeight: 20 },
});