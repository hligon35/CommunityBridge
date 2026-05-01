import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, FlatList, Image, TouchableOpacity, ActivityIndicator, StyleSheet, Modal, Alert, TouchableWithoutFeedback, Linking, Platform, Share, RefreshControl, Keyboard } from 'react-native';
import { ScreenWrapper, CenteredContainer, WebColumns, WebStickySection, WebSurface } from '../components/ScreenWrapper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
const IMAGE_PICKER_MEDIA_TYPES = ImagePicker.MediaTypeOptions?.Images ?? ImagePicker.MediaType?.Images;

import { useAuth } from '../AuthContext';
import { useNavigation } from '@react-navigation/native';
import { useData } from '../DataContext';
import { avatarSourceFor } from '../utils/idVisibility';
import * as Api from '../Api';
import PostCard from '../components/PostCard';
import { MaterialIcons } from '@expo/vector-icons';
import { Ionicons } from '@expo/vector-icons';
import { applyCurrentUserPrivacySettings } from '../utils/appSettings';
import { normalizeWebsiteInput, presetWebsiteInput } from '../utils/inputFormat';

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
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 1.5,
        elevation: 2,
      },
      default: null,
    }),
  },
  postButtonCompact: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    ...Platform.select({
      web: {
        borderRadius: 8,
        backgroundColor: '#0066FF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 2,
        elevation: 3,
      },
      default: null,
    }),
  },
  postButtonLabelCompact: { color: '#fff', fontWeight: '700' },
  previewImageCompact: { height: 80, width: 120, marginLeft: 6, borderRadius: 6 },
  leftColumn: { width: 72, alignItems: 'center', marginRight: 10, justifyContent: 'center' },
  buttonsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  buttonsRowCentered: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  iconBox: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4, backgroundColor: 'transparent', ...Platform.select({ web: { borderRadius: 8, borderWidth: 1, borderColor: '#e6e7ea', backgroundColor: '#fff' }, default: null }) },
  iconBoxPrimary: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4, backgroundColor: 'transparent', ...Platform.select({ web: { borderRadius: 8, backgroundColor: '#0066FF' }, default: null }) },
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
  const isWeb = Platform.OS === 'web';
  const displayedPosts = React.useMemo(() => (posts || []), [posts]);
  const feedItems = React.useMemo(() => {
    const items = [{ __type: 'composer', id: '__composer__' }];
    const hasPosts = Array.isArray(displayedPosts) && displayedPosts.length > 0;
    if (!hasPosts) items.push({ __type: 'empty', id: '__empty__' });
    if (hasPosts) items.push(...displayedPosts);
    return items;
  }, [displayedPosts]);

  React.useEffect(() => {
    try {
      console.log('HomeScreen: posts updated', (posts || []).length, (posts && posts[0] && (posts[0].body || posts[0].text || posts[0].title)));
    } catch (e) {}
  }, [posts]);

  const quickStats = React.useMemo(() => ([
    { label: 'Posts', value: displayedPosts.length },
    { label: 'Students', value: (children || []).length },
    { label: 'Staff', value: (therapists || []).length },
  ]), [children, displayedPosts.length, therapists]);

  async function onRefresh() {
    try {
      setRefreshing(true);
      await fetchAndSync({ force: true });
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
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: IMAGE_PICKER_MEDIA_TYPES, quality: 0.7 });
      if (!res?.canceled && !res?.cancelled) {
        const asset = Array.isArray(res?.assets) ? res.assets[0] : null;
        const uri = asset?.uri || res?.uri || '';
        if (!uri) return;
        setImage(uri);
        // close modal after a successful pick
        setShowLinkModal(false);
      }
    } catch (e) {
      console.warn('Image pick failed', e?.message || e);
    }
  }

  function onAttachPress() {
    // open modal offering link input or photo selection
    setLinkInput((current) => presetWebsiteInput(current));
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
      if (post?.id) {
        try {
          await recordShare(post.id);
        } catch (recordError) {
          console.warn('share metric failed', recordError?.message || recordError);
        }
      }
    } catch (e) {
      Alert.alert('Unable to open Messages', 'Your device could not open the messages app.');
    }
    setShareModalVisible(false);
    setShareTargetPost(null);
  }

  async function handleShareViaEmail(post) {
    try {
      const subject = encodeURIComponent(post.title || 'Shared post');
      const body = encodeURIComponent((post.title ? `${post.title}\n\n` : '') + (post.body || '') + (post.image ? `\n\n${post.image}` : ''));
      const url = `mailto:?subject=${subject}&body=${body}`;
      await Linking.openURL(url);
      if (post?.id) {
        try {
          await recordShare(post.id);
        } catch (recordError) {
          console.warn('share metric failed', recordError?.message || recordError);
        }
      }
    } catch (e) {
      Alert.alert('Unable to open Email', 'Your device could not open the email app.');
    }
    setShareModalVisible(false);
    setShareTargetPost(null);
  }

  async function handleShareMore(post) {
    try {
      const message = post.title ? `${post.title}\n\n${post.body || ''}` : (post.body || '');
      await Share.share({ message, url: post.image, title: post.title || 'Post' });
      try {
        await recordShare(post.id);
      } catch (recordError) {
        console.warn('share metric failed', recordError?.message || recordError);
      }
    } catch (e) {
      Alert.alert('Share failed', e?.message || 'Unable to open the share sheet.');
    }
    setShareModalVisible(false);
    setShareTargetPost(null);
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
      Alert.alert('Post failed', e?.message || 'Unable to publish this post right now.');
    } finally {
      setLoading(false);
    }
  }

  const renderComposer = () => (
    <>
      {isWeb ? (
        <WebSurface style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#0f172a' }}>Post Board</Text>
          <Text style={{ marginTop: 6, marginBottom: 14, color: '#64748b' }}>Share updates, reminders, and media with your community.</Text>
          <View style={[styles.inputTileCompact, { marginTop: 0, marginBottom: 0, backgroundColor: 'transparent', paddingHorizontal: 0, paddingVertical: 0 }]}> 
            <Image source={avatarSourceFor(user)} style={styles.inputAvatarCompact} />
            <TextInput
              placeholder="Share something..."
              value={body}
              onChangeText={setBody}
              style={[styles.inputTextCompact, { flex: 1, marginHorizontal: 8, minHeight: 52 }]}
              multiline
            />
            <TouchableOpacity style={[styles.pickButtonCompact, { width: 44, height: 44 }]} onPress={onAttachPress} accessibilityLabel="Attach">
              <MaterialIcons name="attach-file" size={20} color="#444" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.postButtonCompact, { width: 44, height: 44 }]} onPress={handlePost} accessibilityLabel="Post">
              <Ionicons name="send" size={18} color={isWeb ? '#fff' : '#0066FF'} />
            </TouchableOpacity>
          </View>
        </WebSurface>
      ) : (
        <View>
          <View style={{ width: '100%', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#fff', alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '700' }}>Post Board</Text>
          </View>
          <View style={styles.inputTileCompact}>
            <Image source={avatarSourceFor(user)} style={styles.inputAvatarCompact} />
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
              <Ionicons name="send" size={18} color={isWeb ? '#fff' : '#0066FF'} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );

  const renderFeedItem = ({ item }) => (
    <PostCard
      post={item}
      onLike={() => like(item.id)}
      onComment={() => navigation.navigate('PostThread', { postId: item.id })}
      onShare={() => openShareModal(item)}
      onAvatarPress={async (author) => {
        let full = author || {};
        const tryFind = (list) => (list || []).find((u) => (u.id && full.id && u.id === full.id) || (u.name && full.name && u.name === full.name));
        const found = tryFind(children) || tryFind(therapists);
        if (found) full = { ...found, ...full };
        full = await applyCurrentUserPrivacySettings(full, user);
        setSelectedUser(full);
        setShowUserModal(true);
      }}
    />
  );

  return (
    <ScreenWrapper bannerShowBack={false} hideBanner={true}>
      <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
        <CenteredContainer contentStyle={isWeb ? { maxWidth: 1120 } : null}>
          {isWeb ? (
            <WebColumns
              left={(
                <WebStickySection>
                  <WebSurface>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                      <Image source={avatarSourceFor(user)} style={{ width: 64, height: 64, borderRadius: 32, marginRight: 12 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a' }}>{user?.name || 'Community Member'}</Text>
                        <Text style={{ color: '#64748b', marginTop: 4 }}>{user?.email || 'Signed in'}</Text>
                      </View>
                    </View>
                    {quickStats.map((stat) => (
                      <View key={stat.label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#eef2f7' }}>
                        <Text style={{ color: '#475569', fontWeight: '600' }}>{stat.label}</Text>
                        <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '800' }}>{stat.value}</Text>
                      </View>
                    ))}
                  </WebSurface>
                </WebStickySection>
              )}
              main={(
                <View>
                  {renderComposer()}
                  <WebSurface style={{ padding: 0, overflow: 'hidden' }}>
                    <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#eef2f7' }}>
                      <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a' }}>Community Feed</Text>
                      <Text style={{ marginTop: 4, color: '#64748b' }}>Recent updates, classroom notes, and announcements.</Text>
                    </View>
                    <FlatList
                      data={displayedPosts}
                      onTouchStart={() => Keyboard.dismiss()}
                      keyExtractor={(i) => String(i.id)}
                      keyboardShouldPersistTaps="handled"
                      keyboardDismissMode="on-drag"
                      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                      renderItem={renderFeedItem}
                      ListEmptyComponent={<View style={{ padding: 24, alignItems: 'center' }}><Text style={{ fontSize: 15, color: '#6b7280' }}>No posts yet. Start the conversation above.</Text></View>}
                    />
                  </WebSurface>
                </View>
              )}
              right={(
                <WebStickySection>
                  <WebSurface compact>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>Quick Actions</Text>
                    <TouchableOpacity style={{ marginTop: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#dbeafe' }} onPress={() => navigation.navigate('Chats')}>
                      <Text style={{ color: '#1d4ed8', fontWeight: '800' }}>Open messages</Text>
                      <Text style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>Jump into conversations and follow-ups.</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={{ marginTop: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' }} onPress={() => navigation.navigate('Settings')}>
                      <Text style={{ color: '#0f172a', fontWeight: '800' }}>Profile settings</Text>
                      <Text style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>Adjust notifications, privacy, and account settings.</Text>
                    </TouchableOpacity>
                  </WebSurface>
                  <WebSurface compact style={{ marginTop: 16 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>Feed Tips</Text>
                    <Text style={{ marginTop: 10, color: '#475569', lineHeight: 20 }}>Keep posts short and specific. Use attachments for forms or images, and direct messages for one-to-one follow-up.</Text>
                  </WebSurface>
                </WebStickySection>
              )}
            />
          ) : (
            <FlatList
              data={feedItems}
              onTouchStart={() => Keyboard.dismiss()}
              keyExtractor={(i, index) => (i && i.id ? String(i.id) : `idx-${index}-${i?.__type || ''}`)}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              renderItem={({ item }) => (
                item?.__type === 'composer' ? renderComposer() : item?.__type === 'empty' ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, color: '#6b7280' }}>No posts yet...</Text>
                  </View>
                ) : renderFeedItem({ item })
              )}
            />
          )}
      {/* Modals moved outside the header so they don't become sticky */}
      {showLinkModal && (
        <Modal transparent visible animationType="fade">
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setShowLinkModal(false)}>
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            </TouchableWithoutFeedback>
            <View style={styles.modalContent}>
              <Text style={{ fontWeight: '700', marginBottom: 8 }}>Attach</Text>
              <TextInput
                placeholder="https://example.com"
                value={linkInput}
                onFocus={() => setLinkInput((current) => presetWebsiteInput(current))}
                onChangeText={(value) => setLinkInput(normalizeWebsiteInput(value))}
                style={styles.modalInput}
                autoCapitalize="none"
                keyboardType="url"
              />
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
              <Image source={avatarSourceFor(selectedUser)} style={{ width: 120, height: 120, borderRadius: 60, marginBottom: 12 }} />
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
