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
      <TouchableOpacity style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', alignItems: 'center' }} onPress={() => navigation.navigate('ChatThread', { threadId: item.id })}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          <Text style={{ fontWeight: '700' }}>{(item.title || 'C').slice(0,1)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontWeight: '700' }}>{item.title}</Text>
            <Text style={{ color: '#6b7280', fontSize: 12 }}>{timeAgo(last.createdAt)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            <Text style={{ marginRight: 8 }}>{isOutgoing ? '→' : '←'}</Text>
            <Text numberOfLines={1} style={{ color: '#374151', flex: 1 }}>{last.body}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

import { ScreenWrapper, CenteredContainer } from '../components/ScreenWrapper';

export default function ChatsScreen({ navigation }) {
  const { messages, fetchAndSync, clearMessages, archiveThread, deleteThread, archivedThreads } = useData();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [dateFilterDays, setDateFilterDays] = useState(null); // null => no filter

  // Ensure the native stack header buttons are reset (Fast Refresh can preserve prior setOptions).
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => <HelpButton />,
      headerRight: () => <LogoutButton />,
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

  const list = Object.values(threads).map((t) => ({
    id: t.id,
    last: t.last,
    title: Array.from(t.participants).filter(Boolean).slice(0,2).join(', ') || (t.last.sender?.name || 'Conversation'),
    participants: Array.from(t.participants).filter(Boolean),
  }));

  // enforce access: non-admin users only see threads where they are a participant
  const visibleList = (user && (user.role === 'admin' || user.role === 'ADMIN')) ? list : list.filter(l => {
    if (!user) return false;
    // try matching by id or name
    return (l.participants || []).some(p => p.toString().toLowerCase().includes((user.id || user.name || '').toString().toLowerCase()));
  });

  // remove archived threads from visible list
  const unarchivedList = (visibleList || []).filter(l => !(archivedThreads || []).includes(l.id));
  const displayList = (dateFilterDays && Number(dateFilterDays) > 0)
    ? (unarchivedList || []).filter((t) => {
        const iso = t?.last?.createdAt;
        if (!iso) return true;
        const ts = new Date(iso).getTime();
        if (!Number.isFinite(ts)) return true;
        const cutoff = Date.now() - (Number(dateFilterDays) * 24 * 60 * 60 * 1000);
        return ts >= cutoff;
      })
    : unarchivedList;

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
      <CenteredContainer>
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
      </CenteredContainer>
    </ScreenWrapper>
  );
}
