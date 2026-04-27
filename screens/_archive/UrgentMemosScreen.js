import React, { useContext, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Button, TextInput, Alert, RefreshControl } from 'react-native';
import { DataContext, useData } from '../src/DataContext';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function UrgentMemosScreen(){
  const { urgentMemos, createUrgentMemo, ackMemo, fetchAndSync } = useData();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const insets = useSafeAreaInsets();

  async function onRefresh(){
    try{ setRefreshing(true); await fetchAndSync(); }catch(e){} finally{ setRefreshing(false); }
  }

  function sendMemo(){
    if (!title || !body) return Alert.alert('Validation', 'Please enter title and message');
    createUrgentMemo({ title, body });
    setTitle(''); setBody('');
  }

  return (
    <SafeAreaView style={[styles.container, { paddingBottom: insets.bottom + 80 }]}>
      <Text style={styles.title}>Urgent Memos</Text>
      <FlatList
        data={urgentMemos}
        keyExtractor={i => i.id}
        renderItem={({item}) => (
          <View style={styles.memo}>
            <Text style={styles.memoTitle}>{item.title} {item.ack ? '(Acknowledged)' : ''}</Text>
            <Text style={styles.memoMeta}>{new Date(item.date).toLocaleString()}</Text>
            <Text style={{ marginTop: 6 }}>{item.body}</Text>
            {!item.ack && <Button title="Acknowledge" onPress={() => ackMemo(item.id)} />}
          </View>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />

      <View style={styles.composer}>
        <Text style={{fontWeight:'600'}}>Send Urgent Memo</Text>
        <TextInput style={styles.input} placeholder="Title" value={title} onChangeText={setTitle} />
        <TextInput style={[styles.input, {height:80}]} placeholder="Message" value={body} onChangeText={setBody} multiline />
        <Button title="Send Memo" onPress={sendMemo} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 10 },
  memo: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee', marginBottom: 8 },
  memoTitle: { fontSize: 16, fontWeight: '600' },
  memoMeta: { fontSize: 12, color: '#666' },
  composer: { marginTop: 12, paddingTop: 12, borderTopWidth:1, borderTopColor:'#ddd' },
  input: { borderWidth:1, borderColor:'#ccc', padding:8, borderRadius:6, marginTop:8 }
});
