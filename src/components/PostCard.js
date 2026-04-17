import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MaterialIcons } from '@expo/vector-icons';
import { Ionicons } from '@expo/vector-icons';
import * as Api from '../Api';
import { logPress } from '../utils/logger';
import { pravatarUriFor } from '../utils/idVisibility';

function detectFirstUrl(text) {
  const re = /(https?:\/\/[^\s]+)/i;
  const m = text && text.match(re);
  return m ? m[0] : null;
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export default function PostCard({ post, onLike, onComment, onShare, onAvatarPress }) {
  const [preview, setPreview] = useState(null);

  const avatarUri = post?.author?.avatar ? post.author.avatar : pravatarUriFor(post?.author, 100);

  useEffect(() => {
    const url = detectFirstUrl(post.body || '');
    let mounted = true;
    if (url) {
      Api.getLinkPreview(url).then((d) => { if (mounted) setPreview(d); }).catch(() => {});
    }
    return () => { mounted = false; };
  }, [post.body]);

  return (
    <View style={pcStyles.card}>
      <View style={pcStyles.header}>
        <TouchableOpacity onPress={() => { logPress('PostCard:Avatar', { postId: post?.id, authorId: post?.author?.id }); onAvatarPress && onAvatarPress(post.author); }}>
          <Image source={{ uri: avatarUri }} style={pcStyles.avatar} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={pcStyles.author}>{post.author?.name || 'Anonymous'}</Text>
          <Text style={pcStyles.time}>{timeAgo(post.createdAt)}</Text>
        </View>
      </View>

      {post.title ? <Text style={pcStyles.title}>{post.title}</Text> : null}
      {post.body ? <Text style={pcStyles.body}>{post.body}</Text> : null}

      {post.image ? <Image source={{ uri: post.image }} style={pcStyles.image} resizeMode="cover" /> : null}

      {preview ? (
        <View style={pcStyles.preview}>
          <Text style={pcStyles.previewTitle}>{preview.title}</Text>
          <Text style={pcStyles.previewDesc}>{preview.description}</Text>
        </View>
      ) : null}

      <View style={pcStyles.actions}>
        <Pressable
          onPress={() => { logPress('PostCard:Like', { postId: post?.id }); onLike && onLike(post); }}
          android_ripple={{ color: '#e6eef6' }}
          style={({ pressed }) => [pcStyles.actionBtn, pressed && pcStyles.actionBtnPressed]}
        >
          <MaterialCommunityIcons name="thumb-up-outline" size={18} color="#444" />
          <Text style={pcStyles.actionText}> {post.likes || 0}</Text>
        </Pressable>
        <Pressable
          onPress={() => { logPress('PostCard:Comment', { postId: post?.id }); onComment && onComment(post); }}
          android_ripple={{ color: '#e6eef6' }}
          style={({ pressed }) => [pcStyles.actionBtn, pressed && pcStyles.actionBtnPressed]}
        >
          <MaterialIcons name="comment" size={18} color="#444" />
          <Text style={pcStyles.actionText}> {(post.comments || []).length}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const pcStyles = StyleSheet.create({
  card: { marginTop: 12, padding: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 10 },
  author: { fontWeight: '700' },
  time: { color: '#6b7280', fontSize: 12 },
  title: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  body: { marginTop: 6, color: '#374151' },
  image: { height: 180, marginTop: 8, borderRadius: 6 },
  preview: { padding: 8, borderWidth: 1, borderColor: '#e6e7ea', backgroundColor: '#f8fafc', marginTop: 8 },
  previewTitle: { fontWeight: '700' },
  previewDesc: { fontSize: 12, color: '#6b7280' },
  actions: { flexDirection: 'row', marginTop: 10, justifyContent: 'space-evenly' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#fff', marginHorizontal: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 1.5, elevation: 2 },
  actionText: { color: '#374151', marginLeft: 4 },
  actionBtnPressed: {
    transform: [{ translateY: 1 }],
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 0.5,
    elevation: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
});
