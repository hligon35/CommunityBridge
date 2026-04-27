import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SettingsScreen(){
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView style={[styles.container, { paddingBottom: insets.bottom + 80 }]}>
      <Text style={styles.title}>Settings</Text>
      <Text>Notifications • Profile • Security</Text>
      <View style={{ height: 72, marginTop: 12 }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 10 }
});
