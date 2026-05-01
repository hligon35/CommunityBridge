import React, { useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../AuthContext';
import { useData } from '../DataContext';
import { hasFullAdminSectionAccess, ADMIN_SECTION_KEYS } from '../core/tenant/models';
import * as Api from '../Api';

function normalizeImportedDirectory(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const normalized = {
    children: Array.isArray(source.children) ? source.children.filter(Boolean) : [],
    parents: Array.isArray(source.parents) ? source.parents.filter(Boolean) : [],
    therapists: Array.isArray(source.therapists) ? source.therapists.filter(Boolean) : [],
  };
  const total = normalized.children.length + normalized.parents.length + normalized.therapists.length;
  if (!total) throw new Error('Import file must contain at least one of: children, parents, therapists.');
  return normalized;
}

export default function ImportCenterScreen() {
  const { user } = useAuth();
  const { fetchAndSync } = useData();
  const canManageImports = hasFullAdminSectionAccess(user?.role, ADMIN_SECTION_KEYS.SETTINGS);
  const [pickedFile, setPickedFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lastImportSummary, setLastImportSummary] = useState(null);
  const [auditItems, setAuditItems] = useState([]);
  const [auditError, setAuditError] = useState('');

  const samplePayload = useMemo(() => ({
    children: [{ id: 'child-001', name: 'Sample Learner', age: '6', room: 'A1' }],
    parents: [{ id: 'parent-001', name: 'Sample Parent', email: 'parent@example.com' }],
    therapists: [{ id: 'staff-001', name: 'Sample BCBA', role: 'bcba', email: 'bcba@example.com' }],
  }), []);

  if (!canManageImports) {
    return (
      <ScreenWrapper style={styles.container}>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Import Center is reserved for office admin workflow.</Text>
        </View>
      </ScreenWrapper>
    );
  }

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setAuditError('');
        const response = await Api.getAuditLogs(12);
        if (!mounted) return;
        const items = Array.isArray(response?.items) ? response.items : [];
        setAuditItems(items.filter((item) => String(item?.action || '').toLowerCase().includes('directory') || String(item?.action || '').toLowerCase().includes('import')));
      } catch (_) {
        if (mounted) {
          setAuditItems([]);
          setAuditError('Could not load recent import audit activity.');
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function pickImportFile() {
    try {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        await new Promise((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json,application/json';
          input.onchange = () => {
            const file = input.files && input.files[0] ? input.files[0] : null;
            if (file) {
              setPickedFile({
                name: file.name || 'selected file',
                file,
                size: file.size,
              });
            }
            resolve();
          };
          input.click();
        });
        return;
      }

      const DocumentPickerModule = require('expo-document-picker');
      const DocumentPicker = DocumentPickerModule?.default || DocumentPickerModule;
      if (!DocumentPicker?.getDocumentAsync) {
        Alert.alert('Import', 'File picker is not available.');
        return;
      }
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result?.canceled) return;
      const asset = Array.isArray(result?.assets) ? result.assets[0] : null;
      if (!asset?.uri) return;
      setPickedFile({ name: asset.name || 'selected file', uri: asset.uri, size: asset.size });
    } catch (error) {
      Alert.alert('Import failed', error?.message || String(error));
    }
  }

  async function readImportContents() {
    if (!pickedFile) throw new Error('Choose a JSON file before importing.');
    if (pickedFile.file && typeof pickedFile.file.text === 'function') return pickedFile.file.text();
    if (pickedFile.uri) return FileSystem.readAsStringAsync(pickedFile.uri, { encoding: FileSystem.EncodingType.UTF8 });
    throw new Error('Selected file could not be read.');
  }

  async function runImport() {
    try {
      setBusy(true);
      const raw = await readImportContents();
      const parsed = JSON.parse(String(raw || ''));
      const normalized = normalizeImportedDirectory(parsed);
      await Api.mergeDirectory(normalized);
      await fetchAndSync({ force: true });
      setLastImportSummary({
        children: normalized.children.length,
        parents: normalized.parents.length,
        therapists: normalized.therapists.length,
        importedAt: new Date().toISOString(),
      });
      Alert.alert('Import complete', `Imported ${normalized.children.length} students, ${normalized.parents.length} parents, and ${normalized.therapists.length} staff records.`);
    } catch (error) {
      Alert.alert('Import failed', error?.message || String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenWrapper style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Import Center</Text>
          <Text style={styles.title}>Directory ingestion and validation workspace</Text>
          <Text style={styles.subtitle}>Office users can review expected payload shape, choose a file, and run a scoped directory merge without leaving the admin workspace.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Expected JSON shape</Text>
          <Text style={styles.codeBlock}>{JSON.stringify(samplePayload, null, 2)}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Import file</Text>
          <Text style={styles.helperText}>{pickedFile ? `${pickedFile.name}${pickedFile.size ? ` • ${pickedFile.size} bytes` : ''}` : 'No file selected yet.'}</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.primaryButton} onPress={pickImportFile} disabled={busy}>
              <Text style={styles.primaryButtonText}>{pickedFile ? 'Change File' : 'Choose File'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondaryButton, !pickedFile ? styles.disabledButton : null]} onPress={runImport} disabled={busy || !pickedFile}>
              <Text style={styles.secondaryButtonText}>{busy ? 'Importing...' : 'Run Import'}</Text>
            </TouchableOpacity>
          </View>
          {lastImportSummary ? (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Last Import</Text>
              <Text style={styles.summaryText}>{lastImportSummary.children} students • {lastImportSummary.parents} parents • {lastImportSummary.therapists} staff</Text>
              <Text style={styles.summaryText}>{new Date(lastImportSummary.importedAt).toLocaleString()}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Recent import-related audit activity</Text>
          {auditError ? <Text style={styles.errorText}>{auditError}</Text> : null}
          {auditItems.length ? auditItems.map((item) => (
            <View key={item.id || item.createdAt} style={styles.auditRow}>
              <Text style={styles.auditAction}>{String(item.action || 'audit.event')}</Text>
              <Text style={styles.auditMeta}>{item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown time'}</Text>
            </View>
          )) : <Text style={styles.helperText}>No import audit entries yet.</Text>}
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16 },
  hero: { borderRadius: 18, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', padding: 16 },
  eyebrow: { color: '#1d4ed8', fontWeight: '800', textTransform: 'uppercase', fontSize: 12 },
  title: { marginTop: 6, fontSize: 23, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 8, color: '#475569', lineHeight: 20 },
  card: { marginTop: 14, borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', padding: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 8 },
  codeBlock: { borderRadius: 12, backgroundColor: '#0f172a', color: '#e2e8f0', padding: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 },
  helperText: { color: '#64748b', lineHeight: 18 },
  errorText: { color: '#b91c1c', marginBottom: 8 },
  buttonRow: { flexDirection: 'row', marginTop: 12 },
  primaryButton: { flex: 1, backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginRight: 8 },
  primaryButtonText: { color: '#fff', fontWeight: '800' },
  secondaryButton: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#94a3b8', alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#334155', fontWeight: '800' },
  disabledButton: { opacity: 0.55 },
  summaryCard: { marginTop: 12, borderRadius: 12, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', padding: 12 },
  summaryTitle: { fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  summaryText: { color: '#475569' },
  auditRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  auditAction: { color: '#0f172a', fontWeight: '700' },
  auditMeta: { marginTop: 4, color: '#64748b' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: '#475569', textAlign: 'center', lineHeight: 22 },
});