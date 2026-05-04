import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../AuthContext';
import { useData } from '../DataContext';
import { isBcbaRole, isOfficeAdminRole } from '../core/tenant/models';
import { avatarSourceFor } from '../utils/idVisibility';
import { THERAPY_ROLE_LABELS } from '../utils/roleTerminology';
import * as Api from '../Api';

function TabButton({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.tabButton, active ? styles.tabButtonActive : null]} onPress={onPress}>
      <Text style={[styles.tabButtonText, active ? styles.tabButtonTextActive : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

function normalizeInlineParents(selectedChild, parents) {
  if (!selectedChild) return [];
  const parentEntries = Array.isArray(selectedChild.parents) ? selectedChild.parents : [];
  const parentIds = new Set(parentEntries.map((item) => (item && typeof item === 'object' ? item.id : item)).filter(Boolean));
  const linked = (parents || []).filter((parent) => parentIds.has(parent?.id));
  if (linked.length) return linked;
  return parentEntries.map((entry, index) => {
    if (!entry) return null;
    if (typeof entry === 'string') {
      return { id: `inline-parent-${index}`, name: entry, email: '', phone: '' };
    }
    return {
      id: entry.id || `inline-parent-${index}`,
      name: entry.name || `${entry.firstName || ''} ${entry.lastName || ''}`.trim() || 'Parent/Guardian',
      email: entry.email || '',
      phone: entry.phone || '',
    };
  }).filter(Boolean);
}

export default function StudentDirectoryScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { children = [], parents = [], therapists = [], fetchAndSync } = useData();
  const isBcba = isBcbaRole(user?.role);
  const isOffice = isOfficeAdminRole(user?.role);
  const [query, setQuery] = useState('');
  const [roomFilter, setRoomFilter] = useState('all');
  const [sortKey, setSortKey] = useState('name');
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollSaving, setEnrollSaving] = useState(false);
  const [enrollDraft, setEnrollDraft] = useState({
    name: '',
    parentName: '',
    enrollmentCode: '',
    room: '',
    parentEmail: '',
    parentPhone: '',
  });

  const visibleTabs = useMemo(() => {
    const base = [
      { key: 'overview', label: 'Overview' },
      { key: 'parents', label: 'Parent Contacts' },
      { key: 'attendance', label: 'Attendance' },
      { key: 'documents', label: 'Documents' },
    ];
    if (isBcba) {
      base.splice(2, 0,
        { key: 'programs', label: 'Clinical Programs' },
        { key: 'bip', label: 'Behavior Plan / BIP' },
        { key: 'iep', label: 'IEP / Goals' },
      );
    }
    return base;
  }, [isBcba]);

  const roomOptions = useMemo(() => ['all', ...Array.from(new Set((children || []).map((child) => child?.room).filter(Boolean)))], [children]);

  const filteredChildren = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...(children || [])]
      .filter((child) => {
        if (roomFilter !== 'all' && String(child?.room || '') !== roomFilter) return false;
        if (!normalized) return true;
        const haystack = [child?.name, child?.room, child?.carePlan, child?.age].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(normalized);
      })
      .sort((left, right) => {
        if (sortKey === 'room') return String(left?.room || '').localeCompare(String(right?.room || ''));
        if (sortKey === 'age') return Number(left?.age || 0) - Number(right?.age || 0);
        return String(left?.name || '').localeCompare(String(right?.name || ''));
      });
  }, [children, query, roomFilter, sortKey]);

  useEffect(() => {
    if (!filteredChildren.length) {
      setSelectedChildId(null);
      return;
    }
    if (!filteredChildren.some((child) => child?.id === selectedChildId)) {
      setSelectedChildId(filteredChildren[0]?.id || null);
    }
  }, [filteredChildren, selectedChildId]);

  const selectedChild = useMemo(() => filteredChildren.find((child) => child?.id === selectedChildId) || null, [filteredChildren, selectedChildId]);
  const linkedParents = useMemo(() => normalizeInlineParents(selectedChild, parents), [parents, selectedChild]);
  const assignedStaff = useMemo(() => {
    if (!selectedChild) return [];
    const ids = [selectedChild?.amTherapist, selectedChild?.pmTherapist, selectedChild?.bcaTherapist].map((entry) => typeof entry === 'string' ? entry : entry?.id).filter(Boolean);
    return (therapists || []).filter((staff) => ids.includes(staff?.id));
  }, [selectedChild, therapists]);

  function openAction(title, message) {
    Alert.alert(title, message);
  }

  function updateEnrollDraft(key, value) {
    setEnrollDraft((current) => ({ ...current, [key]: value }));
  }

  function resetEnrollDraft() {
    setEnrollDraft({
      name: '',
      parentName: '',
      enrollmentCode: '',
      room: '',
      parentEmail: '',
      parentPhone: '',
    });
  }

  async function submitEnrollment() {
    setEnrollSaving(true);
    try {
      const result = await Api.enrollLearner(enrollDraft);
      setSelectedChildId(result?.child?.id || null);
      await fetchAndSync?.({ force: true });
      setEnrollOpen(false);
      resetEnrollDraft();
      Alert.alert(
        'Learner enrolled',
        `${result?.child?.name || 'The learner'} was added to ${result?.enrollmentContext?.campus?.name || 'the selected campus'}. A family can now finish signup with the same enrollment code and the matching parent or guardian name.`
      );
    } catch (error) {
      Alert.alert('Enrollment failed', String(error?.message || error || 'We could not enroll this learner.'));
    } finally {
      setEnrollSaving(false);
    }
  }

  function renderTabContent() {
    if (!selectedChild) return <Text style={styles.empty}>Select a student to view details.</Text>;
    if (activeTab === 'overview') {
      return (
        <>
          <Text style={styles.sectionTitle}>Student profile</Text>
          <Text style={styles.detailText}>Room {selectedChild.room || 'Unassigned'} • Age {selectedChild.age || 'N/A'} • Session {selectedChild.session || 'Unscheduled'}</Text>
          <Text style={styles.detailText}>{selectedChild.carePlan || 'No overview summary saved yet.'}</Text>
          <Text style={styles.sectionTitle}>Assigned staff</Text>
          {(assignedStaff || []).length ? assignedStaff.map((staff) => <Text key={staff.id} style={styles.detailText}>{staff.name} • {staff.role || 'Staff'}</Text>) : <Text style={styles.detailText}>No BCBA or therapist assigned.</Text>}
        </>
      );
    }
    if (activeTab === 'parents') {
      return (
        <>
          <Text style={styles.sectionTitle}>Parent contacts</Text>
          {linkedParents.length ? linkedParents.map((parent) => (
            <Text key={parent.id} style={styles.detailText}>{parent.name || `${parent.firstName || ''} ${parent.lastName || ''}`.trim()} • {parent.phone || parent.email || 'No contact info'}</Text>
          )) : <Text style={styles.detailText}>No linked parent contacts found.</Text>}
        </>
      );
    }
    if (activeTab === 'programs') {
      return (
        <>
          <Text style={styles.sectionTitle}>Clinical programs</Text>
          <Text style={styles.detailText}>{selectedChild.carePlan || 'No clinical programs have been attached yet.'}</Text>
        </>
      );
    }
    if (activeTab === 'bip') {
      return (
        <>
          <Text style={styles.sectionTitle}>Behavior intervention plan</Text>
          <Text style={styles.detailText}>{selectedChild.behaviorPlan || 'No BIP uploaded yet. Add one from the BCBA workflow.'}</Text>
        </>
      );
    }
    if (activeTab === 'iep') {
      return (
        <>
          <Text style={styles.sectionTitle}>IEP and goals</Text>
          <Text style={styles.detailText}>{selectedChild.goals || 'No goal set has been entered for this student yet.'}</Text>
        </>
      );
    }
    if (activeTab === 'attendance') {
      return (
        <>
          <Text style={styles.sectionTitle}>Attendance</Text>
          <Text style={styles.detailText}>Recent attendance tracking lives in the scheduling and attendance modules for this student.</Text>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('Attendance')}>
            <Text style={styles.secondaryButtonText}>Open Attendance</Text>
          </TouchableOpacity>
        </>
      );
    }
    return (
      <>
        <Text style={styles.sectionTitle}>Documents</Text>
        <Text style={styles.detailText}>{isOffice ? 'Office can upload student records and supporting documentation here.' : 'BCBA can review office-uploaded documentation here.'}</Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => openAction('Documents', 'Document upload routing can be connected to the existing admin document flows next.')}>
          <Text style={styles.secondaryButtonText}>{isOffice ? 'Upload Document' : 'View Documents'}</Text>
        </TouchableOpacity>
      </>
    );
  }

  return (
    <ScreenWrapper style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Students</Text>
          <Text style={styles.title}>Central hub for student records</Text>
          <Text style={styles.subtitle}>Search, filter, sort, and manually enroll a learner without leaving the directory workspace.</Text>
          {isOffice ? (
            <TouchableOpacity style={styles.heroButton} onPress={() => setEnrollOpen(true)}>
              <Text style={styles.heroButtonText}>Enroll Learner</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.filtersCard}>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search students" style={styles.input} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRowSingleLine}>
            {roomOptions.map((room) => <TabButton key={room} label={room === 'all' ? 'All Rooms' : room} active={roomFilter === room} onPress={() => setRoomFilter(room)} />)}
            {[
              { key: 'name', label: 'Sort: Name' },
              { key: 'room', label: 'Sort: Room' },
              { key: 'age', label: 'Sort: Age' },
            ].map((item) => <TabButton key={item.key} label={item.label} active={sortKey === item.key} onPress={() => setSortKey(item.key)} />)}
          </ScrollView>
        </View>

        <View style={styles.layoutRow}>
          <View style={styles.rosterPanel}>
            <Text style={styles.panelTitle}>Student roster</Text>
            {filteredChildren.map((child) => (
              <TouchableOpacity key={child.id} style={[styles.rosterRow, child.id === selectedChildId ? styles.rosterRowActive : null]} onPress={() => setSelectedChildId(child.id)}>
                <Image source={avatarSourceFor(child)} style={styles.avatar} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rosterName}>{child.name}</Text>
                  <Text style={styles.rosterMeta}>Room {child.room || 'Unassigned'} • Age {child.age || 'N/A'}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.detailPanel}>
            {selectedChild ? (
              <>
                <View style={styles.profileHeader}>
                  <Image source={avatarSourceFor(selectedChild)} style={styles.profileAvatar} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.profileName}>{selectedChild.name}</Text>
                    <Text style={styles.profileMeta}>Room {selectedChild.room || 'Unassigned'} • {selectedChild.session || 'Session unassigned'}</Text>
                  </View>
                </View>

                <View style={styles.chipRow}>
                  {visibleTabs.map((tab) => <TabButton key={tab.key} label={tab.label} active={activeTab === tab.key} onPress={() => setActiveTab(tab.key)} />)}
                </View>

                <View style={styles.tabContent}>{renderTabContent()}</View>

                <View style={styles.actionStrip}>
                  {isOffice ? (
                    <>
                      <TouchableOpacity style={styles.primaryButton} onPress={() => openAction('Edit student info', 'Student editing can continue through the student profile workspace.')}>
                        <Text style={styles.primaryButtonText}>Edit Student Info</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.secondaryButton} onPress={() => openAction('Assign BCBA / Therapist', 'Assignment controls belong in the office staffing workflow and are ready for connection here.')}>
                        <Text style={styles.secondaryButtonText}>{`Assign BCBA / ${THERAPY_ROLE_LABELS.therapist}`}</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('ProgramDirectory', { studentId: selectedChild.id, focusMode: 'editor' })}>
                      <Text style={styles.primaryButtonText}>Add Program</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('ChildDetail', { childId: selectedChild.id })}>
                    <Text style={styles.secondaryButtonText}>Open Full Profile</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : <Text style={styles.empty}>No student selected.</Text>}
          </View>
        </View>
      </ScrollView>

      <Modal visible={enrollOpen} transparent animationType="fade" onRequestClose={() => !enrollSaving && setEnrollOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enroll Learner</Text>
            <Text style={styles.modalBody}>Use the campus enrollment code plus the family’s matching guardian name so the learner can be claimed later during parent signup.</Text>

            <Text style={styles.fieldLabel}>Learner name</Text>
            <TextInput value={enrollDraft.name} onChangeText={(value) => updateEnrollDraft('name', value)} placeholder="Learner full name" style={styles.input} editable={!enrollSaving} />

            <Text style={styles.fieldLabel}>Parent or guardian name</Text>
            <TextInput value={enrollDraft.parentName} onChangeText={(value) => updateEnrollDraft('parentName', value)} placeholder="Parent or guardian full name" style={styles.input} editable={!enrollSaving} />

            <Text style={styles.fieldLabel}>Enrollment code</Text>
            <TextInput value={enrollDraft.enrollmentCode} onChangeText={(value) => updateEnrollDraft('enrollmentCode', String(value || '').toUpperCase())} placeholder="Campus enrollment code" style={styles.input} editable={!enrollSaving} autoCapitalize="characters" autoCorrect={false} />

            <Text style={styles.fieldLabel}>Room</Text>
            <TextInput value={enrollDraft.room} onChangeText={(value) => updateEnrollDraft('room', value)} placeholder="Optional classroom or room" style={styles.input} editable={!enrollSaving} />

            <Text style={styles.fieldLabel}>Parent email</Text>
            <TextInput value={enrollDraft.parentEmail} onChangeText={(value) => updateEnrollDraft('parentEmail', value)} placeholder="Optional" style={styles.input} editable={!enrollSaving} autoCapitalize="none" keyboardType="email-address" />

            <Text style={styles.fieldLabel}>Parent phone</Text>
            <TextInput value={enrollDraft.parentPhone} onChangeText={(value) => updateEnrollDraft('parentPhone', value)} placeholder="Optional" style={styles.input} editable={!enrollSaving} keyboardType="phone-pad" />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setEnrollOpen(false)} disabled={enrollSaving}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={submitEnrollment} disabled={enrollSaving}>
                <Text style={styles.primaryButtonText}>{enrollSaving ? 'Saving...' : 'Enroll Learner'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16 },
  hero: { borderRadius: 22, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', padding: 18 },
  heroButton: { marginTop: 14, alignSelf: 'flex-start', borderRadius: 12, backgroundColor: '#2563eb', paddingVertical: 10, paddingHorizontal: 14 },
  heroButtonText: { color: '#fff', fontWeight: '800' },
  eyebrow: { color: '#1d4ed8', fontWeight: '800', fontSize: 12, textTransform: 'uppercase' },
  title: { marginTop: 6, fontSize: 24, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 8, color: '#475569', lineHeight: 20 },
  filtersCard: { marginTop: 14, borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', padding: 16 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fff' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  chipRowSingleLine: { flexDirection: 'row', flexWrap: 'nowrap', marginTop: 12, paddingRight: 8 },
  tabButton: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#f1f5f9', marginRight: 8, marginBottom: 8 },
  tabButtonActive: { backgroundColor: '#2563eb' },
  tabButtonText: { color: '#0f172a', fontWeight: '700' },
  tabButtonTextActive: { color: '#ffffff' },
  layoutRow: { marginTop: 14, flexDirection: 'row' },
  rosterPanel: { width: '34%', borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', padding: 14, marginRight: 12 },
  detailPanel: { flex: 1, borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', padding: 16 },
  panelTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  rosterRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 10, marginBottom: 8, backgroundColor: '#f8fafc' },
  rosterRowActive: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#93c5fd' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e2e8f0', marginRight: 10 },
  rosterName: { fontWeight: '800', color: '#0f172a' },
  rosterMeta: { marginTop: 4, color: '#64748b', fontSize: 12 },
  profileHeader: { flexDirection: 'row', alignItems: 'center' },
  profileAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#e2e8f0' },
  profileName: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  profileMeta: { marginTop: 6, color: '#64748b' },
  tabContent: { marginTop: 8, borderRadius: 16, backgroundColor: '#f8fafc', padding: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 8, marginTop: 8 },
  detailText: { color: '#475569', lineHeight: 20, marginBottom: 6 },
  actionStrip: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14 },
  primaryButton: { borderRadius: 12, backgroundColor: '#2563eb', paddingVertical: 12, paddingHorizontal: 14, marginRight: 10, marginBottom: 10 },
  primaryButtonText: { color: '#ffffff', fontWeight: '800' },
  secondaryButton: { borderRadius: 12, backgroundColor: '#e2e8f0', paddingVertical: 12, paddingHorizontal: 14, marginRight: 10, marginBottom: 10 },
  secondaryButtonText: { color: '#0f172a', fontWeight: '800' },
  empty: { color: '#64748b' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.42)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalCard: { width: '100%', maxWidth: 520, borderRadius: 20, backgroundColor: '#ffffff', padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  modalBody: { marginTop: 8, color: '#475569', lineHeight: 20 },
  fieldLabel: { marginTop: 12, color: '#0f172a', fontWeight: '700' },
  modalActions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 18 },
});
