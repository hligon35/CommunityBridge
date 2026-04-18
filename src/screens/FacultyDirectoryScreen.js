import React, { useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useData } from '../DataContext';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
// header provided by ScreenWrapper
import { ScreenWrapper } from '../components/ScreenWrapper';
import { Linking } from 'react-native';
import { avatarSourceFor } from '../utils/idVisibility';

export default function FacultyDirectoryScreen() {
  const { therapists = [] } = useData();

  const list = useMemo(() => {
    const map = new Map();
    (therapists || []).forEach((f) => { if (f && f.id) map.set(f.id, f); });
    return Array.from(map.values());
  }, [therapists]);

  const navigation = useNavigation();

  const renderItem = ({ item }) => (
    <View style={styles.row}>
      <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} onPress={() => { try { navigation.navigate('FacultyDetail', { facultyId: item.id }); } catch (e) {} }}>
        <Image source={avatarSourceFor(item)} style={styles.avatar} />
        <View style={styles.info}>
          <Text style={styles.name}>{item.name || (item.firstName ? `${item.firstName} ${item.lastName}` : (item.role || 'Staff'))}</Text>
          <Text style={styles.meta}>{item.role || 'Staff'}</Text>
          <Text style={styles.contact}>{item.phone || ''} {item.email ? `• ${item.email}` : ''}</Text>
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
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  avatar: { width: 56, height: 56, borderRadius: 28, marginRight: 12, backgroundColor: '#ddd' },
  info: { flex: 1 },
  name: { fontWeight: '700', fontSize: 16 },
  meta: { color: '#6b7280', marginTop: 4 },
  contact: { color: '#374151', marginTop: 6 },
  empty: { padding: 24, alignItems: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  iconTouch: { paddingHorizontal: 8 },
});
