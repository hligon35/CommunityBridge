import React from 'react';
import { View } from 'react-native';

const AdminChatMonitor = require('./AdminChatMonitorScreen').default;

export default function UserMonitorScreen({ navigation, route }) {
  const userId = route?.params?.initialUserId;

  return (
    <View style={{ flex: 1 }}>
      <AdminChatMonitor navigation={navigation} route={{ params: { initialUserId: userId } }} />
    </View>
  );
}
