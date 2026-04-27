import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function AdminScreen(){
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Admin</Text>
      <Text>Directory import • Memos • Urgent notices</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 10 }
});
