import React, { useMemo } from 'react';
import { Alert, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenWrapper } from '../components/ScreenWrapper';
import TenantSwitcher from '../components/TenantSwitcher';
import { useAuth } from '../AuthContext';
import { useData } from '../DataContext';
import { useTenant } from '../core/tenant/TenantContext';

const moodGoodIcon = require('../../assets/icons/good.png');
const moodModerateIcon = require('../../assets/icons/moderate.png');
const moodBadIcon = require('../../assets/icons/bad.png');
const defaultSonIcon = require('../../assets/icons/defaultSon.png');
const defaultDaughterIcon = require('../../assets/icons/defaultDaughter.png');
const nextSessionIcon = require('../../assets/icons/nextSession.png');
const progressReportIcon = require('../../assets/icons/progressReport.png');
const itemsNeededIcon = require('../../assets/icons/itemsNeeded.png');
const careTeamIcon = require('../../assets/icons/careTeam.png');
const insuranceBillingIcon = require('../../assets/icons/insuranceBilling.png');
const parentResourcesIcon = require('../../assets/icons/parentResources.png');

function formatSessionLabel(dateValue) {
  if (!dateValue) return 'No session scheduled';
  const ts = Date.parse(String(dateValue));
  if (!Number.isFinite(ts)) return 'No session scheduled';
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function findRelevantChildren(role, userId, children) {
  const allChildren = Array.isArray(children) ? children : [];
  if (!userId) return [];
  if (role === 'therapist') {
    return allChildren.filter((child) => {
      const assigned = [child?.amTherapist, child?.pmTherapist, child?.bcaTherapist];
      return assigned.some((entry) => {
        if (!entry) return false;
        if (typeof entry === 'string') return entry === userId;
        return entry?.id === userId;
      });
    });
  }
  return allChildren.filter((child) => Array.isArray(child?.parents) && child.parents.some((parent) => parent?.id === userId));
}

function childCarouselImageFor(child, index) {
  const hints = [
    child?.gender,
    child?.sex,
    child?.pronouns,
    child?.relation,
    child?.relationship,
    child?.label,
    child?.name,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase())
    .join(' ');

  if (/(girl|female|daughter|she|her)/.test(hints)) return defaultDaughterIcon;
  if (/(boy|male|son|he|him)/.test(hints)) return defaultSonIcon;
  return index % 2 === 0 ? defaultSonIcon : defaultDaughterIcon;
}

export default function RoleDashboardScreen({ navigation }) {
  const { user } = useAuth();
  const { children = [], therapists = [], urgentMemos = [] } = useData();
  const tenant = useTenant();
  const role = String(user?.role || 'parent').trim().toLowerCase();
  const isTherapist = role === 'therapist';
  const labels = tenant?.labels || {};
  const dashboardPreset = tenant?.dashboardPreset || {};
  const childProfileMode = tenant?.childProfileMode || {};
  const relevantChildren = useMemo(() => findRelevantChildren(role, user?.id, children), [children, role, user?.id]);
  const careTeamCount = useMemo(() => {
    if (isTherapist) return Math.max(1, relevantChildren.length);
    const teamIds = new Set();
    relevantChildren.forEach((child) => {
      [child?.amTherapist, child?.pmTherapist, child?.bcaTherapist].forEach((entry) => {
        if (!entry) return;
        if (typeof entry === 'string') teamIds.add(entry);
        else if (entry?.id) teamIds.add(entry.id);
      });
    });
    return teamIds.size;
  }, [isTherapist, relevantChildren]);

  const nextSession = useMemo(() => {
    const timestamps = [];
    relevantChildren.forEach((child) => {
      [child?.dropoffTimeISO, child?.pickupTimeISO].forEach((value) => {
        const ts = Date.parse(String(value || ''));
        if (Number.isFinite(ts) && ts >= Date.now()) timestamps.push(ts);
      });
    });
    timestamps.sort((left, right) => left - right);
    return timestamps.length ? formatSessionLabel(timestamps[0]) : 'No session scheduled';
  }, [relevantChildren]);

  const pendingItems = useMemo(() => {
    if (isTherapist) {
      return (urgentMemos || []).filter((memo) => !memo?.status || memo.status === 'pending').length;
    }
    return (urgentMemos || []).filter((memo) => memo?.proposerId === user?.id && (!memo?.status || memo.status === 'pending')).length;
  }, [isTherapist, urgentMemos, user?.id]);

  const moodSummary = useMemo(() => {
    const scores = relevantChildren
      .map((child) => Number(child?.moodScore ?? child?.mood))
      .filter((value) => Number.isFinite(value));

    if (!scores.length) {
      return {
        value: 'Not logged',
        hint: 'Mood tracking is temporarily unavailable.',
        imageSource: moodGoodIcon,
      };
    }

    const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
    if (average <= 5) {
      return {
        value: `${Math.round(average)} / 15`,
        hint: 'Mood check-in is trending low.',
        imageSource: moodBadIcon,
      };
    }
    if (average <= 10) {
      return {
        value: `${Math.round(average)} / 15`,
        hint: 'Mood check-in is steady.',
        imageSource: moodModerateIcon,
      };
    }
    return {
      value: `${Math.round(average)} / 15`,
      hint: 'Mood check-in is trending positive.',
      imageSource: moodGoodIcon,
    };
  }, [relevantChildren]);

  const cardDefinitions = {
    'next-session': {
      key: 'next-session',
      title: 'Next Session',
      value: nextSession,
      hint: isTherapist ? 'Based on your assigned learners.' : 'Based on your family schedule.',
      imageSource: nextSessionIcon,
      onPress: () => navigation.getParent()?.navigate(isTherapist ? 'MyClass' : 'MyChild'),
    },
    'mood-score': {
      key: 'mood-score',
      title: 'Mood Score',
      value: moodSummary.value,
      hint: moodSummary.hint,
      imageSource: moodSummary.imageSource,
    },
    'progress-report': {
      key: 'progress-report',
      title: 'Progress Report',
      value: `${relevantChildren.length}`,
      hint: isTherapist ? 'Active learners assigned to you.' : 'Children linked to your account.',
      imageSource: progressReportIcon,
      onPress: () => navigation.getParent()?.navigate(isTherapist ? 'MyClass' : 'MyChild'),
    },
    'items-needed': {
      key: 'items-needed',
      title: 'Items Needed',
      value: pendingItems ? `${pendingItems} pending` : 'None right now',
      hint: 'Check with your center for updates.',
      imageSource: itemsNeededIcon,
    },
    'care-team': {
      key: 'care-team',
      title: labels.careTeam || 'My Care Team',
      value: careTeamCount ? `${careTeamCount} members` : 'No team assigned',
      hint: isTherapist ? 'Your assigned caseload.' : 'Therapists connected to your family.',
      imageSource: careTeamIcon,
      onPress: () => navigation.getParent()?.navigate(isTherapist ? 'MyClass' : 'MyChild'),
    },
    billing: {
      key: 'billing',
      title: 'Billing',
      value: 'Office managed',
      hint: 'Billing tools are offline in the app for now.',
      imageSource: insuranceBillingIcon,
      onPress: () => Alert.alert('Billing', 'Billing is currently handled outside the app.'),
    },
    resources: {
      key: 'resources',
      title: labels.resources || 'Parent Resources',
      value: isTherapist ? (labels.resourcesValueStaff || 'Staff resources') : (labels.resourcesValueFamily || 'Help & support'),
      hint: 'Open guidance, support, and reference details.',
      imageSource: parentResourcesIcon,
      onPress: () => navigation.getParent()?.navigate('Settings', { screen: 'Help' }),
      fullWidth: true,
    },
  };
  const activePreset = isTherapist ? dashboardPreset.staff : dashboardPreset.family;
  const presetKeys = Array.isArray(activePreset) && activePreset.length
    ? activePreset
    : ['next-session', 'mood-score', 'progress-report', 'items-needed', 'care-team', 'billing', 'resources'];
  const featureFlags = tenant?.featureFlags || {};
  const cardFlagGates = {
    billing: () => featureFlags.programBilling !== false,
  };
  const dashboardCards = presetKeys
    .map((key) => cardDefinitions[key])
    .filter((card) => {
      if (!card) return false;
      const gate = cardFlagGates[card.key];
      return gate ? gate() : true;
    });

  return (
    <ScreenWrapper bannerShowBack={false} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>{isTherapist ? (labels.staffDashboard || 'Therapist Dashboard') : (labels.dashboard || 'Dashboard')}</Text>
          <Text style={styles.heroTitle}>Community tools are paused for now.</Text>
          <Text style={styles.heroText}>Use this dashboard to jump into schedules, care-team information, billing context, and support resources while the wall is offline.</Text>
        </View>

        <TenantSwitcher />

        {!isTherapist && relevantChildren.length ? (
          <View style={styles.familyCarouselSection}>
            <Text style={styles.familyCarouselTitle}>{labels.familySection || 'Your Family'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.familyCarouselTrack}>
              {relevantChildren.map((child, index) => (
                <TouchableOpacity
                  key={child?.id || `${child?.name || 'child'}-${index}`}
                  style={styles.familyCard}
                  activeOpacity={0.88}
                  onPress={() => navigation.getParent()?.navigate('MyChild')}
                >
                  <Image source={childCarouselImageFor(child, index)} style={styles.familyCardImage} resizeMode="contain" />
                  <Text style={styles.familyCardName} numberOfLines={1}>{child?.name || 'Child'}</Text>
                  <Text style={styles.familyCardMeta} numberOfLines={1}>{child?.room || child?.age || childProfileMode.entityLabel || 'Family member'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.grid}>
          {dashboardCards.map((card) => {
            const cardContent = (
              <>
                <View style={styles.cardIconRow}>
                  {card.imageSource ? (
                    <Image source={card.imageSource} style={styles.cardImageIcon} resizeMode="contain" />
                  ) : (
                    <MaterialIcons name={card.icon} size={24} color="#2563eb" />
                  )}
                </View>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardValue}>{card.value}</Text>
                <Text style={styles.cardHint}>{card.hint}</Text>
              </>
            );

            if (card.onPress) {
              return (
                <TouchableOpacity key={card.key} style={[styles.card, card.fullWidth ? styles.cardFullWidth : null]} onPress={card.onPress} activeOpacity={0.88}>
                  {cardContent}
                </TouchableOpacity>
              );
            }

            return (
              <View key={card.key} style={[styles.card, card.fullWidth ? styles.cardFullWidth : null]}>
                {cardContent}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: Platform.OS === 'web' ? 32 : 120 },
  hero: { padding: 18, borderRadius: 18, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  heroEyebrow: { color: '#2563eb', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  heroTitle: { marginTop: 8, fontSize: 24, fontWeight: '800', color: '#0f172a' },
  heroText: { marginTop: 8, color: '#475569', lineHeight: 20 },
  familyCarouselSection: { marginTop: 14 },
  familyCarouselTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  familyCarouselTrack: { paddingRight: 8 },
  familyCard: {
    width: 144,
    marginRight: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  familyCardImage: { width: 74, height: 74 },
  familyCardName: { marginTop: 10, fontSize: 14, fontWeight: '800', color: '#0f172a' },
  familyCardMeta: { marginTop: 4, fontSize: 12, color: '#64748b' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 16 },
  card: { width: '48.2%', minHeight: 148, padding: 16, marginBottom: 12, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  cardFullWidth: { width: '100%' },
  cardIconRow: { width: 54, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff' },
  cardImageIcon: { width: 36, height: 36 },
  cardTitle: { marginTop: 12, fontSize: 14, fontWeight: '800', color: '#0f172a' },
  cardValue: { marginTop: 8, fontSize: 18, fontWeight: '800', color: '#111827' },
  cardHint: { marginTop: 8, color: '#64748b', lineHeight: 18 },
});