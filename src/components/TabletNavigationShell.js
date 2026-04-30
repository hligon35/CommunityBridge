import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../AuthContext';
import { useTenant } from '../core/tenant/TenantContext';
import { isAdminRole, isStaffRole } from '../core/tenant/models';
import useIsTabletLayout from '../hooks/useIsTabletLayout';
import { navigationRef } from '../navigationRef';

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

  const navGroups = useMemo(() => {
    const dailyOps = [{ key: 'dashboard', label: labels.dashboard || 'Dashboard', icon: 'dashboard', target: { root: isAdmin ? 'Controls' : 'Home' } }];
    if (isStaff || isAdmin) {
      dailyOps.push({ key: 'tap-tracker', label: 'Tap Tracker', icon: 'touch-app', target: { root: isAdmin ? 'Controls' : 'Home', screen: 'TapTracker', params: { sessionPreview: true } } });
      dailyOps.push({ key: 'summary-review', label: 'Summary Review', icon: 'fact-check', target: { root: isAdmin ? 'Controls' : 'Home', screen: 'SummaryReview', params: { sessionPreview: true } } });
    }
    if (isAdmin) dailyOps.push({ key: 'attendance', label: 'Attendance', icon: 'how-to-reg', target: { root: 'Controls', screen: 'Attendance' } });

    const programsData = [{ key: 'reports', label: 'Reports', icon: 'query-stats', target: { root: isAdmin ? 'Controls' : isStaff ? 'Home' : 'MyChild', screen: 'Reports' } }];
    if (isAdmin) programsData.push({ key: 'program-directory', label: 'Program Directory', icon: 'folder-open', target: { root: 'Controls', screen: 'ProgramDirectory' } });

    const communication = [{ key: 'messages', label: 'Messages', icon: 'chat', target: { root: 'Chats' } }];
    const scheduling = [{ key: 'schedule', label: 'Schedule', icon: 'event', target: { root: isAdmin ? 'Controls' : 'Home', screen: 'ScheduleCalendar' } }];
    const adminItems = isAdmin
      ? [{ key: 'directory', label: 'Student Directory', icon: 'groups', target: { root: 'Controls', screen: 'StudentDirectory' } }, { key: 'settings', label: 'Settings', icon: 'settings', target: { root: 'Settings' } }]
      : [{ key: 'settings', label: 'Settings', icon: 'settings', target: { root: 'Settings' } }];

    return [
      { label: 'Daily Operations', items: dailyOps },
      { label: 'Programs & Data', items: programsData },
      { label: 'Communication', items: communication },
      { label: 'Scheduling', items: scheduling },
      { label: isAdmin ? 'Admin' : 'Workspace', items: adminItems },
    ];
  }, [isAdmin, isStaff, labels.dashboard]);

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
              const active = currentRoute === item.target.root;
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
          <View>
            <Text style={styles.topEyebrow}>iPad Layout</Text>
            <Text style={styles.topTitle}>{labels.dashboard || 'Behavior System Workspace'}</Text>
          </View>
          <View style={styles.topPill}>
            <MaterialIcons name={Platform.OS === 'web' ? 'laptop' : 'tablet-mac'} size={16} color="#1d4ed8" />
            <Text style={styles.topPillText}>{currentRoute || 'Workspace'}</Text>
          </View>
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
  topBar: { minHeight: 76, borderRadius: 20, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#dbeafe', paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  topEyebrow: { color: '#2563eb', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  topTitle: { marginTop: 6, fontSize: 22, fontWeight: '800', color: '#0f172a' },
  topPill: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#eff6ff' },
  topPillText: { color: '#1d4ed8', fontWeight: '700', marginLeft: 8 },
  screenWrap: { flex: 1, borderRadius: 24, overflow: 'hidden', backgroundColor: '#f8fafc' },
});