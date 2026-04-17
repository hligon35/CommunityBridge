import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, FlatList, Image, TouchableOpacity, ActivityIndicator, StyleSheet, Modal, Alert, TouchableWithoutFeedback, Linking, Platform, Share, RefreshControl, Keyboard } from 'react-native';
import { ScreenWrapper, CenteredContainer } from '../components/ScreenWrapper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../AuthContext';
import { useNavigation } from '@react-navigation/native';
import { useData } from '../DataContext';
import devWallFlag from '../utils/devWallFlag';
import { pravatarUriFor } from '../utils/idVisibility';
import * as Api from '../Api';
import PostCard from '../components/PostCard';
import { MaterialIcons } from '@expo/vector-icons';
import { Ionicons } from '@expo/vector-icons';

// PostCard is now a shared component in ../components/PostCard

const styles = StyleSheet.create({
  card: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22, marginRight: 10 },
  author: { fontWeight: '700' },
  time: { color: '#6b7280', fontSize: 12 },
  title: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  body: { marginTop: 6, color: '#374151' },
  image: { height: 180, marginTop: 8, borderRadius: 6 },
  preview: { padding: 8, borderWidth: 1, borderColor: '#e6e7ea', backgroundColor: '#f8fafc', marginTop: 8 },
  previewTitle: { fontWeight: '700' },
  previewDesc: { fontSize: 12, color: '#6b7280' },
  actions: { flexDirection: 'row', marginTop: 10, justifyContent: 'space-around' },
  actionBtn: { flexDirection: 'row', alignItems: 'center' },
  actionText: { color: '#374151', marginLeft: 4 },
  inputTile: { flexDirection: 'row', padding: 10, backgroundColor: '#fff', margin: 12, borderRadius: 10, alignItems: 'flex-start' },
  inputAvatar: { width: 50, height: 50, borderRadius: 25, marginRight: 12 },
  inputTileCompact: { flexDirection: 'row', padding: 8, backgroundColor: '#fff', marginHorizontal: 0, marginTop: -9, marginBottom: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'space-between' },
  inputAvatarCompact: { width: 50, height: 50, borderRadius: 25 },
  inputFieldsCompact: { flex: 1 },
  inputTextCompact: { borderWidth: 1, borderColor: '#e6e7ea', borderRadius: 8, padding: 6, backgroundColor: '#fff', color: '#111', minHeight: 44 },
  postRowCompact: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  // square button for attach and post to match visually
  pickButtonCompact: {
    width: 40,
    height: 40,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    // subtle shadow / push look
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 1.5,
    elevation: 2,
  },
  postButtonCompact: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0066FF',
    // subtle shadow / push look
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 3,
  },
  postButtonLabelCompact: { color: '#fff', fontWeight: '700' },
  previewImageCompact: { height: 80, width: 120, marginLeft: 6, borderRadius: 6 },
  leftColumn: { width: 72, alignItems: 'center', marginRight: 10, justifyContent: 'center' },
  buttonsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  buttonsRowCentered: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  iconBox: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: '#e6e7ea', alignItems: 'center', justifyContent: 'center', marginHorizontal: 4, backgroundColor: '#fff' },
  iconBoxPrimary: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4, backgroundColor: '#0066FF' },
  iconButton: { padding: 8, alignItems: 'center', justifyContent: 'center' },
  inputFlex: { flex: 1, marginHorizontal: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '90%', backgroundColor: '#fff', padding: 14, borderRadius: 10 },
  modalInput: { borderWidth: 1, borderColor: '#e6e7ea', borderRadius: 8, padding: 8, marginTop: 6 },
  modalBtn: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center', marginHorizontal: 6 },
  modalOption: { paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#e6e7ea', backgroundColor: '#fff', borderRadius: 6 },
});

