import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import ScreenHeader from './ScreenHeader';
import WebNav from './WebNav';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTenant } from '../core/tenant/TenantContext';
import { humanizeScreenLabel } from '../utils/screenLabels';

export function ScreenWrapper({ children, style, hideBanner = false, bannerShowBack, bannerTitle, bannerLeft, bannerRight }) {
  const navigation = useNavigation();
  const route = useRoute();
  const tenant = useTenant();
  const labels = tenant?.labels || {};

  const nameMap = {
    CommunityMain: 'Home',
    PostThread: 'Post',
    ChatsList: 'Chats',
    ChatThread: 'New Message',
    MyChildMain: labels.myChild || 'My Child',
    SettingsMain: 'Profile Settings',
    MyClassMain: labels.myClass || 'My Class',
    ControlsMain: labels.dashboard || 'Dashboard',
    StudentDirectory: 'Student Directory',
    ParentDirectory: 'Parent Directory',
    FacultyDirectory: labels.facultyDirectory || 'Faculty Directory',
    ChildDetail: 'Student',
    FacultyDetail: labels.facultyDetail || 'Faculty',
    ManagePermissions: 'Manage Permissions',
    PrivacyDefaults: 'Profile Settings',
    ModeratePosts: 'Moderate Posts',
    ExportData: 'Export Data',
  };

  const title = bannerTitle || nameMap[route?.name] || humanizeScreenLabel(route?.name) || '';
  const computedShowBack = navigation && navigation.canGoBack && navigation.canGoBack() && title !== 'Home';
  const showBack = (typeof bannerShowBack === 'boolean') ? bannerShowBack : computedShowBack;

  const isWeb = Platform.OS === 'web';

  return (
    <View style={[{ flex: 1, width: '100%', backgroundColor: isWeb ? '#f0f2f5' : '#fff' }, style]}>
      {/* web: show top WebNav; mobile: show ScreenHeader */}
      {isWeb
        ? <WebNav />
        : (!hideBanner && <ScreenHeader title={title} showBack={showBack} left={bannerLeft} right={bannerRight} />)}

      {isWeb ? (
        <View style={{ flex: 1, width: '100%', alignItems: 'center', paddingHorizontal: 16, paddingTop: 20 }}>
          <View style={{ flex: 1, width: '100%', maxWidth: 1120 }}>
            {children}
            <View style={{ height: 24 }} accessibilityElementsHidden importantForAccessibility="no" />
          </View>
        </View>
      ) : (
        <>
          {children}
          {/* spacer to prevent bottom nav from overlapping content */}
          <View style={{ height: 72 }} accessibilityElementsHidden importantForAccessibility="no" />
        </>
      )}
    </View>
  );
}

export function CenteredContainer({ children, contentStyle }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 16, paddingTop: Platform.OS === 'web' ? 20 : 16, paddingBottom: 16 }}>
      <View style={[{ width: '100%', maxWidth: Platform.OS === 'web' ? 980 : 720 }, contentStyle]}>{children}</View>
    </View>
  );
}

export function WebSurface({ children, style, compact = false }) {
  return (
    <View
      style={[
        styles.webSurface,
        compact ? styles.webSurfaceCompact : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function WebColumns({ left, main, right, style, leftWidth = 280, rightWidth = 300 }) {
  if (Platform.OS !== 'web') {
    return <View style={style}>{main}</View>;
  }

  return (
    <View style={[styles.webColumns, style]}>
      {left ? <View style={[styles.webRail, { width: leftWidth }]}>{left}</View> : null}
      <View style={styles.webMain}>{main}</View>
      {right ? <View style={[styles.webRail, { width: rightWidth }]}>{right}</View> : null}
    </View>
  );
}

export function WebStickySection({ children, style, top = 20 }) {
  if (Platform.OS !== 'web') return <View style={style}>{children}</View>;
  return <View style={[{ position: 'sticky', top }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  webSurface: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e4e8ee',
    padding: 18,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  webSurfaceCompact: {
    padding: 14,
    borderRadius: 16,
  },
  webColumns: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  webRail: {
    flexShrink: 0,
  },
  webMain: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 18,
  },
});

export default ScreenWrapper;
