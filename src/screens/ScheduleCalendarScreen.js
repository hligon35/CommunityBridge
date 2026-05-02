import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../AuthContext';
import { useData } from '../DataContext';
import { isBcbaRole, isOfficeAdminRole } from '../core/tenant/models';
import { THERAPY_ROLE_LABELS } from '../utils/roleTerminology';
import { childHasParent, findLinkedParentId } from '../utils/directoryLinking';
const { isChildLinkedToTherapist } = require('../features/sessionTracking/utils/dashboardSessionTarget');

function todayStamp(hours = 9, minutes = 0) {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function buildSessionCards(children = []) {
  return (children || []).slice(0, 10).map((child, index) => {
    const therapist = child?.session === 'PM' ? child?.pmTherapist : child?.amTherapist || child?.pmTherapist || child?.bcaTherapist;
    const staffName = typeof therapist === 'string' ? therapist : therapist?.name || child?.bcaTherapist?.name || 'Unassigned';
    const start = child?.dropoffTimeISO ? new Date(child.dropoffTimeISO) : todayStamp(8 + index, 0);
    const end = child?.pickupTimeISO ? new Date(child.pickupTimeISO) : todayStamp(9 + index, 0);
    return {
      id: child?.id || `session-${index}`,
      student: child?.name || 'Student',
      staff: staffName,
      location: child?.room || 'Room TBD',
      status: index % 4 === 0 ? 'canceled' : index % 3 === 0 ? 'completed' : 'scheduled',
      start,
      end,
    };
  });
}

export default function ScheduleCalendarScreen() {
  const { user } = useAuth();
  const { children = [], parents = [] } = useData();
  const role = String(user?.role || '').trim().toLowerCase();
  const isBcba = isBcbaRole(user?.role);
  const isTherapist = role === 'therapist';
  const isParent = role.includes('parent');
  const isOffice = isOfficeAdminRole(user?.role);
  const [viewMode, setViewMode] = useState('day');
  const [focusMode, setFocusMode] = useState('staff');
  const linkedParentId = isParent ? (findLinkedParentId(user, parents) || user?.id || null) : null;

  const filteredChildren = useMemo(() => {
    if (!isTherapist) return children;
    const therapistId = user?.id;
    const normalizedName = String(user?.name || user?.displayName || user?.email || '').trim().toLowerCase();
    return (children || []).filter((child) => {
      if (isChildLinkedToTherapist(child, therapistId)) return true;
      const assignments = [child?.amTherapist, child?.pmTherapist, child?.bcaTherapist]
        .map((entry) => (typeof entry === 'string' ? entry : entry?.name || entry?.email || ''))
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean);
      return normalizedName ? assignments.includes(normalizedName) : false;
    });
  }, [children, isTherapist, user?.displayName, user?.email, user?.id, user?.name]);

  const parentChildren = useMemo(() => {
    if (!isParent) return [];
    if (!linkedParentId) return [];
    return (Array.isArray(children) ? children : []).filter((child) => childHasParent(child, linkedParentId));
  }, [children, isParent, linkedParentId]);

  const visibleChildren = isParent ? parentChildren : filteredChildren;

  const sessions = useMemo(() => buildSessionCards(visibleChildren), [visibleChildren]);
  const grouped = useMemo(() => {
    const groups = new Map();
    sessions.forEach((session) => {
      const key = isTherapist
        ? viewMode.toUpperCase()
        : (isParent ? 'Upcoming sessions' : (focusMode === 'student' ? session.student : focusMode === 'room' ? session.location : session.staff));
      const next = groups.get(key) || [];
      next.push(session);
      groups.set(key, next);
    });
    return Array.from(groups.entries()).map(([key, value]) => ({ key, value }));
  }, [focusMode, isParent, isTherapist, sessions, viewMode]);

  function action(title, message) {
    Alert.alert(title, message);
  }

  return (
    <ScreenWrapper style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Scheduling</Text>
          <Text style={styles.title}>{isTherapist ? 'Your work schedule' : (isParent ? 'Family calendar' : 'Master scheduling for students, staff, and rooms')}</Text>
          <Text style={styles.subtitle}>{isTherapist ? `This view only shows sessions assigned to your ${THERAPY_ROLE_LABELS.therapist.toLowerCase()} profile.` : (isParent ? 'Review upcoming sessions for children linked to your family account.' : 'Switch between day, week, and month context while reviewing session cards by staff, student, or room.')}</Text>
        </View>

        <View style={styles.controlsCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRowSingleLine}>
            {['day', 'week', 'month'].map((mode) => (
              <TouchableOpacity key={mode} style={[styles.chip, viewMode === mode ? styles.chipActive : null]} onPress={() => setViewMode(mode)}>
                <Text style={[styles.chipText, viewMode === mode ? styles.chipTextActive : null]}>{mode.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
            {!isTherapist && !isParent ? ['staff', 'student', 'room'].map((mode) => (
              <TouchableOpacity key={mode} style={[styles.chip, focusMode === mode ? styles.chipActive : null]} onPress={() => setFocusMode(mode)}>
                <Text style={[styles.chipText, focusMode === mode ? styles.chipTextActive : null]}>{mode === 'room' ? 'Room view' : `${mode.charAt(0).toUpperCase()}${mode.slice(1)} view`}</Text>
              </TouchableOpacity>
            )) : null}
          </ScrollView>
        </View>

        {!isTherapist && !isParent ? <View style={styles.actionRow}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => action('Add session', 'Session creation can be completed from this scheduling hub.')}>
            <Text style={styles.primaryButtonText}>Add Session</Text>
          </TouchableOpacity>
          {isOffice ? <TouchableOpacity style={styles.secondaryButton} onPress={() => action('Edit session', 'Office edit controls are available from the selected session cards.')}><Text style={styles.secondaryButtonText}>Edit Session</Text></TouchableOpacity> : null}
          {isOffice ? <TouchableOpacity style={styles.secondaryButton} onPress={() => action('Approve changes', 'Office approval routing for scheduling changes is staged here.')}><Text style={styles.secondaryButtonText}>Approve Changes</Text></TouchableOpacity> : null}
          {isBcba ? <TouchableOpacity style={styles.secondaryButton} onPress={() => action(`Assign ${THERAPY_ROLE_LABELS.therapist.toLowerCase()}`, `BCBA assignment controls are staged from the session cards in this hub.`)}><Text style={styles.secondaryButtonText}>{`Assign ${THERAPY_ROLE_LABELS.therapist}`}</Text></TouchableOpacity> : null}
        </View> : null}

        {grouped.map((group) => (
          <View key={group.key} style={styles.groupCard}>
            <Text style={styles.groupTitle}>{isTherapist ? 'Assigned sessions' : group.key}</Text>
            <Text style={styles.groupSubtitle}>{viewMode.toUpperCase()} view • {group.value.length} session{group.value.length === 1 ? '' : 's'}</Text>
            {group.value.map((session) => (
              <View key={session.id} style={styles.sessionCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sessionTitle}>{session.student}</Text>
                  <Text style={styles.sessionMeta}>{isParent ? `${THERAPY_ROLE_LABELS.therapist}: ${session.staff}` : `Staff: ${session.staff}`}</Text>
                  <Text style={styles.sessionMeta}>Location: {session.location}</Text>
                  <Text style={styles.sessionMeta}>Time: {session.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - {session.end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
                </View>
                <View style={[styles.statusPill, session.status === 'canceled' ? styles.statusCanceled : session.status === 'completed' ? styles.statusCompleted : styles.statusScheduled]}>
                  <Text style={[styles.statusText, session.status === 'canceled' ? styles.statusTextCanceled : session.status === 'completed' ? styles.statusTextCompleted : styles.statusTextScheduled]}>{session.status.toUpperCase()}</Text>
                </View>
              </View>
            ))}
          </View>
        ))}
        {!grouped.length ? <View style={styles.groupCard}><Text style={styles.groupTitle}>{isParent ? 'Family calendar' : 'Assigned sessions'}</Text><Text style={styles.groupSubtitle}>{isParent ? 'No upcoming sessions are linked to your family account right now.' : `No sessions are assigned to your ${THERAPY_ROLE_LABELS.therapist.toLowerCase()} profile right now.`}</Text></View> : null}
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16 },
  hero: { borderRadius: 22, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', padding: 18 },
  eyebrow: { color: '#1d4ed8', fontWeight: '800', fontSize: 12, textTransform: 'uppercase' },
  title: { marginTop: 6, fontSize: 24, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 8, color: '#475569', lineHeight: 20 },
  controlsCard: { marginTop: 14, borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', padding: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  chipRowSingleLine: { flexDirection: 'row', flexWrap: 'nowrap', paddingRight: 8 },
  chip: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#f1f5f9', marginRight: 8, marginBottom: 8 },
  chipActive: { backgroundColor: '#2563eb' },
  chipText: { color: '#0f172a', fontWeight: '700' },
  chipTextActive: { color: '#ffffff' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  primaryButton: { borderRadius: 12, backgroundColor: '#2563eb', paddingVertical: 12, paddingHorizontal: 14, marginRight: 10, marginBottom: 10 },
  primaryButtonText: { color: '#ffffff', fontWeight: '800' },
  secondaryButton: { borderRadius: 12, backgroundColor: '#e2e8f0', paddingVertical: 12, paddingHorizontal: 14, marginRight: 10, marginBottom: 10 },
  secondaryButtonText: { color: '#0f172a', fontWeight: '800' },
  groupCard: { marginTop: 12, borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', padding: 16 },
  groupTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  groupSubtitle: { marginTop: 4, color: '#64748b' },
  sessionCard: { marginTop: 12, borderRadius: 16, backgroundColor: '#f8fafc', padding: 14, flexDirection: 'row', alignItems: 'center' },
  sessionTitle: { fontWeight: '800', color: '#0f172a' },
  sessionMeta: { marginTop: 4, color: '#475569' },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusScheduled: { backgroundColor: '#dbeafe' },
  statusCompleted: { backgroundColor: '#dcfce7' },
  statusCanceled: { backgroundColor: '#fee2e2' },
  statusText: { fontWeight: '800', fontSize: 11 },
  statusTextScheduled: { color: '#1d4ed8' },
  statusTextCompleted: { color: '#166534' },
  statusTextCanceled: { color: '#b91c1c' },
});
