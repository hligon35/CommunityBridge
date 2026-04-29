import React from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../components/ScreenWrapper';
import { useAuth } from '../../AuthContext';
import * as Api from '../../Api';
import { isAdminRole } from '../../core/tenant/models';
import { logPress } from '../../utils/logger';
import moduleStyles from './ModuleStyles';

function getScopedDocs(item, storageKey, scopeId) {
  const normalizedScopeId = String(scopeId || '').trim();
  if (!normalizedScopeId) return [];
  const map = item && typeof item === 'object' && item[storageKey] && typeof item[storageKey] === 'object'
    ? item[storageKey]
    : {};
  return Array.isArray(map[normalizedScopeId]) ? map[normalizedScopeId] : [];
}

export default function ScopedDocumentsScreen({
  title,
  subtitle,
  disabledMessage,
  emptyMessage,
  storageKey,
  scopeId,
  enabled,
  iconName,
}) {
  const { user } = useAuth();
  const canManage = isAdminRole(user?.role);
  const normalizedScopeId = String(scopeId || '').trim();
  const [docs, setDocs] = React.useState([]);
  const [settingsItem, setSettingsItem] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    if (!enabled || !normalizedScopeId) {
      setDocs([]);
      setSettingsItem(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await Api.getOrgSettings();
      const item = result?.item && typeof result.item === 'object' ? result.item : {};
      setSettingsItem(item);
      setDocs(getScopedDocs(item, storageKey, normalizedScopeId));
    } catch (e) {
      setError(String(e?.message || e || 'Could not load documents.'));
    } finally {
      setLoading(false);
    }
  }, [enabled, normalizedScopeId, storageKey]);

  React.useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const persistDocs = React.useCallback(async (nextDocs) => {
    const currentItem = settingsItem && typeof settingsItem === 'object' ? settingsItem : {};
    const currentMap = currentItem[storageKey] && typeof currentItem[storageKey] === 'object' ? currentItem[storageKey] : {};
    const payload = {
      ...currentItem,
      [storageKey]: {
        ...currentMap,
        [normalizedScopeId]: nextDocs,
      },
    };
    const result = await Api.updateOrgSettings(payload);
    const item = result?.item && typeof result.item === 'object' ? result.item : payload;
    setSettingsItem(item);
    setDocs(getScopedDocs(item, storageKey, normalizedScopeId));
  }, [normalizedScopeId, settingsItem, storageKey]);

  const openDoc = React.useCallback(async (doc) => {
    const url = String(doc?.url || '').trim();
    if (!url) return;
    logPress(`${title}:Open`, { id: doc?.id || url, scopeId: normalizedScopeId });
    try {
      await Linking.openURL(url);
    } catch (_) {
      Alert.alert('Unable to open document', 'Please try again later.');
    }
  }, [normalizedScopeId, title]);

  const uploadDoc = React.useCallback(async () => {
    if (!canManage) return;
    logPress(`${title}:Upload`, { scopeId: normalizedScopeId });
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: false,
        multiple: false,
        type: '*/*',
      });
      if (picked?.canceled) return;
      const asset = Array.isArray(picked?.assets) ? picked.assets[0] : null;
      if (!asset?.uri) return;

      setSaving(true);
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: asset.name || `document-${Date.now()}`,
        type: asset.mimeType || asset.type || 'application/octet-stream',
      });
      const uploaded = await Api.uploadMedia(formData);
      const nextDocs = [
        {
          id: `doc-${Date.now()}`,
          title: asset.name || 'Document',
          meta: 'Uploaded document',
          url: uploaded?.url || '',
          fileName: asset.name || '',
          mimeType: asset.mimeType || asset.type || '',
          uploadedAt: new Date().toISOString(),
        },
        ...docs,
      ].filter((doc) => doc?.url);
      await persistDocs(nextDocs);
    } catch (e) {
      Alert.alert('Upload failed', String(e?.message || e || 'Could not upload the document.'));
    } finally {
      setSaving(false);
    }
  }, [canManage, docs, normalizedScopeId, persistDocs, title]);

  const removeDoc = React.useCallback((docId) => {
    if (!canManage) return;
    Alert.alert('Remove document', 'This will remove the document from this library.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            setSaving(true);
            await persistDocs(docs.filter((doc) => doc?.id !== docId));
          } catch (e) {
            Alert.alert('Remove failed', String(e?.message || e || 'Could not remove the document.'));
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }, [canManage, docs, persistDocs]);

  if (!enabled) {
    return (
      <ScreenWrapper>
        <ScrollView contentContainerStyle={moduleStyles.content}>
          <View style={moduleStyles.empty}>
            <Text style={moduleStyles.emptyText}>{disabledMessage}</Text>
          </View>
        </ScrollView>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <ScrollView contentContainerStyle={moduleStyles.content}>
        <View style={moduleStyles.header}>
          <Text style={moduleStyles.title}>{title}</Text>
          <Text style={moduleStyles.subtitle}>{subtitle}</Text>
          {canManage ? (
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={uploadDoc} style={moduleStyles.primaryBtn} disabled={saving} accessibilityLabel={`Upload ${title}`}>
                <Text style={moduleStyles.primaryBtnText}>{saving ? 'Uploading...' : 'Upload document'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {!normalizedScopeId ? (
          <View style={moduleStyles.empty}>
            <Text style={moduleStyles.emptyText}>Select the matching tenant scope before opening this document library.</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={moduleStyles.empty}>
            <ActivityIndicator color="#2563eb" />
            <Text style={[moduleStyles.emptyText, { marginTop: 8 }]}>Loading documents…</Text>
          </View>
        ) : null}

        {error ? (
          <View style={moduleStyles.empty}>
            <Text style={moduleStyles.emptyText}>{error}</Text>
            <TouchableOpacity onPress={() => load()} style={moduleStyles.secondaryBtn} accessibilityLabel="Reload documents">
              <Text style={moduleStyles.secondaryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!loading && !error && normalizedScopeId && !docs.length ? (
          <View style={moduleStyles.empty}>
            <Text style={moduleStyles.emptyText}>{emptyMessage}</Text>
          </View>
        ) : null}

        {!loading && !error && docs.map((doc) => (
          <TouchableOpacity key={doc.id || doc.url} onPress={() => openDoc(doc)} style={moduleStyles.card} accessibilityLabel={`Open ${doc.title || 'document'}`}>
            <View style={[moduleStyles.cardRow, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={moduleStyles.cardTitle}>{doc.title || 'Document'}</Text>
                <Text style={moduleStyles.cardMeta}>{doc.meta || doc.fileName || 'Stored document'}</Text>
                <Text style={styles.urlText} numberOfLines={1}>{doc.url}</Text>
                {doc.uploadedAt ? (
                  <Text style={styles.metaText}>Uploaded {new Date(doc.uploadedAt).toLocaleString()}</Text>
                ) : null}
              </View>
              <View style={styles.iconColumn}>
                <MaterialIcons name={iconName || 'insert-drive-file'} size={22} color="#475569" />
                {canManage ? (
                  <TouchableOpacity onPress={() => removeDoc(doc.id)} style={styles.deleteBtn} accessibilityLabel={`Remove ${doc.title || 'document'}`}>
                    <MaterialIcons name="delete-outline" size={18} color="#b91c1c" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  headerActions: {
    marginTop: 12,
  },
  iconColumn: {
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  deleteBtn: {
    marginTop: 12,
    padding: 4,
  },
  urlText: {
    color: '#2563eb',
    fontSize: 12,
    marginTop: 6,
  },
  metaText: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 4,
  },
});