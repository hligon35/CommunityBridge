import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { useData } from '../DataContext';
// header provided by ScreenWrapper
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useNavigation } from '@react-navigation/native';
import { Share } from 'react-native';

function toCSV(rows) {
  if (!rows || !rows.length) return '';
  const keys = Object.keys(rows[0]);
  const header = keys.join(',');
  const lines = rows.map(r => keys.map(k => (`"${String(r[k] ?? '')}"`)).join(','));
  return [header, ...lines].join('\n');
}

export default function ExportDataScreen(){
  const navigation = useNavigation();
  const { messages = [], children = [] } = useData();

  async function doExport(){
    try {
      const messagesCsv = toCSV((messages || []).map(m => ({ threadId: m.threadId || '', body: m.body, sender: m.sender?.name, createdAt: m.createdAt })));
      const childrenCsv = toCSV((children || []).map(c => ({ name: c.name, age: c.age, room: c.room, notes: c.notes })));

      const payload = `--- Messages ---\n${messagesCsv}\n\n--- Children ---\n${childrenCsv}`;
      await Share.share({ message: payload, title: 'CommunityBridge export' });
    } catch (e) {
      Alert.alert('Export failed', e?.message || String(e));
    }
  }

  return (
    <ScreenWrapper style={styles.container}>
      <View style={styles.body}>
        <Text style={styles.p}>Export a CSV snapshot of messages and children.</Text>
        <TouchableOpacity style={styles.exportBtn} onPress={doExport}><Text style={styles.exportText}>Export Now</Text></TouchableOpacity>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  body: { padding: 16 },
  p: { color: '#374151' },
  exportBtn: { marginTop: 16, backgroundColor: '#0066FF', padding: 12, borderRadius: 8, alignItems: 'center' },
  exportText: { color: '#fff', fontWeight: '700' }
});