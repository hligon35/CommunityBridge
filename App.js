import React, { useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
// Temporarily remove TailwindProvider if not available at runtime
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AuthProvider, useAuth } from './src/AuthContext';
import { DataProvider } from './src/DataContext';
import UrgentMemoOverlay from './src/components/UrgentMemoOverlay';
import BottomNav from './src/components/BottomNav';
import ErrorBoundary from './src/components/ErrorBoundary';
import ArrivalDetector from './src/components/ArrivalDetector';
import DevRoleSwitcher from './src/components/DevRoleSwitcher';
import { logger, setDebugContext } from './src/utils/logger';
import { registerGlobalDebugHandlers } from './src/utils/registerDebugHandlers';
import { configureNotificationHandling } from './src/utils/pushNotifications';
import { navigationRef } from './src/navigationRef';

import RoleDashboardScreen from './src/screens/RoleDashboardScreen';
import ChatsScreen from './src/screens/ChatsScreen';
import ChatThreadScreen from './src/screens/ChatThreadScreen';
import NewThreadScreen from './src/screens/NewThreadScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import EditProfileScreen from './src/screens/EditProfileScreen';
import HelpScreen from './src/screens/HelpScreen';
import MyClassScreen from './src/screens/MyClassScreen';
import MyChildScreen from './src/screens/MyChildScreen';
import AdminControlsScreen from './src/screens/AdminControlsScreen';
import AdminChatMonitorScreen from './src/screens/AdminChatMonitorScreen';
import UserMonitorScreen from './src/screens/UserMonitorScreen';
import StudentDirectoryScreen from './src/screens/StudentDirectoryScreen';
import FacultyDirectoryScreen from './src/screens/FacultyDirectoryScreen';
import ParentDirectoryScreen from './src/screens/ParentDirectoryScreen';
import ParentDetailScreen from './src/screens/ParentDetailScreen';
import ChildDetailScreen from './src/screens/ChildDetailScreen';
import FacultyDetailScreen from './src/screens/FacultyDetailScreen';
import ManagePermissionsScreen from './src/screens/ManagePermissionsScreen';
import PrivacyDefaultsScreen from './src/screens/PrivacyDefaultsScreen';
import AdminAlertsScreen from './src/screens/AdminAlertsScreen';
import AdminMemosScreen from './src/screens/AdminMemosScreen';
import ExportDataScreen from './src/screens/ExportDataScreen';
import { HelpButton, BackButton } from './src/components/TopButtons';
import { View, Text } from 'react-native';
import LogoTitle from './src/components/LogoTitle';
import LoginScreen from './screens/LoginScreen';
import TwoFactorScreen from './screens/TwoFactorScreen';
import { initSentry, Sentry } from './src/sentry';
import { CommonActions } from '@react-navigation/native';

initSentry();

const RootStack = createNativeStackNavigator();
const AppStack = createNativeStackNavigator();

const HEADER_LOGO_WIDTH = 168;
const HEADER_LOGO_HEIGHT = 80;
const HEADER_HEIGHT = 96;
const SHOW_STACK_HEADERS = Platform.OS !== 'web';

const MyClassStackNav = createNativeStackNavigator();
function MyClassStack() {
  return (
    <MyClassStackNav.Navigator
      screenOptions={({ navigation, route, back }) => ({
        headerShown: SHOW_STACK_HEADERS,
        headerTitleAlign: 'center',
        headerTitle: () => <LogoTitle width={HEADER_LOGO_WIDTH} height={HEADER_LOGO_HEIGHT} />,
        headerStyle: { height: HEADER_HEIGHT },
        headerLeft: () => (back ? <BackButton onPress={() => navigation.goBack()} /> : <HelpButton />),
      })}
    >
      <MyClassStackNav.Screen name="MyClassMain" component={MyClassScreen} options={{ title: 'My Class' }} />
    </MyClassStackNav.Navigator>
  );
}

