import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ScreenWrapper } from '../components/ScreenWrapper';

// ManageUsersScreen was removed — keep a placeholder to avoid import errors until callers removed.
export default function ManageUsersScreen() {
  return (
    <ScreenWrapper style={styles.container}>
      <View style={styles.body}>
        <Text style={styles.message}>Manage Users has been removed. Use the Admin directory screens instead.</Text>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  body: { padding: 16 },
  message: { color: '#374151' }
});