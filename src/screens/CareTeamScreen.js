import React, { useMemo } from 'react';
import { Alert, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../AuthContext';
import { useData } from '../DataContext';
import { avatarSourceFor } from '../utils/idVisibility';
import { maskEmailDisplay, maskPhoneDisplay } from '../utils/inputFormat';
import { THERAPY_ROLE_LABELS, getAssignmentRoleLabel, getDisplayRoleLabel } from '../utils/roleTerminology';

function getRelevantChildren(userId, children) {
  const all = Array.isArray(children) ? children : [];
  if (!userId) return [];
  return all.filter(
    (c) => Array.isArray(c?.parents) && c.parents.some((p) => p?.id === userId)
  );
}

function dedupeMembers(children) {
  const map = new Map();
  children.forEach((child) => {
    const childLabel = child?.name || child?.firstName || '';
    const slots = [
      { entry: child?.amTherapist, role: THERAPY_ROLE_LABELS.amTherapist },
      { entry: child?.pmTherapist, role: THERAPY_ROLE_LABELS.pmTherapist },
      { entry: child?.bcaTherapist, role: 'BCBA' },
    ];
    slots.forEach(({ entry, role }) => {
      if (!entry || typeof entry === 'string') return;
      const id = entry.id || entry.email || entry.name;
      if (!id) return;
      const existing = map.get(id);
      const roles = new Set(existing?.roles || []);
      roles.add(getAssignmentRoleLabel(entry.role || role));
      const childrenLabels = new Set(existing?.childrenLabels || []);
      if (childLabel) childrenLabels.add(childLabel);
      map.set(id, {
        id,
        name: entry.name || 'Care Team Member',
        avatar: entry.avatar || entry.photoURL,
        phone: entry.phone,
        email: entry.email,
        roles: Array.from(roles),
        childrenLabels: Array.from(childrenLabels),
        raw: entry,
      });
    });
  });
  return Array.from(map.values());
}

function ContactCard({ member }) {
  const phone = member.phone;
  const email = member.email;
  const onCall = () => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Unable to place call', 'Your device could not open the phone app.');
    });
  };
  const onEmail = () => {
    if (!email) return;
    Linking.openURL(`mailto:${email}`).catch(() => {
      Alert.alert('Unable to open email', 'Your device could not open the email app.');
    });
  };
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Image source={avatarSourceFor(member.raw)} style={styles.avatar} />
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={1}>{member.name}</Text>
          {member.roles.length ? (
            <Text style={styles.role} numberOfLines={1}>{member.roles.join(' • ')}</Text>
          ) : null}
          {member.childrenLabels.length ? (
            <Text style={styles.subtle} numberOfLines={1}>For {member.childrenLabels.join(', ')}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, !phone && styles.actionBtnDisabled]}
          onPress={onCall}
          disabled={!phone}
          accessibilityRole="button"
          accessibilityLabel={`Call ${member.name}`}
        >
          <MaterialIcons name="phone" size={20} color={phone ? '#1d4ed8' : '#9ca3af'} />
          <Text style={[styles.actionText, !phone && styles.actionTextDisabled]} numberOfLines={1}>
            {maskPhoneDisplay(phone) || 'No phone'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, !email && styles.actionBtnDisabled]}
          onPress={onEmail}
          disabled={!email}
          accessibilityRole="button"
          accessibilityLabel={`Email ${member.name}`}
        >
          <MaterialIcons name="email" size={20} color={email ? '#1d4ed8' : '#9ca3af'} />
          <Text style={[styles.actionText, !email && styles.actionTextDisabled]} numberOfLines={1}>
            {maskEmailDisplay(email) || 'No email'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function CareTeamScreen() {
  const route = useRoute();
  const { user } = useAuth();
  const { children = [] } = useData();
  const relevantChildren = useMemo(() => {
    const linkedChildren = getRelevantChildren(user?.id, children);
    const requestedChildId = route?.params?.childId;
    if (!requestedChildId) return linkedChildren;
    return linkedChildren.filter((child) => child?.id === requestedChildId);
  }, [children, route?.params?.childId, user?.id]);
  const members = useMemo(() => dedupeMembers(relevantChildren), [relevantChildren]);

  return (
    <ScreenWrapper bannerTitle="My Care Team" style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {members.length === 0 ? (
          <View style={styles.empty}>
            <MaterialIcons name="groups" size={36} color="#9ca3af" />
            <Text style={styles.emptyTitle}>No care team yet</Text>
            <Text style={styles.emptyText}>
              {THERAPY_ROLE_LABELS.therapists} and teachers connected to your child will appear here with their contact info.
            </Text>
          </View>
        ) : (
          members.map((m) => <ContactCard key={m.id} member={m} />)
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#f5f6f8' },
  content: { padding: 16, paddingBottom: 16 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e5e7eb',
    marginRight: 14,
  },
  headerText: {
    flex: 1,
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  role: {
    marginTop: 2,
    fontSize: 13,
    color: '#1d4ed8',
    fontWeight: '500',
  },
  subtle: {
    marginTop: 2,
    fontSize: 12,
    color: '#6b7280',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  actionBtnDisabled: {
    borderColor: '#e5e7eb',
    backgroundColor: '#f3f4f6',
  },
  actionText: {
    color: '#1d4ed8',
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
  actionTextDisabled: {
    color: '#9ca3af',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  emptyText: {
    marginTop: 6,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
});