const ControlsStackNav = createNativeStackNavigator();
function ControlsStack() {
  return (
    <ControlsStackNav.Navigator
      screenOptions={({ navigation, route, back }) => ({
        headerShown: SHOW_STACK_HEADERS,
        headerTitleAlign: 'center',
        headerTitle: () => <LogoTitle width={HEADER_LOGO_WIDTH} height={HEADER_LOGO_HEIGHT} />,
        headerStyle: { height: HEADER_HEIGHT },
        headerLeft: () => (back ? <BackButton onPress={() => navigation.goBack()} /> : <HelpButton />),
      })}
    >
      <ControlsStackNav.Screen name="ControlsMain" component={AdminControlsScreen} options={{ title: 'Dashboard' }} />
      <ControlsStackNav.Screen name="StudentDirectory" component={StudentDirectoryScreen} options={{ title: 'Student Directory' }} />
      <ControlsStackNav.Screen name="FacultyDirectory" component={FacultyDirectoryScreen} options={{ title: 'Faculty Directory' }} />
      <ControlsStackNav.Screen name="ParentDirectory" component={ParentDirectoryScreen} options={{ title: 'Parent Directory' }} />
      <ControlsStackNav.Screen name="ParentDetail" component={ParentDetailScreen} options={{ title: 'Parent' }} />
      <ControlsStackNav.Screen name="ChildDetail" component={ChildDetailScreen} options={{ title: 'Student' }} />
      <ControlsStackNav.Screen name="FacultyDetail" component={FacultyDetailScreen} options={{ title: 'Faculty' }} />
      <ControlsStackNav.Screen name="AdminMemos" component={AdminMemosScreen} options={{ title: 'Compose Memo' }} />
      <ControlsStackNav.Screen name="AdminChatMonitor" component={AdminChatMonitorScreen} options={{ title: 'Chat Monitor' }} />
      <ControlsStackNav.Screen name="UserMonitor" component={UserMonitorScreen} options={{ title: 'User Monitor' }} />
      <ControlsStackNav.Screen name="ChatThread" component={ChatThreadScreen} options={{ title: 'Thread' }} />
      <ControlsStackNav.Screen name="ManagePermissions" component={ManagePermissionsScreen} options={{ title: 'Manage Permissions' }} />
      <ControlsStackNav.Screen name="PrivacyDefaults" component={PrivacyDefaultsScreen} options={{ title: 'Profile Settings' }} />
      <ControlsStackNav.Screen name="AdminAlerts" component={AdminAlertsScreen} options={{ title: 'Alerts' }} />
      
      <ControlsStackNav.Screen name="ExportData" component={ExportDataScreen} options={{ title: 'Export Data' }} />
    </ControlsStackNav.Navigator>
  );
}

const CommunityStackNav = createNativeStackNavigator();
function CommunityStack() {
  return (
    <CommunityStackNav.Navigator
      screenOptions={({ navigation, route, back }) => ({
        headerShown: SHOW_STACK_HEADERS,
        headerTitleAlign: 'center',
        headerTitle: () => <LogoTitle width={HEADER_LOGO_WIDTH} height={HEADER_LOGO_HEIGHT} />,
        headerStyle: { height: HEADER_HEIGHT },
        headerLeft: () => (back ? <BackButton onPress={() => navigation.goBack()} /> : <HelpButton />),
      })}
    >
      <CommunityStackNav.Screen name="CommunityMain" component={RoleDashboardScreen} options={{ title: 'Dashboard' }} />
    </CommunityStackNav.Navigator>
  );
}

const MyChildStackNav = createNativeStackNavigator();
function MyChildStack() {
  return (
    <MyChildStackNav.Navigator
      screenOptions={({ navigation, route, back }) => ({
        headerShown: SHOW_STACK_HEADERS,
        headerTitleAlign: 'center',
        headerTitle: () => <LogoTitle width={HEADER_LOGO_WIDTH} height={HEADER_LOGO_HEIGHT} />,
        headerStyle: { height: HEADER_HEIGHT },
        headerLeft: () => (back ? <BackButton onPress={() => navigation.goBack()} /> : <HelpButton />),
      })}
    >
      <MyChildStackNav.Screen name="MyChildMain" component={MyChildScreen} options={{ title: 'My Child' }} />
    </MyChildStackNav.Navigator>
  );
}

const ChatsStackNav = createNativeStackNavigator();
function ChatsStack() {
  return (
    <ChatsStackNav.Navigator
      screenOptions={({ navigation, route, back }) => ({
        headerShown: SHOW_STACK_HEADERS,
        headerTitleAlign: 'center',
        headerTitle: () => <LogoTitle width={HEADER_LOGO_WIDTH} height={HEADER_LOGO_HEIGHT} />,
        headerStyle: { height: HEADER_HEIGHT },
        headerLeft: () => (back ? <BackButton onPress={() => navigation.goBack()} /> : <HelpButton />),
      })}
    >
      <ChatsStackNav.Screen name="ChatsList" component={ChatsScreen} options={{ title: 'Chats' }} />
      <ChatsStackNav.Screen name="NewThread" component={NewThreadScreen} options={{ title: 'New Message' }} />
      <ChatsStackNav.Screen name="ChatThread" component={ChatThreadScreen} options={{ title: 'Thread' }} />
    </ChatsStackNav.Navigator>
  );
}

