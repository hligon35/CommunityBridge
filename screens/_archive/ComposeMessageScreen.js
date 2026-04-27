import React, { useState, useContext } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { DataContext } from '../src/DataContext';

export default function ComposeMessageScreen({ navigation }){
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const { sendMessage } = useContext(DataContext);

  function onSend(){
    if (!title || !body) return Alert.alert('Validation', 'Please enter title and message');
    sendMessage({ title, body, sender: 'Mobile User' });
    navigation.goBack();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Compose</Text>
      <TextInput style={styles.input} placeholder="Title" value={title} onChangeText={setTitle} />
      <TextInput style={[styles.input, {height:120}]} placeholder="Message body" value={body} onChangeText={setBody} multiline />
      <Button title="Send" onPress={onSend} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 12 },
  input: { borderWidth:1, borderColor:'#ccc', padding:10, borderRadius:6, marginBottom:12 }
});
