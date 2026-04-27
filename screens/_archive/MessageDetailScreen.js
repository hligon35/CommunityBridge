import React, { useContext } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { DataContext } from '../src/DataContext';

export default function MessageDetailScreen({ route, navigation }){
  const { messageId } = route.params || {};
  const { messages, markRead } = useContext(DataContext);
  const m = messages.find(x => x.id === messageId) || { title: 'Not found', body: '' };

  React.useEffect(() => { if (m && m.id) markRead(m.id); }, [m]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{m.title}</Text>
      <Text style={styles.meta}>{m.sender} • {m.date ? new Date(m.date).toLocaleString() : ''}</Text>
      <View style={{ height: 12 }} />
      <Text>{m.body}</Text>
      <View style={{ height: 20 }} />
      <Button title="Back" onPress={() => navigation.goBack()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '700' },
  meta: { color: '#666', marginTop: 4 }
});