const SettingsStackNav = createNativeStackNavigator();
function SettingsStack() {
  return (
    <SettingsStackNav.Navigator
      screenOptions={({ navigation, route, back }) => ({
        headerShown: SHOW_STACK_HEADERS,
        headerTitleAlign: 'center',
        headerTitle: () => <LogoTitle width={HEADER_LOGO_WIDTH} height={HEADER_LOGO_HEIGHT} />,
        headerStyle: { height: HEADER_HEIGHT },
        headerLeft: () => (back ? <BackButton onPress={() => navigation.goBack()} /> : <HelpButton />),
      })}
    >
      <SettingsStackNav.Screen name="SettingsMain" component={SettingsScreen} options={{ title: 'Profile Settings', headerRight: () => null }} />
      <SettingsStackNav.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Edit Profile' }} />
      <SettingsStackNav.Screen name="Help" component={HelpScreen} options={{ title: 'Help' }} />
    </SettingsStackNav.Navigator>
  );
}

function MainShell({ currentRoute }) {
  return (
    <DataProvider>
      <MainRoutes />
      <BottomNav navigationRef={navigationRef} currentRoute={currentRoute} />
      <UrgentMemoOverlay />
      <ArrivalDetector />
      <DevRoleSwitcher />
    </DataProvider>
  );
}

// MainRoutes chooses which top-level stacks to expose based on authenticated user role.
function MainRoutes() {
  const { user } = useAuth();
  const role = (user && user.role) ? (user.role || '').toString().toLowerCase() : 'parent';

  const screens = [];
  if (!(role === 'admin' || role === 'administrator')) {
    screens.push({ name: 'Home', component: CommunityStack });
  }
  screens.push({ name: 'Chats', component: ChatsStack });

  if (role === 'therapist') {
    screens.push({ name: 'MyClass', component: MyClassStack });
  } else if (role === 'admin' || role === 'administrator') {
    screens.push({ name: 'Controls', component: ControlsStack });
  } else {
    screens.push({ name: 'MyChild', component: MyChildStack });
  }

  screens.push({ name: 'Settings', component: SettingsStack });

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }} initialRouteName={(role === 'admin' || role === 'administrator') ? 'Controls' : 'Home'}>
      {screens.map(s => (
        <RootStack.Screen key={s.name} name={s.name} component={s.component} />
      ))}
    </RootStack.Navigator>
  );
}

