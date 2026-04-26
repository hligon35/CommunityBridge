import React from 'react';
import { View, Text, Image, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useData } from '../DataContext';
import { avatarSourceFor } from '../utils/idVisibility';
import { MaterialIcons } from '@expo/vector-icons';
// header provided by ScreenWrapper
import { ScreenWrapper } from '../components/ScreenWrapper';

export default function ChildDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { childId } = route.params || {};
  const { children = [] } = useData();

  const child = (children || []).find((c) => c.id === childId) || null;

  

  if (!child) {
    return (
      <View style={styles.empty}><Text style={{ color: '#666' }}>Child not found</Text></View>
    );
  }

  return (
    <ScreenWrapper style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 16 }} style={{ flex: 1 }}>

      <View style={styles.header}>
        <Image source={avatarSourceFor(child)} style={styles.avatar} />
        <View style={{ marginLeft: 12 }}>
          <Text style={styles.name}>{child.name}</Text>
          <Text style={styles.meta}>{child.age} • {child.room}</Text>
        </View>
      </View>

      {child.carePlan ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Care Plan</Text>
          <Text style={styles.sectionText}>{child.carePlan}</Text>
        </View>
      ) : null}

      <View style={{ marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ padding: 8, backgroundColor: '#2563eb', borderRadius: 8 }} onPress={() => {
          const firstParent = (child.parents || [])[0];
          const firstTherapist = child.amTherapist || child.pmTherapist || child.bcaTherapist;
          const target = firstParent ? firstParent.id : (firstTherapist ? firstTherapist.id : null);
          if (target) navigation.navigate('AdminChatMonitor', { initialUserId: target });
        }}><Text style={{ color: '#fff', fontWeight: '700' }}>Related Chats</Text></TouchableOpacity>
        
      </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Parents</Text>
            {(child.parents || []).map((p) => (
              <TouchableOpacity key={p.id} style={[styles.personRow, { justifyContent: 'space-between' }]} onPress={() => navigation.navigate('ParentDetail', { parentId: p.id })}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Image source={avatarSourceFor(p)} style={styles.smallAvatar} />
                  <View style={{ marginLeft: 8 }}>
                    <Text style={{ fontWeight: '700' }}>{p.name}</Text>
                    <Text style={{ color: '#6b7280' }}>{p.phone || ''}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {p.phone ? <TouchableOpacity style={{ padding: 8 }} onPress={() => { try { Linking.openURL(`tel:${p.phone}`); } catch (e) {} }}><MaterialIcons name="call" size={18} color="#2563eb" /></TouchableOpacity> : null}
                  {p.email ? <TouchableOpacity style={{ padding: 8 }} onPress={() => { try { Linking.openURL(`mailto:${p.email}`); } catch (e) {} }}><MaterialIcons name="email" size={18} color="#2563eb" /></TouchableOpacity> : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>

      {child.notes ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.sectionText}>{child.notes}</Text>
        </View>
      ) : null}

      {Array.isArray(child.upcoming) && child.upcoming.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming</Text>
          {child.upcoming.map((u) => (
            <View key={u.id} style={{ marginTop: 8 }}>
              <Text style={{ fontWeight: '700' }}>{u.title}</Text>
              <Text style={{ color: '#6b7280' }}>{u.when}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Therapists</Text>
        {child.amTherapist ? (
          <TouchableOpacity style={styles.personRow} onPress={() => navigation.navigate('FacultyDetail', { facultyId: child.amTherapist.id })}>
            <Image source={avatarSourceFor(child.amTherapist)} style={styles.smallAvatar} />
            <View style={{ marginLeft: 8 }}>
              <Text style={{ fontWeight: '700' }}>{child.amTherapist.name}</Text>
              <Text style={{ color: '#6b7280' }}>{child.amTherapist.role}</Text>
            </View>
          </TouchableOpacity>
        ) : null}
        {child.pmTherapist ? (
          <TouchableOpacity style={styles.personRow} onPress={() => navigation.navigate('FacultyDetail', { facultyId: child.pmTherapist.id })}>
            <Image source={avatarSourceFor(child.pmTherapist)} style={styles.smallAvatar} />
            <View style={{ marginLeft: 8 }}>
              <Text style={{ fontWeight: '700' }}>{child.pmTherapist.name}</Text>
              <Text style={{ color: '#6b7280' }}>{child.pmTherapist.role}</Text>
            </View>
          </TouchableOpacity>
        ) : null}
        {child.bcaTherapist ? (
          <TouchableOpacity style={styles.personRow} onPress={() => navigation.navigate('FacultyDetail', { facultyId: child.bcaTherapist.id })}>
            <Image source={avatarSourceFor(child.bcaTherapist)} style={styles.smallAvatar} />
            <View style={{ marginLeft: 8 }}>
              <Text style={{ fontWeight: '700' }}>{child.bcaTherapist.name}</Text>
              <Text style={{ color: '#6b7280' }}>{child.bcaTherapist.role}</Text>
            </View>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={{ height: 32 }} />
      </ScrollView>
      
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#eee' },
  name: { fontSize: 20, fontWeight: '700' },
  meta: { color: '#6b7280', marginTop: 4 },
  section: { marginTop: 12 },
  sectionTitle: { fontWeight: '700', marginBottom: 6 },
  sectionText: { color: '#374151' },
  personRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  smallAvatar: { width: 44, height: 44, borderRadius: 22 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
