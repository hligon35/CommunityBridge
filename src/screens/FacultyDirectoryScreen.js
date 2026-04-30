import React, { useMemo, useState } from 'react';
import { useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Image, TextInput } from 'react-native';
import { useData } from '../DataContext';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
// header provided by ScreenWrapper
import { ScreenWrapper } from '../components/ScreenWrapper';
import { Linking } from 'react-native';
import { avatarSourceFor } from '../utils/idVisibility';
import * as Api from '../Api';

export default function FacultyDirectoryScreen() {
  const { therapists = [], children = [] } = useData();
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [workspaceMap, setWorkspaceMap] = useState({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const response = await Api.listStaffWorkspaces((therapists || []).map((item) => item?.id));
        if (!mounted) return;
        const next = {};
        (response?.items || []).forEach((item) => {
          if (item?.id) next[item.id] = item;
        });
        setWorkspaceMap(next);
      } catch (_) {
        if (mounted) setWorkspaceMap({});
      }
    })();
    return () => {
      mounted = false;
    };
  }, [therapists]);

  const list = useMemo(() => {
    const map = new Map();
    (therapists || []).forEach((f) => { if (f && f.id) map.set(f.id, f); });
    const caseloadById = new Map();
    (children || []).forEach((child) => {
      [child?.amTherapist, child?.pmTherapist, child?.bcaTherapist].forEach((entry) => {
        const id = typeof entry === 'string' ? entry : entry?.id;
        if (!id) return;
        const next = caseloadById.get(id) || new Set();
        next.add(child?.id || child?.name || 'child');
        caseloadById.set(id, next);
      });
    });
    const normalizedQuery = query.trim().toLowerCase();
    return Array.from(map.values())
      .map((item) => ({
        ...item,
        caseloadSize: Array.from(caseloadById.get(item.id) || []).length,
        workspace: workspaceMap[item.id] || null,
      }))
      .filter((item) => {
        const role = String(item?.role || '').toLowerCase();
        if (roleFilter === 'bcba' && !role.includes('bcba')) return false;
        if (roleFilter === 'therapist' && role.includes('bcba')) return false;
        if (roleFilter === 'unassigned' && item.caseloadSize > 0) return false;
        if (!normalizedQuery) return true;
        const haystack = [item?.name, item?.role, item?.email, item?.phone].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(normalizedQuery);
      });
  }, [therapists, children, query, roleFilter, workspaceMap]);

  const navigation = useNavigation();

  const renderItem = ({ item }) => (
    <View style={styles.row}>
      <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} onPress={() => { try { navigation.navigate('FacultyDetail', { facultyId: item.id }); } catch (e) {} }}>
        <Image source={avatarSourceFor(item)} style={styles.avatar} />
        <View style={styles.info}>
          <Text style={styles.name}>{item.name || (item.firstName ? `${item.firstName} ${item.lastName}` : (item.role || 'Staff'))}</Text>
          <Text style={styles.meta}>{item.role || 'Staff'}</Text>
          <Text style={styles.contact}>{item.phone || ''} {item.email ? `• ${item.email}` : ''}</Text>
          <Text style={styles.caseload}>{item.caseloadSize} learner{item.caseloadSize === 1 ? '' : 's'} assigned</Text>
          <Text style={[styles.compliance, item.workspace?.documents?.length ? styles.complianceOk : styles.complianceWarn]}>
            {item.workspace?.credentials?.certificationExpiration ? `Credential review: ${item.workspace.credentials.certificationExpiration}` : 'Credential review missing'}
          </Text>
        </View>
      </TouchableOpacity>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => { if (item.phone) Linking.openURL(`tel:${item.phone}`).catch(() => {}); }} style={styles.iconTouch}><MaterialIcons name="call" size={20} color="#2563eb" /></TouchableOpacity>
        <TouchableOpacity onPress={() => { if (item.email) Linking.openURL(`mailto:${item.email}`).catch(() => {}); }} style={styles.iconTouch}><MaterialIcons name="email" size={20} color="#2563eb" /></TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ScreenWrapper style={styles.container}>
      <View style={styles.headerBlock}>
        <Text style={styles.headerTitle}>Staff Roster</Text>
        <Text style={styles.headerText}>Filter by role, search staff records, and inspect caseload coverage before opening a profile.</Text>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search staff" style={styles.searchInput} />
        <View style={styles.filterRow}>
          {[
            { key: 'all', label: 'All' },
            { key: 'bcba', label: 'BCBA' },
            { key: 'therapist', label: 'Therapist' },
            { key: 'unassigned', label: 'Needs Assignment' },
          ].map((filter) => (
            <TouchableOpacity key={filter.key} style={[styles.filterChip, roleFilter === filter.key ? styles.filterChipActive : null]} onPress={() => setRoleFilter(filter.key)}>
              <Text style={[styles.filterChipText, roleFilter === filter.key ? styles.filterChipTextActive : null]}>{filter.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <FlatList
        data={list}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        ListEmptyComponent={<View style={styles.empty}><Text style={{ color: '#666' }}>No faculty available</Text></View>}
        contentContainerStyle={{ padding: 12 }}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerBlock: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  headerText: { marginTop: 6, color: '#64748b' },
  searchInput: { marginTop: 12, borderWidth: 1, borderColor: '#d7dee7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fff' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  filterChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#f1f5f9', marginRight: 8, marginBottom: 8 },
  filterChipActive: { backgroundColor: '#2563eb' },
  filterChipText: { color: '#0f172a', fontWeight: '700' },
  filterChipTextActive: { color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  avatar: { width: 56, height: 56, borderRadius: 28, marginRight: 12, backgroundColor: '#ddd' },
  info: { flex: 1 },
  name: { fontWeight: '700', fontSize: 16 },
  meta: { color: '#6b7280', marginTop: 4 },
  contact: { color: '#374151', marginTop: 6 },
  caseload: { color: '#2563eb', marginTop: 6, fontWeight: '700' },
  compliance: { marginTop: 6, fontWeight: '700' },
  complianceOk: { color: '#16a34a' },
  complianceWarn: { color: '#d97706' },
  empty: { padding: 24, alignItems: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  iconTouch: { paddingHorizontal: 8 },
});
