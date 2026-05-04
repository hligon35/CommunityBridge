import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { useAuth } from '../AuthContext';
import { useData } from '../DataContext';
import { useTenant } from '../core/tenant/TenantContext';
import { ADMIN_SECTION_KEYS, canAccessAdminSection, canAccessAdminWorkspace, isBcbaRole, isStaffRole } from '../core/tenant/models';
import { isChildLinkedToTherapist } from '../features/sessionTracking/utils/dashboardSessionTarget';
import useIsTabletLayout from '../hooks/useIsTabletLayout';
import { navigationRef } from '../navigationRef';
import { THERAPY_ROLE_LABELS, getWorkspaceLabel } from '../utils/roleTerminology';
import LogoTitle from './LogoTitle';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const checkUpdatesIcon = require('../../assets/icons/checkUpdates.png');

function openTarget(target) {
  if (!navigationRef?.isReady?.()) return;
  if (!target?.root) return;
  if (target.screen) {
    navigationRef.navigate('Main', {
      screen: target.root,
      params: {
        screen: target.screen,
        ...(target.params ? { params: target.params } : {}),
      },
    });
    return;
  }
  navigationRef.navigate('Main', { screen: target.root, ...(target.params ? { params: target.params } : {}) });
}

export default function TabletNavigationShell({ currentRoute, children }) {
  const isTabletLayout = useIsTabletLayout();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { children: directoryChildren = [] } = useData();
  const tenant = useTenant();
  const labels = tenant?.labels || {};
  const [collapsed, setCollapsed] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [quickLogType, setQuickLogType] = useState('');
  const [quickLogValue, setQuickLogValue] = useState('');
  const [updateBusy, setUpdateBusy] = useState(false);
  const isStaff = isStaffRole(user?.role);
  const showAdminWorkspace = canAccessAdminWorkspace(user?.role);
  const isParentWorkspace = !showAdminWorkspace && !isStaff;
  const workspaceLabel = getWorkspaceLabel(user?.role);
  const greeting = String(user?.name || user?.firstName || '').trim() || (showAdminWorkspace ? 'Welcome back' : 'Hello');
  const showQuickAdd = !showAdminWorkspace && isStaff;
  const showBcbaQuickActions = showAdminWorkspace && isBcbaRole(user?.role);
  const showHeaderQuickMenu = showQuickAdd || showBcbaQuickActions;
  const activeRouteParams = navigationRef?.getCurrentRoute?.()?.params || null;
  const activeRouteChildId = String(activeRouteParams?.childId || '').trim();

  useEffect(() => {
    setQuickMenuOpen(false);
  }, [currentRoute]);

  useEffect(() => {
    if (showHeaderQuickMenu) return;
    setQuickMenuOpen(false);
    setQuickLogType('');
    setQuickLogValue('');
  }, [showHeaderQuickMenu]);

  const linkedTherapistChildren = useMemo(() => {
    const therapistId = String(user?.id || '').trim();
    if (!showQuickAdd || !therapistId) return [];
    return (Array.isArray(directoryChildren) ? directoryChildren : []).filter((child) => isChildLinkedToTherapist(child, therapistId));
  }, [directoryChildren, showQuickAdd, user?.id]);

  const activeQuickChild = useMemo(() => {
    if (!linkedTherapistChildren.length) return null;
    return linkedTherapistChildren.find((child) => String(child?.id || '').trim() === activeRouteChildId) || linkedTherapistChildren[0] || null;
  }, [activeRouteChildId, linkedTherapistChildren]);

  const quickMenuWidth = useMemo(() => {
    const drawerWidth = collapsed ? 92 : 280;
    const availableWidth = Math.max(176, width - drawerWidth - 120);
    return Math.max(176, Math.min(220, availableWidth));
  }, [collapsed, width]);

  const quickHeaderMenuItems = useMemo(() => {
    if (showBcbaQuickActions) {
      return [
        { key: 'program', label: 'Add Program', target: { root: 'Controls', screen: 'ProgramDirectory', params: { focusMode: 'editor' } } },
        { key: 'documentation', label: 'Documentation', target: { root: 'Controls', screen: 'TherapistDocumentationDashboard' } },
        { key: 'insights', label: 'Org Insights', target: { root: 'Controls', screen: 'OrganizationInsightsDashboard' } },
      ];
    }
    if (showQuickAdd) {
      return [
        { key: 'quick-note', label: 'Quick Note', quickLogType: 'Quick Note' },
        { key: 'incident', label: 'Incident', quickLogType: 'Incident' },
        { key: 'unexpected-data', label: 'Unexpected Data', quickLogType: 'Unexpected Data' },
      ];
    }
    return [];
  }, [showBcbaQuickActions, showQuickAdd]);

  function submitQuickLog() {
    if (!quickLogType || !quickLogValue.trim()) {
      Alert.alert('Missing details', 'Choose a log type and enter a short note.');
      return;
    }
    Alert.alert('Logged', `${quickLogType} saved for ${activeQuickChild?.name || 'the selected learner'}.`);
    setQuickLogValue('');
    setQuickLogType('');
  }

  async function checkForOtaUpdate() {
    if (Platform.OS === 'web') {
      Alert.alert('Not supported', 'EAS Update is not supported on web.');
      return;
    }
    if (!Updates.isEnabled) {
      Alert.alert(
        'Updates disabled',
        'This build does not have expo-updates enabled, or you are running a dev session. Install an EAS-built binary to receive OTA updates.'
      );
      return;
    }

    try {
      setUpdateBusy(true);
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        Alert.alert('Up to date', 'No update is available for this channel/runtime version.');
        return;
      }

      await Updates.fetchUpdateAsync();
      Alert.alert(
        'Update downloaded',
        'Restart the app to apply it now.',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Restart now', onPress: () => Updates.reloadAsync().catch(() => {}) },
        ]
      );
    } catch (error) {
      Alert.alert('Update check failed', error?.message || String(error));
    } finally {
      setUpdateBusy(false);
    }
  }

  const navGroups = useMemo(() => {
    if (showAdminWorkspace) {
      return [
        {
          label: 'Admin',
          items: [
            { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', target: { root: 'Controls', screen: 'ControlsMain' } },
            { key: 'students', label: 'Students', icon: 'school', target: { root: 'Controls', screen: 'StudentDirectory' }, section: ADMIN_SECTION_KEYS.STUDENTS },
            { key: 'staff', label: 'Staff', icon: 'groups', target: { root: 'Controls', screen: 'FacultyDirectory' }, section: ADMIN_SECTION_KEYS.STAFF },
            { key: 'scheduling', label: 'Scheduling', icon: 'event', target: { root: 'Controls', screen: 'ScheduleCalendar' }, section: ADMIN_SECTION_KEYS.SCHEDULING },
            { key: 'programs', label: 'Programs & Goals', icon: 'assignment', target: { root: 'Controls', screen: 'ProgramDirectory' }, section: ADMIN_SECTION_KEYS.PROGRAMS_GOALS },
            { key: 'reports', label: 'Data & Reports', icon: 'query-stats', target: { root: 'Controls', screen: 'Reports' }, section: ADMIN_SECTION_KEYS.DATA_REPORTS },
            { key: 'billing', label: 'Billing & Authorizations', icon: 'receipt-long', target: { root: 'Controls', screen: 'InsuranceBilling' }, section: ADMIN_SECTION_KEYS.BILLING_AUTHORIZATIONS },
            { key: 'compliance', label: 'Compliance', icon: 'verified-user', target: { root: 'Controls', screen: 'AdminAlerts' }, section: ADMIN_SECTION_KEYS.COMPLIANCE },
            { key: 'communication', label: 'Communication', icon: 'forum', target: { root: 'Controls', screen: 'AdminChatMonitor' }, section: ADMIN_SECTION_KEYS.COMMUNICATION },
            { key: 'settings', label: 'Settings', icon: 'settings', target: { root: 'Controls', screen: 'AdminSettings' }, section: ADMIN_SECTION_KEYS.SETTINGS },
          ].filter((item) => !item.section || canAccessAdminSection(user?.role, item.section)),
        },
      ];
    }

    if (isParentWorkspace) {
      return [{
        label: workspaceLabel,
        items: [
          { key: 'dashboard', label: labels.dashboard || 'Dashboard', icon: 'dashboard', target: { root: 'Home', screen: 'CommunityMain' } },
          { key: 'messages', label: 'Chats', icon: 'chat', target: { root: 'Chats', screen: 'ChatsList' } },
          { key: 'my-child', label: 'My Child', icon: 'child-care', target: { root: 'MyChild', screen: 'MyChildMain' } },
          { key: 'settings', label: 'Settings', icon: 'settings', target: { root: 'Settings', screen: 'SettingsMain' } },
        ],
      }];
    }

    const therapistItems = [
      { key: 'dashboard', label: labels.dashboard || 'Dashboard', icon: 'dashboard', target: { root: 'Home', screen: 'CommunityMain' } },
      { key: 'tap-tracker', label: 'Tap Tracker', icon: 'touch-app', target: { root: 'Home', screen: 'TapTracker', params: { sessionPreview: true } } },
      { key: 'tap-logs', label: 'Tap Logs', icon: 'format-list-bulleted', target: { root: 'Home', screen: 'TapLogs', params: { sessionPreview: true } } },
      { key: 'session-report', label: 'Session Report', icon: 'fact-check', target: { root: 'Home', screen: 'SummaryReview', params: { sessionPreview: true } } },
      { key: 'schedule', label: 'Schedule', icon: 'event', target: { root: 'Home', screen: 'ScheduleCalendar' } },
      { key: 'messages', label: 'Messages', icon: 'chat', target: { root: 'Chats', screen: 'ChatsList' } },
      { key: 'settings', label: 'Settings', icon: 'settings', target: { root: 'Settings', screen: 'SettingsMain' } },
    ];

    return [{ label: workspaceLabel, items: therapistItems }];
  }, [isParentWorkspace, isStaff, labels.dashboard, showAdminWorkspace, user?.role, workspaceLabel]);

  if (!isTabletLayout) return children;

  return (
    <View style={styles.shellFrame}>
      {Platform.OS !== 'web' && insets.top > 0 ? <View style={{ height: insets.top, backgroundColor: '#e2e8f0' }} /> : null}
      <View style={styles.shell}>
        <View style={[styles.drawer, { paddingTop: 20, paddingBottom: 20 + Math.max(insets.bottom, 0) }, collapsed ? styles.drawerCollapsed : null]}>
          {Platform.OS !== 'web' ? (
            <TouchableOpacity style={styles.drawerToggle} onPress={() => setCollapsed((value) => !value)}>
              <MaterialIcons name={collapsed ? 'menu' : 'menu-open'} size={22} color="#e2e8f0" />
              {!collapsed ? <Text style={styles.drawerToggleText}>Collapse</Text> : null}
            </TouchableOpacity>
          ) : null}

          {navGroups.map((group) => (
            <View key={group.label} style={styles.group}>
              {!collapsed ? <Text style={styles.groupLabel}>{group.label}</Text> : null}
              {group.items.map((item) => {
                const active = currentRoute === (item.target.screen || item.target.root);
                return (
                  <TouchableOpacity key={item.key} style={[styles.navItem, active ? styles.navItemActive : null]} onPress={() => openTarget(item.target)}>
                    <MaterialIcons name={item.icon} size={20} color={active ? '#0f172a' : '#cbd5e1'} />
                    {!collapsed ? <Text style={[styles.navLabel, active ? styles.navLabelActive : null]}>{item.label}</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          <TouchableOpacity style={[styles.drawerUtilityButton, updateBusy ? styles.drawerUtilityButtonDisabled : null]} onPress={checkForOtaUpdate} disabled={updateBusy}>
            <Image source={checkUpdatesIcon} style={[styles.drawerUtilityIcon, updateBusy ? styles.drawerUtilityIconDisabled : null]} resizeMode="contain" />
            {!collapsed ? <Text style={styles.drawerUtilityText}>{updateBusy ? 'Checking…' : 'Check for updates'}</Text> : null}
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={() => logout?.()}>
            <MaterialIcons name="logout" size={20} color="#fecaca" />
            {!collapsed ? <Text style={styles.logoutText}>Logout</Text> : null}
          </TouchableOpacity>
        </View>

        <View style={[styles.contentWrap, { paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) }]}>
          {showHeaderQuickMenu && quickMenuOpen ? <TouchableOpacity style={styles.quickMenuDismissLayer} activeOpacity={1} onPress={() => setQuickMenuOpen(false)} /> : null}
          <View style={styles.topBar}>
            <View style={styles.brandRow}>
              <LogoTitle width={150} height={48} />
              {!collapsed ? (
                <View style={styles.greetingWrap}>
                  <Text style={styles.topEyebrow}>{workspaceLabel}</Text>
                  <Text style={styles.topTitle}>Hello, {greeting}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.headerActions}>
              {showHeaderQuickMenu ? (
                <View style={styles.quickAddAnchor}>
                  <TouchableOpacity style={[styles.iconOnlyButton, styles.quickAddButton, quickMenuOpen ? styles.iconOnlyButtonActive : null]} onPress={() => setQuickMenuOpen((value) => !value)} accessibilityLabel={showBcbaQuickActions ? 'Quick actions' : 'Quick add'}>
                    <MaterialIcons name="add" size={20} color="#1d4ed8" />
                  </TouchableOpacity>
                  {quickMenuOpen ? (
                    <View style={[styles.quickHeaderMenu, { width: quickMenuWidth }]}>
                      {quickHeaderMenuItems.map((item) => (
                        <TouchableOpacity
                          key={item.key}
                          style={styles.quickHeaderMenuItem}
                          onPress={() => {
                            setQuickMenuOpen(false);
                            if (item.target) {
                              openTarget(item.target);
                              return;
                            }
                            setQuickLogType(item.quickLogType || '');
                          }}
                        >
                          <Text style={styles.quickHeaderMenuText}>{item.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
              <TouchableOpacity style={styles.iconOnlyButton} onPress={() => openTarget({ root: 'Settings', screen: 'Help' })}>
                <MaterialIcons name="help-outline" size={20} color="#1d4ed8" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.screenWrap}>{children}</View>
        </View>
      </View>
      <Modal transparent visible={!!quickLogType} animationType="fade" onRequestClose={() => setQuickLogType('')}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{quickLogType}</Text>
            <Text style={styles.modalSubtitle}>{activeQuickChild?.name ? `Logging for ${activeQuickChild.name}` : 'Logging for your current learner'}</Text>
            <TextInput value={quickLogValue} onChangeText={setQuickLogValue} placeholder="Enter a short note" multiline style={styles.modalInput} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalSecondaryBtn} onPress={() => { setQuickLogType(''); setQuickLogValue(''); }}>
                <Text style={styles.modalSecondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalPrimaryBtn} onPress={submitQuickLog}>
                <Text style={styles.modalPrimaryBtnText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  shellFrame: { flex: 1, backgroundColor: '#e2e8f0' },
  shell: { flex: 1, flexDirection: 'row', backgroundColor: '#e2e8f0' },
  drawer: { width: 280, backgroundColor: '#0f172a', paddingHorizontal: 16 },
  drawerCollapsed: { width: 92, paddingHorizontal: 10 },
  drawerToggle: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  drawerToggleText: { color: '#e2e8f0', fontWeight: '700', marginLeft: 10 },
  group: { marginBottom: 18 },
  groupLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 8 },
  navItem: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 6 },
  navItemActive: { backgroundColor: '#e0f2fe' },
  navLabel: { color: '#e2e8f0', fontWeight: '700', marginLeft: 10 },
  navLabelActive: { color: '#0f172a' },
  drawerUtilityButton: { marginTop: 'auto', flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#1e293b', marginBottom: 8 },
  drawerUtilityButtonDisabled: { opacity: 0.72 },
  drawerUtilityIcon: { width: 20, height: 20 },
  drawerUtilityIconDisabled: { opacity: 0.5 },
  drawerUtilityText: { color: '#e2e8f0', fontWeight: '700', marginLeft: 10 },
  logoutButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#1e293b' },
  logoutText: { color: '#fecaca', fontWeight: '700', marginLeft: 10 },
  contentWrap: { flex: 1, paddingHorizontal: 12, position: 'relative' },
  quickMenuDismissLayer: { ...StyleSheet.absoluteFillObject, zIndex: 20 },
  topBar: { minHeight: 70, borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 18, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, zIndex: 30 },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  greetingWrap: { marginLeft: 14 },
  topEyebrow: { color: '#2563eb', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  topTitle: { marginTop: 4, fontSize: 20, fontWeight: '800', color: '#0f172a' },
  headerActions: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' },
  quickAddAnchor: { position: 'relative', marginLeft: 10 },
  iconOnlyButton: { width: 40, height: 40, borderRadius: 20, marginLeft: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff' },
  quickAddButton: { marginLeft: 0 },
  iconOnlyButtonActive: { backgroundColor: '#dbeafe' },
  quickHeaderMenu: { position: 'absolute', top: 44, right: 0, borderRadius: 14, borderWidth: 1, borderColor: '#dbe4f0', backgroundColor: '#ffffff', paddingVertical: 8, shadowColor: '#0f172a', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  quickHeaderMenuItem: { paddingVertical: 10, paddingHorizontal: 14 },
  quickHeaderMenuText: { color: '#0f172a', fontWeight: '700' },
  screenWrap: { flex: 1, borderRadius: 24, overflow: 'hidden', backgroundColor: '#f8fafc' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 24 },
  modalCard: { borderRadius: 20, backgroundColor: '#ffffff', padding: 18 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  modalSubtitle: { marginTop: 6, color: '#64748b' },
  modalInput: { marginTop: 14, minHeight: 120, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 },
  modalSecondaryBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#e2e8f0', marginRight: 8 },
  modalSecondaryBtnText: { color: '#0f172a', fontWeight: '700' },
  modalPrimaryBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#2563eb' },
  modalPrimaryBtnText: { color: '#ffffff', fontWeight: '700' },
});