export default function HomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const { posts, createPost, like, comment, share, recordShare, fetchAndSync, children, therapists } = useData();
  const [showWall, setShowWall] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [linkMode, setLinkMode] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [shareTargetPost, setShareTargetPost] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const displayedPosts = React.useMemo(() => (posts || []), [posts]);
  const feedItems = React.useMemo(() => {
    const items = [{ __type: 'composer', id: '__composer__' }];
    const hasPosts = Array.isArray(displayedPosts) && displayedPosts.length > 0;
    if (!showWall || !hasPosts) items.push({ __type: 'empty', id: '__empty__' });
    if (showWall && hasPosts) items.push(...displayedPosts);
    return items;
  }, [displayedPosts, showWall]);

  React.useEffect(() => {
    try {
      console.log('HomeScreen: posts updated', (posts || []).length, (posts && posts[0] && (posts[0].body || posts[0].text || posts[0].title)));
    } catch (e) {}
  }, [posts]);

  useEffect(() => { fetchAndSync(); }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const v = await devWallFlag.get();
        if (!mounted) return;
        setShowWall(Boolean(v));
      } catch (e) {}
    })();
    const unsub = devWallFlag.addListener((v) => { if (mounted) setShowWall(Boolean(v)); });
    return () => { mounted = false; unsub(); };
  }, []);

  async function onRefresh() {
    try {
      setRefreshing(true);
      await fetchAndSync();
    } catch (e) {}
    setRefreshing(false);
  }

  async function pickImage() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission required', 'Please allow access to your photos to attach an image.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaType.Images, quality: 0.7 });
      if (!res.cancelled) {
        setImage(res.uri);
        // close modal after a successful pick
        setShowLinkModal(false);
      }
    } catch (e) {
      console.warn('Image pick failed', e?.message || e);
    }
  }

  function onAttachPress() {
    // open modal offering link input or photo selection
    setShowLinkModal(true);
  }

  function openShareModal(post) {
    setShareTargetPost(post);
    setShareModalVisible(true);
  }

  async function handleShareViaMessages(post) {
    try {
      const body = post.title ? `${post.title}\n\n${post.body || ''}` : (post.body || '');
      const encoded = encodeURIComponent(body);
      const scheme = Platform.OS === 'android' ? `sms:?body=${encoded}` : `sms:&body=${encoded}`;
      await Linking.openURL(scheme);
    } catch (e) {
      Alert.alert('Unable to open Messages', 'Your device could not open the messages app.');
    }
    setShareModalVisible(false);
    setShareTargetPost(null);
    // record the share (notify server) but don't open native share sheet
    if (post?.id) recordShare(post.id).catch(() => {});
  }

  async function handleShareViaEmail(post) {
    try {
      const subject = encodeURIComponent(post.title || 'Shared post');
      const body = encodeURIComponent((post.title ? `${post.title}\n\n` : '') + (post.body || '') + (post.image ? `\n\n${post.image}` : ''));
      const url = `mailto:?subject=${subject}&body=${body}`;
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('Unable to open Email', 'Your device could not open the email app.');
    }
    setShareModalVisible(false);
    setShareTargetPost(null);
    if (post?.id) recordShare(post.id).catch(() => {});
  }

  async function handleShareMore(post) {
    try {
      const message = post.title ? `${post.title}\n\n${post.body || ''}` : (post.body || '');
      await Share.share({ message, url: post.image, title: post.title || 'Post' });
    } catch (e) {
      console.warn('share more failed', e?.message || e);
    }
    setShareModalVisible(false);
    setShareTargetPost(null);
    // share() already opens share sheet and records count, but recordShare is safer if share fails
    try { await recordShare(post.id); } catch (e) {}
  }

  async function handlePost() {
    setLoading(true);
    try {
      let imageUrl = null;
      if (image) {
        const form = new FormData();
        const filename = image.split('/').pop();
        const match = filename.match(/\.(\w+)$/);
        const type = match ? `image/${match[1]}` : 'image';
        form.append('file', { uri: image, name: filename, type });
        const up = await Api.uploadMedia(form);
        imageUrl = up.url || up?.url;
      }
      const created = await createPost({ title, body, image: imageUrl });
      // Clear composer and dismiss keyboard after successful post
      setTitle(''); setBody(''); setImage(null);
      // iOS sometimes needs a short delay to process blur before dismissing keyboard
      setTimeout(() => Keyboard.dismiss(), 120);
      return created;
    } catch (e) {
      console.warn('post failed', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenWrapper bannerShowBack={false} hideBanner={true}>
      <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
        <CenteredContainer>
      <FlatList
        data={feedItems}
        onTouchStart={() => Keyboard.dismiss()}
        keyExtractor={(i) => (i && i.id ? String(i.id) : String(i?.__type || Math.random()))}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          item?.__type === 'composer' ? (
            <View>
              <View style={{ width: '100%', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#fff', alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '700' }}>Post Board</Text>
              </View>
              <View style={styles.inputTileCompact}>
                <Image source={{ uri: (user?.avatar && !String(user.avatar).includes('pravatar.cc')) ? user.avatar : pravatarUriFor(user, 80) }} style={styles.inputAvatarCompact} />

                <TextInput
                  placeholder="Share something..."
                  value={body}
                  onChangeText={setBody}
                  style={[styles.inputTextCompact, { flex: 1, marginHorizontal: 6 }]}
                  multiline
                />

                <TouchableOpacity style={styles.pickButtonCompact} onPress={onAttachPress} accessibilityLabel="Attach">
                  <MaterialIcons name="attach-file" size={20} color="#444" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.postButtonCompact} onPress={handlePost} accessibilityLabel="Post">
                  <Ionicons name="send" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          ) : item?.__type === 'empty' ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ fontSize: 16, color: '#6b7280' }}>No posts yet...</Text>
            </View>
          ) : (
            <PostCard
              post={item}
              onLike={() => like(item.id)}
              onComment={() => navigation.navigate('PostThread', { postId: item.id })}
              onShare={() => openShareModal(item)}
              onAvatarPress={async (author) => {
                // attempt to enrich author with known records (children/therapists)
                let full = author || {};
                const tryFind = (list) => (list || []).find((u) => (u.id && full.id && u.id === full.id) || (u.name && full.name && u.name === full.name));
                const found = tryFind(children) || tryFind(therapists);
                if (found) full = { ...found, ...full };
                // If the tapped user is the current user, respect local privacy settings persisted in AsyncStorage
                try {
                  const SHOW_EMAIL_KEY = 'settings_show_email_v1';
                  const SHOW_PHONE_KEY = 'settings_show_phone_v1';
                  if (full && user && full.id && user.id && full.id === user.id) {
                    const se = await AsyncStorage.getItem(SHOW_EMAIL_KEY);
                    const sp = await AsyncStorage.getItem(SHOW_PHONE_KEY);
                    if (se !== null) full.showEmail = (se === '1');
                    if (sp !== null) full.showPhone = (sp === '1');
                  }
                } catch (e) {
                  // ignore
                }
                setSelectedUser(full);
                setShowUserModal(true);
              }}
            />
          )
        )}
        
      />
      {/* Modals moved outside the header so they don't become sticky */}
      {showLinkModal && (
        <Modal transparent visible animationType="fade">
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setShowLinkModal(false)}>
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            </TouchableWithoutFeedback>
            <View style={styles.modalContent}>
              <Text style={{ fontWeight: '700', marginBottom: 8 }}>Attach</Text>
              <TextInput placeholder="Paste a link" value={linkInput} onChangeText={setLinkInput} style={styles.modalInput} />
              <View style={{ flexDirection: 'row', marginTop: 12 }}>
                <TouchableOpacity style={styles.modalBtn} onPress={() => { setLinkMode(true); setShowLinkModal(false); }}>
                  <Text>Use Link</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalBtn} onPress={() => { pickImage(); }}>
                  <Text>Pick Photo</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
      {/* User info modal shown when tapping a post avatar */}
      {showUserModal && selectedUser && (
        <Modal transparent visible animationType="fade">
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setShowUserModal(false)}>
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            </TouchableWithoutFeedback>
            <View style={[styles.modalContent, { alignItems: 'center' }]}>
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
      </CenteredContainer>
      </TouchableWithoutFeedback>
    </ScreenWrapper>
  );
}
