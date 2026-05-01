import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ScreenWrapper } from '../components/ScreenWrapper';

export default function SystemSettingsScreen() {
  return (
    <ScreenWrapper style={styles.container}>
      <View style={styles.body}>
        <Text style={styles.message}>This screen has been removed. Developer tools are available in the Dev Role Switcher.</Text>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  body: { padding: 16 },
  message: { color: '#374151' }
});