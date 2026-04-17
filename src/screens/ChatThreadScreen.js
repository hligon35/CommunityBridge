import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, TextInput, Button, RefreshControl, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard, Platform } from 'react-native';
// removed SafeAreaView usage to avoid shifting content down
import { useData } from '../DataContext';
import { useAuth } from '../AuthContext';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useHeaderHeight } from '@react-navigation/elements';

export default function ChatThreadScreen({ route }) {
  const { threadId, isNew, to: initialTo } = route.params || {};
  const { messages, sendMessage } = useData();
  const [text, setText] = useState('');
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const headerHeight = useHeaderHeight ? useHeaderHeight() : 0;

  const threadMessages = useMemo(() => messages.filter((m) => (m.threadId || m.id) === threadId).sort((a,b)=> new Date(a.createdAt)-new Date(b.createdAt)), [messages, threadId]);

  // authorization: only participants or admin may view the thread
  const isParticipant = useMemo(() => {
    if (isNew) return true;
    if (!threadMessages || !threadMessages.length) return false;
    if (user && (user.role === 'admin' || user.role === 'ADMIN')) return true;
    const participants = new Set();
    threadMessages.forEach(m => {
      if (m.sender?.id) participants.add(m.sender.id.toString());
      if (m.sender?.name) participants.add(m.sender.name.toString());
      if (m.to && Array.isArray(m.to)) m.to.forEach(t => { if (t.id) participants.add(t.id.toString()); if (t.name) participants.add(t.name.toString()); });
    });
    const uid = (user?.id || user?.name || '').toString();
    return !!Array.from(participants).find(p => p.toLowerCase() === uid.toLowerCase());
  }, [threadMessages, user, isNew]);

  async function handleSend() {
    if (!text.trim()) return;
    if (!isParticipant) return; // prevent sending if not authorized
    await sendMessage({ threadId, body: text, to: (Array.isArray(initialTo) && initialTo.length) ? initialTo : undefined });
    setText('');
    Keyboard.dismiss();
  }
  if (!isParticipant) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Text style={{ fontWeight: '700', marginBottom: 8 }}>Not authorized</Text>
        <Text style={{ color: '#6b7280', textAlign: 'center' }}>You are not a participant in this conversation.</Text>
      </View>
    );
  }

  async function onRefresh() {
    try { setRefreshing(true); /* trigger data refresh if available */ } catch (e) {} finally { setRefreshing(false); }
  }

  return (
    <ScreenWrapper style={{ flex: 1, backgroundColor: '#fff' }}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
        >
          <FlatList
            data={threadMessages}
            keyExtractor={(i) => i.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 120 }}
            renderItem={({ item }) => {
              const isMine = user && (item.sender?.id === user.id || (item.sender?.name || '').toLowerCase().includes((user.name || '').toLowerCase()));
              return (
                <View style={{ paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                  {!isMine && (
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                      <Text style={{ fontWeight: '700' }}>{(item.sender?.name || '?').slice(0,1)}</Text>
                    </View>
                  )}
                  <View style={{ maxWidth: '78%' }}>
                    {!isMine && <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{item.sender?.name}</Text>}
                    <View style={{ backgroundColor: isMine ? '#2563eb' : '#f3f4f6', padding: 10, borderRadius: 10 }}>
                      <Text style={{ color: isMine ? '#fff' : '#111' }}>{item.body}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>{new Date(item.createdAt).toLocaleString()}</Text>
                  </View>
                  {isMine && (
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
                      <Text style={{ fontWeight: '700' }}>{(item.sender?.name || '?').slice(0,1)}</Text>
                    </View>
                  )}
                </View>
              );
            }}
          />

          <View style={{ padding: 8, flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#eee', backgroundColor: '#fff' }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Message"
              style={{ flex: 1, padding: 8, borderWidth: 1, borderColor: '#ddd', marginRight: 8 }}
              onSubmitEditing={handleSend}
              returnKeyType="send"
            />
            <Button title="Send" onPress={handleSend} />
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </ScreenWrapper>
  );
}
