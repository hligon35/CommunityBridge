import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../AuthContext';
import { useTenant } from '../core/tenant/TenantContext';
import { isAdminRole, isStaffRole } from '../core/tenant/models';
import useIsTabletLayout from '../hooks/useIsTabletLayout';
import { navigationRef } from '../navigationRef';
import LogoTitle from './LogoTitle';

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
  const { user, logout } = useAuth();
  const tenant = useTenant();
  const labels = tenant?.labels || {};
  const [collapsed, setCollapsed] = useState(false);
  const isAdmin = isAdminRole(user?.role);
  const isStaff = isStaffRole(user?.role);
  const isBcbaWorkspace = String(user?.role || '').trim().toLowerCase() === 'bcba';
  const showAdminWorkspace = isAdmin || isBcbaWorkspace;
  const greeting = String(user?.name || user?.firstName || '').trim() || (showAdminWorkspace ? 'Welcome back' : 'Hello');

  const navGroups = useMemo(() => {
    if (showAdminWorkspace) {
      return [
        {
          label: 'Admin Path',
          items: [
            { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', target: { root: 'Controls', screen: 'ControlsMain' } },
            { key: 'students', label: 'Students', icon: 'school', target: { root: 'Controls', screen: 'StudentDirectory' } },
            { key: 'staff', label: 'Staff', icon: 'groups', target: { root: 'Controls', screen: 'FacultyDirectory' } },
            { key: 'scheduling', label: 'Scheduling', icon: 'event', target: { root: 'Controls', screen: 'ScheduleCalendar' } },
            ...(isBcbaWorkspace ? [{ key: 'programs', label: 'Programs & Goals', icon: 'assignment', target: { root: 'Controls', screen: 'ProgramDirectory' } }] : []),
            { key: 'reports', label: 'Data & Reports', icon: 'query-stats', target: { root: 'Controls', screen: 'Reports' } },
            { key: 'billing', label: 'Billing & Authorizations', icon: 'receipt-long', target: { root: 'Controls', screen: 'InsuranceBilling' } },
            { key: 'compliance', label: 'Compliance', icon: 'verified-user', target: { root: 'Controls', screen: 'AdminAlerts' } },
            { key: 'communication', label: 'Communication', icon: 'forum', target: { root: 'Controls', screen: 'AdminChatMonitor' } },
            { key: 'settings', label: 'Settings', icon: 'settings', target: { root: 'Settings', screen: 'SettingsMain' } },
          ],
        },
      ];
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

    return [{ label: isStaff ? 'Therapist Path' : 'Workspace', items: therapistItems }];
  }, [isBcbaWorkspace, isStaff, labels.dashboard, showAdminWorkspace]);

  if (!isTabletLayout) return children;

  return (
    <View style={styles.shell}>
      <View style={[styles.drawer, collapsed ? styles.drawerCollapsed : null]}>
        <TouchableOpacity style={styles.drawerToggle} onPress={() => setCollapsed((value) => !value)}>
          <MaterialIcons name={collapsed ? 'menu' : 'menu-open'} size={22} color="#e2e8f0" />
          {!collapsed ? <Text style={styles.drawerToggleText}>Collapse</Text> : null}
        </TouchableOpacity>

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

        <TouchableOpacity style={styles.logoutButton} onPress={() => logout?.()}>
          <MaterialIcons name="logout" size={20} color="#fecaca" />
          {!collapsed ? <Text style={styles.logoutText}>Logout</Text> : null}
        </TouchableOpacity>
      </View>

      <View style={styles.contentWrap}>
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <LogoTitle width={150} height={48} />
            {!collapsed ? (
              <View style={styles.greetingWrap}>
                <Text style={styles.topEyebrow}>{showAdminWorkspace ? 'Admin Workspace' : 'Therapist Workspace'}</Text>
                <Text style={styles.topTitle}>Hello, {greeting}</Text>
              </View>
            ) : null}
          </View>
          <TouchableOpacity style={styles.helpButton} onPress={() => openTarget({ root: 'Settings', screen: 'Help' })}>
            <MaterialIcons name="help-outline" size={20} color="#1d4ed8" />
            {!collapsed ? <Text style={styles.helpButtonText}>Help</Text> : null}
          </TouchableOpacity>
        </View>
        <View style={styles.screenWrap}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', backgroundColor: '#e2e8f0' },
  drawer: { width: 280, backgroundColor: '#0f172a', paddingHorizontal: 16, paddingVertical: 20 },
  drawerCollapsed: { width: 92, paddingHorizontal: 10 },
  drawerToggle: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  drawerToggleText: { color: '#e2e8f0', fontWeight: '700', marginLeft: 10 },
  group: { marginBottom: 18 },
  groupLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 8 },
  navItem: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 6 },
  navItemActive: { backgroundColor: '#e0f2fe' },
  navLabel: { color: '#e2e8f0', fontWeight: '700', marginLeft: 10 },
  navLabelActive: { color: '#0f172a' },
  logoutButton: { marginTop: 'auto', flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#1e293b' },
  logoutText: { color: '#fecaca', fontWeight: '700', marginLeft: 10 },
  contentWrap: { flex: 1, padding: 12 },
  topBar: { minHeight: 70, borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 18, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  greetingWrap: { marginLeft: 14 },
  topEyebrow: { color: '#2563eb', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  topTitle: { marginTop: 4, fontSize: 20, fontWeight: '800', color: '#0f172a' },
  helpButton: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#eff6ff' },
  helpButtonText: { color: '#1d4ed8', fontWeight: '700', marginLeft: 8 },
  screenWrap: { flex: 1, borderRadius: 24, overflow: 'hidden', backgroundColor: '#f8fafc' },
});