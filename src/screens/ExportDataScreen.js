import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { useData } from '../DataContext';
// header provided by ScreenWrapper
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useNavigation } from '@react-navigation/native';

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
    Alert.alert('Export unavailable', 'Sensitive data export is disabled in this build.');
  }

  return (
    <ScreenWrapper style={styles.container}>
      <View style={styles.body}>
        <Text style={styles.p}>Export a CSV snapshot of messages and children.</Text>
        <TouchableOpacity style={[styles.exportBtn, styles.exportBtnDisabled]} onPress={doExport}><Text style={styles.exportText}>Export Disabled</Text></TouchableOpacity>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  body: { padding: 16 },
  p: { color: '#374151' },
  exportBtn: { marginTop: 16, backgroundColor: '#0066FF', padding: 12, borderRadius: 8, alignItems: 'center' },
  exportBtnDisabled: { opacity: 0.55 },
  exportText: { color: '#fff', fontWeight: '700' }
});