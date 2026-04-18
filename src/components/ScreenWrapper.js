import React from 'react';
import { View, Platform, ImageBackground } from 'react-native';
import ScreenHeader from './ScreenHeader';
import WebNav from './WebNav';
import { useNavigation, useRoute } from '@react-navigation/native';

export function ScreenWrapper({ children, style, hideBanner = false, bannerShowBack, bannerTitle, bannerLeft, bannerRight }) {
  const navigation = useNavigation();
  const route = useRoute();

  const nameMap = {
    CommunityMain: 'Home',
    PostThread: 'Post',
    ChatsList: 'Chats',
    ChatThread: 'New Message',
    MyChildMain: 'My Child',
    SettingsMain: 'Profile Settings',
    MyClassMain: 'My Class',
    ControlsMain: 'Dashboard',
    StudentDirectory: 'Student Directory',
    ParentDirectory: 'Parent Directory',
    FacultyDirectory: 'Faculty Directory',
    ChildDetail: 'Student',
    FacultyDetail: 'Faculty',
    ManagePermissions: 'Manage Permissions',
    PrivacyDefaults: 'Profile Settings',
    ModeratePosts: 'Moderate Posts',
    ExportData: 'Export Data',
  };

  const title = bannerTitle || nameMap[route?.name] || route?.name || '';
  const computedShowBack = navigation && navigation.canGoBack && navigation.canGoBack() && title !== 'Home';
  const showBack = (typeof bannerShowBack === 'boolean') ? bannerShowBack : computedShowBack;

  return (
    <ImageBackground
      source={require('../../assets/banner.png')}
      resizeMode="cover"
      style={{ flex: 1, width: '100%', backgroundColor: '#fff' }}
    >
      <View style={[{ flex: 1, width: '100%', backgroundColor: '#fff' }, style]}>
        {/* web: show top WebNav; mobile: show ScreenHeader */}
        {Platform.OS === 'web'
          ? <WebNav />
          : (!hideBanner && <ScreenHeader title={title} showBack={showBack} left={bannerLeft} right={bannerRight} />)}
        {children}
        {/* spacer to prevent bottom nav from overlapping content (smaller on web) */}
        <View style={{ height: Platform.OS === 'web' ? 24 : 88 }} accessibilityElementsHidden importantForAccessibility="no" />
      </View>
    </ImageBackground>
  );
}

export function CenteredContainer({ children, contentStyle }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', padding: 16, paddingTop: Platform.OS === 'web' ? 20 : 16 }}>
      <View style={[{ width: '100%', maxWidth: 720 }, contentStyle]}>{children}</View>
    </View>
  );
}

export default ScreenWrapper;
