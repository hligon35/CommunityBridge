import React, { useState, useMemo, useRef } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, TouchableWithoutFeedback, Image, Linking, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useAuth } from '../AuthContext';
import { useData } from '../DataContext';
import PostCard from '../components/PostCard';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { pravatarUriFor } from '../utils/idVisibility';

export default function PostThreadScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { postId } = route.params || {};
  const { user } = useAuth();
  const { posts, comment, replyToComment, reactToComment, like, share, children, therapists } = useData();
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const composerRef = useRef(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [openReplyFor, setOpenReplyFor] = useState(null);
  const [replyTextMap, setReplyTextMap] = useState({});
  const [showEmojiFor, setShowEmojiFor] = useState(null);

  const post = useMemo(() => posts.find((p) => p.id === postId) || null, [posts, postId]);

  async function handleSend() {
    if (!text || !text.trim()) return;
    setSending(true);
    try {
      await comment(postId, { body: text.trim(), author: { id: user?.id, name: user?.name } });
      setText('');
    } catch (e) {
      console.warn('comment send failed', e?.message || e);
    } finally {
      setSending(false);
    }
  }

  if (!post) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Post not found</Text>
      </View>
    );
  }

  return (
    <ScreenWrapper style={{ flex: 1, backgroundColor: '#f3f4f6' }}>
      <PostCard
        post={post}
        onLike={() => { if (like) like(post.id); }}
        onComment={() => { composerRef.current?.focus && composerRef.current.focus(); }}
        onShare={() => { if (share) share(post.id); }}
        onAvatarPress={async (author) => {
          let full = author || {};
          const tryFind = (list) => (list || []).find((u) => (u.id && full.id && u.id === full.id) || (u.name && full.name && u.name === full.name));
          const found = tryFind(children) || tryFind(therapists);
          if (found) full = { ...found, ...full };
          try {
            const SHOW_EMAIL_KEY = 'settings_show_email_v1';
            const SHOW_PHONE_KEY = 'settings_show_phone_v1';
            if (full && user && full.id && user.id && full.id === user.id) {
              const se = await AsyncStorage.getItem(SHOW_EMAIL_KEY);
              const sp = await AsyncStorage.getItem(SHOW_PHONE_KEY);
              if (se !== null) full.showEmail = (se === '1');
              if (sp !== null) full.showPhone = (sp === '1');
            }
          } catch (e) {}
          setSelectedUser(full);
          setShowUserModal(true);
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={{ flex: 1 }}>
            <FlatList
              data={post.comments || []}
              keyExtractor={(c) => c.id || `${c.createdAt || Math.random()}`}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={{ paddingBottom: 120 }}
              renderItem={({ item }) => (
                <View>
            <View style={styles.commentRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.commentAuthor}>{item.author?.name || 'Anonymous'}</Text>
                <Text style={styles.commentBody}>{item.body}</Text>
                <View style={{ flexDirection: 'row', marginTop: 8, alignItems: 'center' }}>
                  {(item.reactions && Object.keys(item.reactions).length) ? (
                    <View style={{ flexDirection: 'row', marginRight: 12 }}>
                      {Object.entries(item.reactions).map(([emo, count]) => (
                        <Text key={emo} style={{ marginRight: 8 }}>{emo} {count}</Text>
                      ))}
                    </View>
                  ) : null}
                  <TouchableOpacity onPress={() => setOpenReplyFor(openReplyFor === item.id ? null : item.id)} style={{ marginRight: 12 }}>
                    <Text style={{ color: '#0066FF' }}>Reply</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowEmojiFor(showEmojiFor === item.id ? null : item.id)}>
                    <Text style={{ color: '#0066FF' }}>React</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Emoji picker row */}
            {showEmojiFor === item.id ? (
              <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 6 }}>
                {['👍','❤️','😂','😮'].map((emo) => (
                  <TouchableOpacity key={emo} onPress={() => { reactToComment(postId, item.id, emo); setShowEmojiFor(null); }} style={{ marginRight: 12 }}>
                    <Text style={{ fontSize: 20 }}>{emo}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {/* Replies */}
            {item.replies && item.replies.length ? (
              <View style={{ paddingLeft: 24 }}>
                {item.replies.map((r) => (
                  <View key={r.id} style={[styles.commentRow, { backgroundColor: '#fbfbfb' }]}>
                    <Text style={styles.commentAuthor}>{r.author?.name || 'Anonymous'}</Text>
                    <Text style={styles.commentBody}>{r.body}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Reply composer under comment */}
            {openReplyFor === item.id ? (
              <View style={{ flexDirection: 'row', padding: 10, alignItems: 'center' }}>
                <TextInput
                  placeholder="Write a reply..."
                  value={replyTextMap[item.id] || ''}
                  onChangeText={(t) => setReplyTextMap((m) => ({ ...m, [item.id]: t }))}
                  style={{ flex: 1, borderWidth: 1, borderColor: '#e6e7ea', borderRadius: 8, padding: 8, marginRight: 8 }}
                />
                <TouchableOpacity onPress={async () => {
                  const t = (replyTextMap[item.id] || '').trim();
                  if (!t) return;
                  try {
                    await replyToComment(postId, item.id, { body: t, author: { id: user?.id, name: user?.name } });
                    setReplyTextMap((m) => ({ ...m, [item.id]: '' }));
                    setOpenReplyFor(null);
                  } catch (e) { console.warn(e); }
                }} style={{ backgroundColor: '#0066FF', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 }}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Send</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
                )}
                ListEmptyComponent={<Text style={{ padding: 12, color: '#6b7280' }}>No comments yet — be the first to reply.</Text>}
              />

            <View style={styles.composer}>
              <TextInput
                ref={composerRef}
                placeholder="Write a comment..."
                value={text}
                onChangeText={setText}
                style={styles.input}
                multiline
              />
              <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={sending || !text.trim()}>
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Send</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
      {showUserModal && selectedUser && (
        <Modal transparent visible animationType="fade">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' }}>
            <TouchableWithoutFeedback onPress={() => setShowUserModal(false)}>
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            </TouchableWithoutFeedback>
            <View style={{ width: '90%', backgroundColor: '#fff', padding: 14, borderRadius: 10, alignItems: 'center' }}>
                <Image source={{ uri: (selectedUser?.avatar && !String(selectedUser.avatar).includes('pravatar.cc')) ? selectedUser.avatar : pravatarUriFor(selectedUser, 120) }} style={{ width: 120, height: 120, borderRadius: 60, marginBottom: 12 }} />
              <Text style={{ fontWeight: '700', fontSize: 18, marginBottom: 6 }}>{selectedUser.name || 'Unknown'}</Text>
              {selectedUser.email && selectedUser.showEmail !== false ? (
                <Text style={{ color: '#374151', marginBottom: 4 }}>{selectedUser.email}</Text>
              ) : null}
              {selectedUser.phone && selectedUser.showPhone !== false ? (
                <Text style={{ color: '#374151', marginBottom: 8 }}>{selectedUser.phone}</Text>
              ) : null}
              <View style={{ flexDirection: 'row', marginTop: 8 }}>
                {selectedUser.phone && selectedUser.showPhone !== false ? (
                  <TouchableOpacity onPress={() => Linking.openURL(`tel:${selectedUser.phone}`)} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#0066FF', marginRight: 8 }}>
                    <Text style={{ color: '#fff' }}>Call</Text>
                  </TouchableOpacity>
                ) : null}
                {selectedUser.email && selectedUser.showEmail !== false ? (
                  <TouchableOpacity onPress={() => Linking.openURL(`mailto:${selectedUser.email}`)} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#10B981', marginRight: 8 }}>
                    <Text style={{ color: '#fff' }}>Email</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity onPress={() => setShowUserModal(false)} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#f3f4f6' }}>
                  <Text>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  commentRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#fff' },
  commentAuthor: { fontWeight: '700', marginBottom: 4 },
  commentBody: { color: '#374151' },
  composer: { flexDirection: 'row', padding: 10, backgroundColor: '#fff', alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: '#e6e7ea', borderRadius: 8, padding: 8, marginRight: 8, minHeight: 40 },
  sendBtn: { backgroundColor: '#0066FF', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
});
