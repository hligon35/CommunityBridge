import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScreenWrapper } from '../components/ScreenWrapper';
import ImageToggle from '../components/ImageToggle';

const KEY = 'bbs_permissions_v1';

const DEFAULT_ROLES = ['Admin', 'Teacher', 'Therapist', 'Parent', 'Staff'];
const DEFAULT_CAPS = [
  { id: 'users:manage', label: 'Manage users' },
  { id: 'children:edit', label: 'Edit children' },
  { id: 'messages:send', label: 'Send messages' },
  { id: 'settings:system', label: 'System settings' },
  { id: 'export:data', label: 'Export data' },
];

export default function ManagePermissionsScreen(){
  const [mapping, setMapping] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) setMapping(JSON.parse(raw));
        else {
          const init = {};
          DEFAULT_ROLES.forEach(r => { init[r] = {}; DEFAULT_CAPS.forEach(c => { init[r][c.id] = false; }); });
          setMapping(init);
        }
      } catch (e) {
        const init = {};
        DEFAULT_ROLES.forEach(r => { init[r] = {}; DEFAULT_CAPS.forEach(c => { init[r][c.id] = false; }); });
        setMapping(init);
      }
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(KEY, JSON.stringify(mapping)).catch(() => {});
  }, [mapping]);

  function toggle(role, capId, value){
    setMapping((m) => ({ ...m, [role]: { ...(m[role] || {}), [capId]: !!value } }));
  }

  function renderRole({ item: role }){
    const caps = mapping[role] || {};
    return (
      <View style={styles.roleCard}>
        <Text style={styles.roleTitle}>{role}</Text>
        {DEFAULT_CAPS.map((c) => (
          <View key={c.id} style={styles.capRow}>
            <Text style={styles.capLabel}>{c.label}</Text>
            <ImageToggle value={!!caps[c.id]} onValueChange={(v) => toggle(role, c.id, v)} accessibilityLabel={`${role} ${c.label}`} />
          </View>
        ))}
      </View>
    );
  }

  return (
    <ScreenWrapper style={styles.container}>
      <FlatList
        data={DEFAULT_ROLES}
        keyExtractor={(i) => i}
        renderItem={renderRole}
        contentContainerStyle={{ padding: 12 }}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  roleCard: { padding: 12, borderRadius: 8, backgroundColor: '#fff', marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6' },
  roleTitle: { fontWeight: '700', marginBottom: 8 },
  capRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  capLabel: { color: '#111827' }
});