// IMPORTANT: AppNavigator MUST be defined at module scope.
// Previously it was declared inside `App()` and React therefore created a
// fresh component type on every render of `App`. Whenever `setCurrentRoute`
// fired from `onStateChange`, `App` re-rendered, the `AppNavigator` function
// identity changed, and React unmounted + remounted the entire tree
// (NavigationContainer, all stacks, DataProvider, every screen). That reset
// the navigation state back to `initialRouteName="Login"` on every tab tap,
// which is the main navigation bug reported in production.
function AppNavigator() {
  const auth = useAuth();
  const [currentRoute, setCurrentRoute] = useState('Login');
  const webEscapeHandledRef = useRef(false);

  useEffect(() => {
    // Web debugging escape hatch:
    //  - `/?logout=1` => sign out
    //  - `/?reset=1`  => sign out + clear storage + reload
    try {
      if (Platform.OS !== 'web') return;
      if (webEscapeHandledRef.current) return;

      const search = String(globalThis?.location?.search || '');
      if (!search || search === '?') return;

      const params = new URLSearchParams(search);
      const wantsLogout = params.get('logout') === '1' || params.get('bbLogout') === '1';
      const wantsReset = params.get('reset') === '1' || params.get('bbReset') === '1';
      if (!wantsLogout && !wantsReset) return;

      webEscapeHandledRef.current = true;

      (async () => {
        try {
          await auth?.logout?.();
        } catch (_) {}

        if (wantsReset) {
          try { globalThis?.localStorage?.clear?.(); } catch (_) {}
          try { globalThis?.sessionStorage?.clear?.(); } catch (_) {}
          try { globalThis?.indexedDB?.deleteDatabase?.('firebaseLocalStorageDb'); } catch (_) {}
        }

        // Strip the params so refreshes don't loop.
        try {
          const url = new URL(String(globalThis?.location?.href || ''), String(globalThis?.location?.origin || 'http://localhost'));
          url.searchParams.delete('logout');
          url.searchParams.delete('bbLogout');
          url.searchParams.delete('reset');
          url.searchParams.delete('bbReset');
          globalThis?.history?.replaceState?.({}, '', url.pathname + url.search + url.hash);
        } catch (_) {}

        if (wantsReset) {
          try { globalThis?.location?.reload?.(); } catch (_) {}
        }
      })();
    } catch (_) {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.logout]);

  useEffect(() => {
    try {
      if (!navigationRef.isReady()) return;
      if (auth?.loading) return;
      if (!auth?.token) return;

      // If orgSettings turns on MFA (or the user isn't verified), prevent access to Main.
      if (auth?.needsMfa) {
        const r = navigationRef.getCurrentRoute();
        const name = r?.name ? String(r.name) : '';
        if (name && name !== 'Login' && name !== 'TwoFactor') {
          navigationRef.dispatch(
            CommonActions.reset({ index: 0, routes: [{ name: 'TwoFactor' }] })
          );
        }
      }
    } catch (_) {
      // ignore
    }
  }, [auth?.loading, auth?.token, auth?.needsMfa]);

  return (
    <NavigationContainer
      ref={navigationRef}
      onStateChange={() => {
        try {
          const r = navigationRef.getCurrentRoute();
          if (r && r.name) {
            // Map nested route names back to top-level stack keys so BottomNav highlights correctly
            const map = {
              Main: 'Home',
              CommunityMain: 'Home',
              PostThread: 'Home',
              ChatsList: 'Chats',
              ChatThread: 'Chats',
              NewThread: 'Chats',
              MyChildMain: 'MyChild',
              SettingsMain: 'Settings',
              MyClassMain: 'MyClass',
              ControlsMain: 'Controls',
            };
            const next = map[r.name] || r.name;
            setCurrentRoute((prev) => (prev === next ? prev : next));
            setDebugContext({ route: next });
            logger.debug('nav', 'Route change', { route: next });
          }
        } catch (e) {
          // ignore
        }
      }}
    >
      <AppStack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Login">
        <AppStack.Screen name="Login">
          {(props) => <LoginScreen {...props} suppressAutoRedirect={false} />}
        </AppStack.Screen>
        <AppStack.Screen
          name="TwoFactor"
          component={TwoFactorScreen}
          options={{ gestureEnabled: false }}
        />
        <AppStack.Screen name="Main">
          {() => <MainShell currentRoute={currentRoute} />}
        </AppStack.Screen>
      </AppStack.Navigator>
    </NavigationContainer>
  );
}

function App() {
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    try {
      // expo-notifications push token listeners are not fully supported on web.
      // Skip notification setup on web to avoid noisy console warnings.
      if (Platform.OS !== 'web') configureNotificationHandling();
      registerGlobalDebugHandlers();
      logger.debug('app', 'Registered global debug handlers');
    } catch (e) {
      // ignore
    }

    const missing = [];
    if (!RoleDashboardScreen) missing.push('RoleDashboardScreen');
    if (!ChatsScreen) missing.push('ChatsScreen');
    if (!ChatThreadScreen) missing.push('ChatThreadScreen');
    if (!SettingsScreen) missing.push('SettingsScreen');
    if (!AuthProvider) missing.push('AuthProvider');
    if (!DataProvider) missing.push('DataProvider');
    if (!UrgentMemoOverlay) missing.push('UrgentMemoOverlay');
    if (missing.length) setProblem(missing);
    else setProblem(null);
    // log for Metro/console
    logger.info('app', 'App imports', {
      RoleDashboardScreen: !!RoleDashboardScreen,
      ChatsScreen: !!ChatsScreen,
      ChatThreadScreen: !!ChatThreadScreen,
      SettingsScreen: !!SettingsScreen,
      AuthProvider: !!AuthProvider,
      DataProvider: !!DataProvider,
      UrgentMemoOverlay: !!UrgentMemoOverlay,
    });
  }, []);

  if (problem && problem.length) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Missing components detected</Text>
        <Text>{problem.join(', ')}</Text>
        <Text style={{ marginTop: 12, color: '#666' }}>Check the import paths and default exports for those files.</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <StatusBar barStyle="dark-content" translucent={false} />
        <SafeAreaProvider>
          <AuthProvider>
            <AppNavigator />
          </AuthProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(App);
