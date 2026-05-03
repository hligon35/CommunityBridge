import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function SummarySectionCard({ title, content, children }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {children || <Text style={styles.content}>{content}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 12, borderRadius: 16, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', padding: 14 },
  title: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  content: { color: '#475569', lineHeight: 20 },
});