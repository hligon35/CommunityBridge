import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function CalendarScreen(){
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Calendar</Text>
      <Text>Event: Back-to-school night — Sept 10</Text>
      <Text>Event: Parent-teacher conferences — Oct 12-14</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 10 }
});
