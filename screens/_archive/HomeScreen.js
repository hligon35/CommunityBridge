import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';

export default function HomeScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Text style={[styles.title, { textAlign: 'center' }]}>Welcome to CommunityBridge</Text>
      <Button title="Messages" onPress={() => navigation.navigate('Messages')} />
      <Button title="Calendar" onPress={() => navigation.navigate('Calendar')} />
      <Button title="Admin" onPress={() => navigation.navigate('Admin')} />
      <Button title="Settings" onPress={() => navigation.navigate('Settings')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 }
});
