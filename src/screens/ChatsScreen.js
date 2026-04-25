import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, Alert, Platform, ToastAndroid, Animated, RefreshControl } from 'react-native';
import { useData } from '../DataContext';
import { useAuth } from '../AuthContext';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { MaterialIcons } from '@expo/vector-icons';
import { logPress } from '../utils/logger';
import { HelpButton, LogoutButton } from '../components/TopButtons';

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

function MessageRow({ item, user, navigation, archiveThread, deleteThread }) {
  const swipeableRef = useRef(null);
  const last = item.last || {};
  const isOutgoing = last.sender && user && last.sender.id === user.id;
  const isUnread = !!item.isUnread;

  const showToast = (msg) => {
    if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
    else Alert.alert(msg);
  };

  const handleOpen = (direction) => {
    // NOTE: direction indicates which side opened. Map actions to match labels:
    // when left actions are opened -> perform Archive; when right opened -> perform Delete.
    if (direction === 'left') {
      // left actions opened
      archiveThread(item.id);
      showToast('Archived');
    } else {
      // right actions opened
      deleteThread(item.id);
      showToast('Deleted');
    }
    try { swipeableRef.current?.close(); } catch (e) {}
  };

  const renderLeftActions = (progress) => {
    const opacity = (progress && progress.interpolate) ? progress.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) : (progress || 1);
    return (
      <Animated.View style={{ backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center', width: 120, opacity }}>
        <TouchableOpacity onPress={() => { archiveThread(item.id); showToast('Archived'); try { swipeableRef.current?.close(); } catch (e) {} }} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Archive</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderRightActions = (progress) => {
    const opacity = (progress && progress.interpolate) ? progress.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) : (progress || 1);
    return (
      <Animated.View style={{ backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center', width: 120, opacity }}>
        <TouchableOpacity onPress={() => { deleteThread(item.id); showToast('Deleted'); try { swipeableRef.current?.close(); } catch (e) {} }} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <Swipeable ref={swipeableRef} renderLeftActions={renderLeftActions} renderRightActions={renderRightActions} onSwipeableOpen={handleOpen}>
      <TouchableOpacity style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', alignItems: 'center', backgroundColor: isUnread ? '#f8fbff' : '#fff' }} onPress={() => navigation.navigate('ChatThread', { threadId: item.id })}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          <Text style={{ fontWeight: '700' }}>{(item.title || 'C').slice(0,1)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
              {isUnread ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#2563eb', marginRight: 8 }} /> : null}
              <Text numberOfLines={1} style={{ fontWeight: isUnread ? '800' : '700', flexShrink: 1 }}>{item.title}</Text>
            </View>
            <Text style={{ color: isUnread ? '#2563eb' : '#6b7280', fontSize: 12, fontWeight: isUnread ? '700' : '500' }}>{timeAgo(last.createdAt)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            <Text style={{ marginRight: 8 }}>{isOutgoing ? '→' : '←'}</Text>
            <Text numberOfLines={1} style={{ color: '#374151', flex: 1, fontWeight: isUnread ? '700' : '400' }}>{last.body}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

import { ScreenWrapper, CenteredContainer, WebColumns, WebStickySection, WebSurface } from '../components/ScreenWrapper';

export default function ChatsScreen({ navigation }) {
  const { messages, fetchAndSync, clearMessages, archiveThread, deleteThread, archivedThreads, threadReads = {} } = useData();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [dateFilterDays, setDateFilterDays] = useState(null); // null => no filter
  const isWeb = Platform.OS === 'web';

  // Ensure the native stack header buttons are reset (Fast Refresh can preserve prior setOptions).
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: Platform.OS === 'web' ? undefined : () => <HelpButton />,
      headerRight: Platform.OS === 'web' ? undefined : () => <LogoutButton />,
    });
  }, [navigation]);

  // Group by threadId (fallback to id)
  const threads = (messages || []).reduce((acc, msg) => {
    const key = msg.threadId || msg.threadId === 0 ? msg.threadId : msg.threadId || msg.id || msg.contactId || 'default';
    acc[key] = acc[key] || { id: key, last: msg, participants: new Set() };
    // track participants
    if (msg.sender) acc[key].participants.add(msg.sender.name || msg.sender.id || '');
    if (msg.to && Array.isArray(msg.to)) msg.to.forEach(t => acc[key].participants.add(t.name || t.id || ''));
    if (new Date(msg.createdAt) > new Date(acc[key].last.createdAt)) acc[key].last = msg;
    return acc;
  }, {});

  const list = Object.values(threads).map((t) => {
    const latestIncomingAt = (messages || [])
      .filter((m) => String(m.threadId || m.id) === String(t.id))
      .filter((m) => String(m.sender?.id || '') !== String(user?.id || ''))
      .reduce((latest, message) => {
        const messageMs = Date.parse(String(message?.createdAt || ''));
        return Number.isFinite(messageMs) && messageMs > latest ? messageMs : latest;
      }, 0);
    const readAtMs = Date.parse(String(threadReads?.[String(t.id)] || ''));
    const isUnread = latestIncomingAt > 0 && (!Number.isFinite(readAtMs) || latestIncomingAt > readAtMs);
    return {
      id: t.id,
      last: t.last,
      title: Array.from(t.participants).filter(Boolean).slice(0,2).join(', ') || (t.last.sender?.name || 'Conversation'),
      participants: Array.from(t.participants).filter(Boolean),
      isUnread,
    };
  });

  // enforce access: non-admin users only see threads where they are a participant
  const visibleList = (user && (user.role === 'admin' || user.role === 'ADMIN')) ? list : list.filter(l => {
    if (!user) return false;
    // try matching by id or name
    return (l.participants || []).some(p => p.toString().toLowerCase().includes((user.id || user.name || '').toString().toLowerCase()));
  });

  // remove archived threads from visible list
  const unarchivedList = (visibleList || []).filter(l => !(archivedThreads || []).includes(l.id));
  const displayList = ((dateFilterDays && Number(dateFilterDays) > 0)
    ? (unarchivedList || []).filter((t) => {
        const iso = t?.last?.createdAt;
        if (!iso) return true;
        const ts = new Date(iso).getTime();
        if (!Number.isFinite(ts)) return true;
        const cutoff = Date.now() - (Number(dateFilterDays) * 24 * 60 * 60 * 1000);
        return ts >= cutoff;
      })
    : unarchivedList)
    .slice()
    .sort((a, b) => {
      if (!!a?.isUnread !== !!b?.isUnread) return a?.isUnread ? -1 : 1;
      const aTs = Date.parse(String(a?.last?.createdAt || ''));
      const bTs = Date.parse(String(b?.last?.createdAt || ''));
      if (!Number.isFinite(aTs) && !Number.isFinite(bTs)) return 0;
      if (!Number.isFinite(aTs)) return 1;
      if (!Number.isFinite(bTs)) return -1;
      return bTs - aTs;
    });
  const unreadCount = displayList.filter((item) => item?.isUnread).length;

  async function onRefresh() {
    try { setRefreshing(true); await fetchAndSync({ force: true }); } catch (e) {} finally { setRefreshing(false); }
  }

  function HeaderIconButton({ name, onPress, accessibilityLabel, active }) {
    return (
      <TouchableOpacity
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        style={{
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: '#e6eef8',
          backgroundColor: '#fff',
        }}
      >
        <MaterialIcons name={name} size={20} color={active ? '#2563eb' : '#111827'} />
      </TouchableOpacity>
    );
  }

  const openDateFilter = () => {
    logPress('Chats:OpenDateFilter');
    Alert.alert(
      'Filter by date',
      'Show conversations from the last…',
      [
        { text: '3 days', onPress: () => { logPress('Chats:DateFilter', { days: 3 }); setDateFilterDays(3); } },
        { text: '7 days', onPress: () => { logPress('Chats:DateFilter', { days: 7 }); setDateFilterDays(7); } },
        { text: '30 days', onPress: () => { logPress('Chats:DateFilter', { days: 30 }); setDateFilterDays(30); } },
        { text: 'Off', onPress: () => { logPress('Chats:DateFilter', { days: null }); setDateFilterDays(null); } },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const startNewMessage = () => {
    logPress('Chats:NewMessage');
    navigation.navigate('NewThread');
  };

  return (
    <ScreenWrapper
      bannerShowBack={false}
      bannerLeft={(
        <HeaderIconButton
          name="filter-list"
          active={!!dateFilterDays}
          accessibilityLabel={dateFilterDays ? `Filter: last ${dateFilterDays} days` : 'Filter: off'}
          onPress={openDateFilter}
        />
      )}
      bannerRight={(
        <HeaderIconButton
          name="add"
          accessibilityLabel="New message"
          onPress={startNewMessage}
        />
      )}
    >
      <CenteredContainer contentStyle={isWeb ? { maxWidth: 1120 } : null}>
        {isWeb ? (
          <WebColumns
            left={(
              <WebStickySection>
                <WebSurface>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a' }}>Inbox</Text>
                  <Text style={{ marginTop: 6, color: '#64748b' }}>Unread messages stay pinned to the top so follow-up work is obvious.</Text>
                  <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: '#eef2f7' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}>
                      <Text style={{ color: '#475569', fontWeight: '600' }}>Unread</Text>
                      <Text style={{ color: '#0f172a', fontWeight: '800' }}>{unreadCount}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#eef2f7' }}>
                      <Text style={{ color: '#475569', fontWeight: '600' }}>Visible threads</Text>
                      <Text style={{ color: '#0f172a', fontWeight: '800' }}>{displayList.length}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#eef2f7' }}>
                      <Text style={{ color: '#475569', fontWeight: '600' }}>Archived</Text>
                      <Text style={{ color: '#0f172a', fontWeight: '800' }}>{(archivedThreads || []).length}</Text>
                    </View>
                  </View>
                </WebSurface>
              </WebStickySection>
            )}
            main={(
              <WebSurface style={{ padding: 0, overflow: 'hidden' }}>
                <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#eef2f7' }}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#0f172a' }}>Messages</Text>
                  <Text style={{ marginTop: 4, color: '#64748b' }}>{dateFilterDays ? `Showing threads active in the last ${dateFilterDays} days.` : 'Recent conversations across your organization.'}</Text>
                </View>
                <FlatList
                  style={{ width: '100%' }}
                  data={displayList}
                  keyExtractor={(i) => `${i.id}`}
                  renderItem={({ item }) => (
                    <MessageRow item={item} user={user} navigation={navigation} archiveThread={archiveThread} deleteThread={deleteThread} />
                  )}
                  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                  ListEmptyComponent={(
                    <View style={{ padding: 24, alignItems: 'center' }}>
                      <Text style={{ color: '#6b7280' }}>
                        {dateFilterDays ? `No conversations in last ${dateFilterDays} days.` : 'No conversations yet.'}
                      </Text>
                    </View>
                  )}
                />
              </WebSurface>
            )}
            right={(
              <WebStickySection>
                <WebSurface compact>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>Workflow</Text>
                  <Text style={{ marginTop: 10, color: '#475569', lineHeight: 20 }}>Use the filter button to narrow the inbox, and archive threads once the follow-up is complete.</Text>
                  <TouchableOpacity onPress={startNewMessage} style={{ marginTop: 14, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#dbeafe' }}>
                    <Text style={{ color: '#1d4ed8', fontWeight: '800' }}>Start a new message</Text>
                  </TouchableOpacity>
                </WebSurface>
              </WebStickySection>
            )}
          />
        ) : (
          <View style={{ width: '100%', backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' }}>
            {/* Dev buttons moved to DevRoleSwitcher */}
            <FlatList
              style={{ width: '100%' }}
              data={displayList}
              keyExtractor={(i) => `${i.id}`}
              renderItem={({ item }) => (
                <MessageRow item={item} user={user} navigation={navigation} archiveThread={archiveThread} deleteThread={deleteThread} />
              )}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            />
            {(!displayList || displayList.length === 0) && (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: '#6b7280' }}>
                  {dateFilterDays ? `No conversations in last ${dateFilterDays} days.` : 'No conversations yet.'}
                </Text>
              </View>
            )}
          </View>
        )}
      </CenteredContainer>
    </ScreenWrapper>
  );
}
