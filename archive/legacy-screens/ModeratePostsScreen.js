import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, TextInput, Image } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useData } from '../DataContext';
import { MaterialIcons } from '@expo/vector-icons';
// header provided by ScreenWrapper
import { ScreenWrapper } from '../components/ScreenWrapper';

const moderateIcon = require('../../assets/icons/moderate.png');

function PostRow({ item, onRemove, onBlock }) {
  return (
    <View style={styles.postRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{item.title || 'Untitled'}</Text>
        <Text style={styles.meta}>{item.author?.name || 'Unknown'} • {new Date(item.createdAt || Date.now()).toLocaleString()}</Text>
        {item.body ? <Text numberOfLines={2} style={styles.bodyText}>{item.body}</Text> : null}
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => onRemove(item.id)} style={styles.iconBtn}>
          <MaterialIcons name="delete" size={20} color="#dc2626" />
        </TouchableOpacity>
        {item.author && item.author.id ? (
          <TouchableOpacity onPress={() => onBlock(item.author.id, item.author.name)} style={styles.iconBtn}>
            <MaterialIcons name="block" size={20} color="#f97316" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export default function ModeratePostsScreen(){
  const route = useRoute();
  const navigation = useNavigation();
  const { posts = [], deletePost, blockUser, deleteComment } = useData();
  const { authorId, childId } = route.params || {};
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = (query || '').toString().toLowerCase().trim();
    let base = posts || [];
    if (authorId) base = base.filter(p => `${p.author?.id}` === `${authorId}` || `${p.author?.id}`.toLowerCase() === `${authorId}`.toLowerCase());
    if (childId) base = base.filter(p => `${p.childId || ''}` === `${childId}` || `${p.childId || ''}`.toLowerCase() === `${childId}`.toLowerCase());
    if (!q) return base;
    return base.filter(p => {
      const title = (p.title || '').toString().toLowerCase();
      const body = (p.body || '').toString().toLowerCase();
      const author = (p.author?.name || '').toString().toLowerCase();
      return title.includes(q) || body.includes(q) || author.includes(q);
    });
  }, [posts, query]);

  function handleRemove(id) {
    Alert.alert('Remove post', 'Are you sure you want to remove this post?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deletePost(id) }
    ]);
  }

  function handleBlock(authorId, authorName) {
    Alert.alert('Block user', `Block ${authorName || 'this user'}? This will remove their posts and messages locally.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => { blockUser(authorId); } }
    ]);
  }

  // When viewing a specific user's page, collect comments authored by that user across all posts
  const commentsByUser = useMemo(() => {
    if (!authorId) return [];
    const out = [];
    (posts || []).forEach((p) => {
      (p.comments || []).forEach((c) => {
        if (c.author && (`${c.author.id}` === `${authorId}` || `${c.author.name}` === `${authorId}`)) {
          out.push({ postId: p.id, comment: c, parentId: null });
        }
        (c.replies || []).forEach((r) => {
          if (r.author && (`${r.author.id}` === `${authorId}` || `${r.author.name}` === `${authorId}`)) {
            out.push({ postId: p.id, comment: r, parentId: c.id });
          }
        });
      });
    });
    return out;
  }, [posts, authorId]);

  return (
    <ScreenWrapper style={styles.container}>
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
          <View style={styles.headerRow}>
            <View style={styles.headerIconWrap}>
              <Image source={moderateIcon} style={styles.headerIconImage} resizeMode="contain" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Moderate Posts</Text>
              <Text style={styles.headerSubtitle}>Review posts, comments, and flagged activity.</Text>
            </View>
          </View>
          <TextInput placeholder="Search posts or author" value={query} onChangeText={setQuery} style={{ borderWidth: 1, borderColor: '#e5e7eb', padding: 8, borderRadius: 8 }} />
        </View>
        {authorId && commentsByUser && commentsByUser.length ? (
          <View style={{ paddingHorizontal: 12 }}>
            <Text style={{ fontWeight: '700', marginBottom: 8 }}>Comments by this user</Text>
            {commentsByUser.map((c) => (
              <View key={`${c.postId}-${c.comment.id}`} style={{ padding: 10, backgroundColor: '#fff', marginBottom: 8, borderRadius: 8 }}>
                <Text style={{ color: '#6b7280', marginBottom: 6 }}>On post: {c.postId}</Text>
                <Text style={{ marginBottom: 8 }}>{c.comment.body}</Text>
                <View style={{ flexDirection: 'row' }}>
                  <TouchableOpacity onPress={() => {
                    Alert.alert('Remove comment', 'Remove this comment?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => deleteComment(c.postId, c.comment.id, c.parentId) }
                    ]);
                  }} style={[styles.iconBtn, { marginRight: 8 }]}>
                    <MaterialIcons name="delete" size={20} color="#dc2626" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleBlock(c.comment.author?.id, c.comment.author?.name)} style={styles.iconBtn}>
                    <MaterialIcons name="block" size={20} color="#f97316" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <FlatList
          data={filtered || []}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => (
            <PostRow item={item} onRemove={handleRemove} onBlock={(id, name) => handleBlock(id, name)} />
          )}
          ListEmptyComponent={<View style={styles.body}><Text style={styles.p}>No posts available</Text></View>}
          contentContainerStyle={{ padding: 12 }}
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  body: { padding: 16 },
  p: { color: '#374151' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  headerIconWrap: { width: 54, height: 54, borderRadius: 14, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  headerIconImage: { width: 36, height: 36 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  headerSubtitle: { marginTop: 2, color: '#64748b', fontSize: 12 },
  postRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  title: { fontWeight: '700' },
  meta: { color: '#6b7280', marginTop: 4 },
  bodyText: { color: '#374151', marginTop: 6 },
  actions: { marginLeft: 12 },
  iconBtn: { padding: 8 }
});