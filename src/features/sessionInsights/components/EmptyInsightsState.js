import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function EmptyInsightsState({ title = 'No insights yet', message = 'Session summaries will appear here once approved documentation is available.' }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 12, borderRadius: 18, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', padding: 18 },
  title: { fontSize: 16, fontWeight: '800', color: '#1d4ed8' },
  message: { marginTop: 8, color: '#475569', lineHeight: 20 },
});