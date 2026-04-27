import React, { useContext, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Button, RefreshControl } from 'react-native';
import { useData } from '../src/DataContext';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MessagesScreen({ navigation }){
  const { messages, fetchAndSync } = useData();
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();

  async function onRefresh(){
    try{ setRefreshing(true); await fetchAndSync(); }catch(e){} finally{ setRefreshing(false); }
  }

  function openMessage(m){
    navigation.navigate('MessageDetail', { messageId: m.id });
  }

  return (
    <SafeAreaView style={[styles.container, { paddingBottom: insets.bottom + 80 }]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Messages</Text>
        <Button title="Compose" onPress={() => navigation.navigate('ComposeMessage')} />
      </View>
      <FlatList
        data={messages}
        keyExtractor={i => i.id}
        renderItem={({item}) => (
          <TouchableOpacity style={styles.item} onPress={() => openMessage(item)}>
            <Text style={[styles.itemTitle, item.read ? styles.read : null]}>{item.title}</Text>
            <Text style={styles.itemMeta}>{item.sender} • {new Date(item.date).toLocaleString()}</Text>
          </TouchableOpacity>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 10 },
  item: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  itemTitle: { fontSize: 16 },
  itemMeta: { fontSize: 12, color: '#666' },
  read: { color: '#999' }
});
