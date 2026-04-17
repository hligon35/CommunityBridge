import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, Linking, TouchableOpacity, Modal, TouchableWithoutFeedback, TextInput, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useData } from '../DataContext';
import { useAuth } from '../AuthContext';
import { MaterialIcons } from '@expo/vector-icons';
// header provided by ScreenWrapper
import { ScreenWrapper } from '../components/ScreenWrapper';
import { formatIdForDisplay, pravatarUriFor } from '../utils/idVisibility';

function AssignedChildrenList({ facultyId }) {
  const { children = [] } = useData();
  const navigation = useNavigation();
  // Accept facultyId as either id string or object; handle therapist references that might be objects or plain ids.
  const assigned = (children || []).filter((c) => {
    const tests = [c.amTherapist, c.pmTherapist, c.bcaTherapist];
    return tests.some((t) => {
      if (!t) return false;
      // if t is an object with id
      if (typeof t === 'object' && t.id) return t.id === facultyId || t.id === (facultyId && facultyId.id);
      // if t is a raw id string
      if (typeof t === 'string') return t === facultyId || t === (facultyId && facultyId.id);
      return false;
    });
  });
  if (!assigned.length) return <Text style={{ color: '#6b7280' }}>No assigned children</Text>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 8 }}>
      {assigned.map((c) => (
        <TouchableOpacity key={c.id} style={styles.childTile} onPress={() => { try { navigation.push('ChildDetail', { childId: c.id }); } catch (e) { navigation.navigate('ChildDetail', { childId: c.id }); } }}>
          <Image source={{ uri: c.avatar }} style={styles.childAvatarSmall} />
          <Text numberOfLines={1} style={styles.childTileName}>{c.name}</Text>
          <Text numberOfLines={1} style={{ color: '#6b7280', marginTop: 4 }}>{c.age}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

export default function FacultyDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { facultyId } = route.params || {};
  const { therapists = [], children = [], sendAdminMemo, sendMessage, messages = [] } = useData();
  const { user } = useAuth();

  const [showMemoModal, setShowMemoModal] = useState(false);
  const [memoSubject, setMemoSubject] = useState('');
  const [memoBody, setMemoBody] = useState('');

  const all = [...(therapists || [])];
  const faculty = all.find((f) => f.id === facultyId) || null;

  

  const getDisplayName = (f) => {
    if (!f) return 'Staff';
    if (f.name && !f.name.toLowerCase().startsWith('therapist')) return f.name;
    if (f.firstName || f.lastName) return `${f.firstName || ''} ${f.lastName || ''}`.trim();
    // fallback to role if name is not present
    return f.name || f.role || 'Staff';
  };

  // assigned children preview (same matching logic as AssignedChildrenList)
  const assignedChildren = (children || []).filter((c) => {
    const tests = [c.amTherapist, c.pmTherapist, c.bcaTherapist];
    return tests.some((t) => {
      if (!t) return false;
      if (typeof t === 'object' && t.id) return t.id === facultyId || t.id === (facultyId && facultyId.id);
      if (typeof t === 'string') return t === facultyId || t === (facultyId && facultyId.id);
      return false;
    });
  });

  if (!faculty) return (<View style={styles.empty}><Text style={{ color: '#666' }}>Faculty not found</Text></View>);

  const openPhone = (p) => { if (!p) return; Linking.openURL(`tel:${p}`).catch(() => {}); };
  const openEmail = (e) => { if (!e) return; Linking.openURL(`mailto:${e}`).catch(() => {}); };

  return (
    <ScreenWrapper bannerTitle="Faculty Profile" style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 16 }} style={{ flex: 1 }}>

      <View style={styles.header}>
        {(() => {
          const avatarUri = (faculty.avatar && !String(faculty.avatar).includes('pravatar.cc')) ? faculty.avatar : pravatarUriFor(faculty, 120);
          return <Image source={{ uri: avatarUri }} style={styles.avatar} />;
        })()}
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={styles.name}>{getDisplayName(faculty)}</Text>
          <Text style={styles.role}>{faculty.role || 'Staff'}</Text>
          <Text style={styles.meta}>{formatIdForDisplay(faculty.id)}</Text>
        </View>
        <View style={styles.headerActionsRight}>
          {faculty.phone ? (
            <TouchableOpacity activeOpacity={0.85} style={styles.profileIconBtn} onPress={() => openPhone(faculty.phone)}>
              <MaterialIcons name="call" size={18} color="#2563eb" />
            </TouchableOpacity>
          ) : null}
          {faculty.email ? (
            <TouchableOpacity activeOpacity={0.85} style={styles.profileIconBtn} onPress={() => openEmail(faculty.email)}>
              <MaterialIcons name="email" size={18} color="#2563eb" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.iconActionsRowFaculty}>
        <View style={styles.iconColFaculty}>
          <TouchableOpacity style={styles.iconButtonFaculty} onPress={async () => {
            try {
              const adminId = user?.id || (user?.name || 'admin');
              const threadMatch = (messages || []).find(m => {
                const senderId = m.sender?.id || m.sender?.name;
                const toIds = (m.to || []).map(t => t.id || t.name).filter(Boolean);
                const participants = new Set([String(senderId), ...toIds.map(String)]);
                return participants.has(String(adminId)) && participants.has(String(faculty.id));
              });
              if (threadMatch && (threadMatch.threadId || threadMatch.threadId === 0)) {
                navigation.navigate('ChatThread', { threadId: threadMatch.threadId });
              } else if (threadMatch && threadMatch.id) {
                navigation.navigate('ChatThread', { threadId: threadMatch.id });
              } else {
                const newThreadId = `t-${Date.now()}`;
                navigation.navigate('ChatThread', { threadId: newThreadId });
              }
            } catch (e) { console.warn('open chat failed', e); }
          }}>
            <MaterialIcons name="chat" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.iconLabelFaculty}>Chat</Text>
        </View>

        <View style={styles.iconColFaculty}>
          <TouchableOpacity style={styles.iconButtonFaculty} onPress={() => setShowMemoModal(true)}>
            <MaterialIcons name="notification-important" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.iconLabelFaculty}>Urgent Memo</Text>
        </View>

        <View style={styles.iconColFaculty}>
          <TouchableOpacity style={styles.iconButtonFaculty} onPress={() => navigation.navigate('UserMonitor', { initialUserId: faculty.id })}>
            <MaterialIcons name="manage-account" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.iconLabelFaculty}>Manage</Text>
        </View>

        <View style={styles.iconColFaculty}>
          <TouchableOpacity style={styles.iconButtonFaculty} onPress={() => { try { navigation.push('Chats'); } catch (e) { navigation.navigate('Chats'); } }}>
            <MaterialIcons name="event" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.iconLabelFaculty}>Meeting</Text>
        </View>
      </View>

      {/* Contact section removed — quick contact icons available in header */}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Assigned Children</Text>
        {/* find children assigned to this faculty */}
        <AssignedChildrenList facultyId={faculty.id} />
      </View>

      <View style={{ height: 32 }} />
      </ScrollView>
      {/* Urgent admin memo modal */}
      {showMemoModal && (
        <Modal transparent visible animationType="fade">
          <TouchableWithoutFeedback onPress={() => setShowMemoModal(false)}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' }}>
              <TouchableWithoutFeedback>
                <View style={{ width: '90%', backgroundColor: '#fff', padding: 12, borderRadius: 8 }}>
                  <Text style={{ fontWeight: '700', marginBottom: 8 }}>Send Urgent Memo</Text>
                  <TextInput placeholder="Subject" value={memoSubject} onChangeText={setMemoSubject} style={{ borderWidth: 1, borderColor: '#e5e7eb', padding: 8, borderRadius: 8, marginBottom: 8 }} />
                  <TextInput placeholder="Message" value={memoBody} onChangeText={setMemoBody} multiline style={{ borderWidth: 1, borderColor: '#e5e7eb', padding: 8, borderRadius: 8, height: 120, marginBottom: 12 }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <TouchableOpacity onPress={() => setShowMemoModal(false)} style={{ marginRight: 8, padding: 8 }}><Text>Cancel</Text></TouchableOpacity>
                    <TouchableOpacity onPress={async () => {
                      try {
                        await sendAdminMemo({ recipients: [{ id: faculty.id }], subject: memoSubject || `Message about ${faculty.name || 'staff'}`, body: memoBody || '' });
                        Alert.alert('Sent', 'Urgent memo sent');
                        setShowMemoModal(false);
                        setMemoSubject(''); setMemoBody('');
                      } catch (e) { console.warn(e); Alert.alert('Failed', 'Could not send memo'); }
                    }} style={{ padding: 8, backgroundColor: '#2563eb', borderRadius: 8 }}><Text style={{ color: '#fff' }}>Send</Text></TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
      
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#eee' },
  name: { fontSize: 20, fontWeight: '700' },
  role: { color: '#6b7280', marginTop: 4 },
  meta: { color: '#374151', marginTop: 6, fontSize: 13, fontWeight: '700', backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  headerActionsRight: { alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  profileIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e6e7ea',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 1.5,
    elevation: 2,
    marginVertical: 6,
  },
  section: { marginTop: 12 },
  sectionTitle: { fontWeight: '700', marginBottom: 6 },
  link: { color: '#0066FF', marginTop: 6 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  childTile: { width: 96, padding: 8, marginRight: 8, alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#eef2f7' },
  childAvatarSmall: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#eee' },
  childTileName: { marginTop: 6, fontSize: 12, fontWeight: '700' },
  iconActionsRowFaculty: { flexDirection: 'row', marginTop: 12, justifyContent: 'space-between', alignItems: 'center' },
  iconColFaculty: { alignItems: 'center', flex: 1 },
  iconButtonFaculty: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' },
  iconLabelFaculty: { marginTop: 6, fontWeight: '700', fontSize: 12 },
});
