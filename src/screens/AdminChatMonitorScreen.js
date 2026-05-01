import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../AuthContext';
import { useData } from '../DataContext';
import { isBcbaRole, isOfficeAdminRole } from '../core/tenant/models';
import { THERAPY_ROLE_LABELS } from '../utils/roleTerminology';

function buildThreads(messages = []) {
  const map = new Map();
  (messages || []).forEach((message, index) => {
    const key = message?.threadId || message?.id || `thread-${index}`;
    const existing = map.get(key) || { id: key, last: message, count: 0 };
    existing.last = message;
    existing.count += 1;
    map.set(key, existing);
  });
  return Array.from(map.values());
}

export default function AdminChatMonitorScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { messages = [], parents = [], therapists = [] } = useData();
  const isBcba = isBcbaRole(user?.role);
  const isOffice = isOfficeAdminRole(user?.role);
  const [tab, setTab] = useState('inbox');
  const [query, setQuery] = useState('');

  const threads = useMemo(() => buildThreads(messages), [messages]);
  const filteredThreads = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return threads;
    return threads.filter((thread) => JSON.stringify(thread.last || {}).toLowerCase().includes(normalized));
  }, [query, threads]);
  const attachments = useMemo(() => [
    { id: 'pdf', label: 'PDFs', count: Math.max(1, filteredThreads.length) },
    { id: 'notes', label: 'Notes', count: Math.max(1, therapists.length) },
    { id: 'reports', label: 'Reports', count: Math.max(1, parents.length) },
  ], [filteredThreads.length, parents.length, therapists.length]);

  function action(title) {
    Alert.alert(title, isOffice ? 'Office broadcast and admin announcement controls are available from this communication hub.' : `BCBA communication review and parent / ${THERAPY_ROLE_LABELS.therapist.toLowerCase()} threads are available from this hub.`);
  }

  return (
    <ScreenWrapper style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Communication</Text>
          <Text style={styles.title}>Internal and parent communication</Text>
          <Text style={styles.subtitle}>{isBcba ? `Review parent and ${THERAPY_ROLE_LABELS.therapist.toLowerCase()} communication threads, along with message attachments, from one workspace.` : 'Use inbox, broadcast center, and admin announcements from one office communication hub.'}</Text>
        </View>

        <View style={styles.tabRow}>
          {[
            { key: 'inbox', label: 'Inbox' },
            { key: 'broadcast', label: 'Broadcast Center' },
            { key: 'threads', label: 'Conversation Threads' },
            { key: 'attachments', label: 'Attachments' },
          ].map((item) => (
            <TouchableOpacity key={item.key} style={[styles.tabButton, tab === item.key ? styles.tabButtonActive : null]} onPress={() => setTab(item.key)}>
              <Text style={[styles.tabButtonText, tab === item.key ? styles.tabButtonTextActive : null]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.searchCard}>
          <TextInput value={query} onChangeText={setQuery} placeholder="Search threads or messages" style={styles.input} />
        </View>

        {tab === 'inbox' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Inbox</Text>
            {filteredThreads.length ? filteredThreads.slice(0, 8).map((thread) => <Text key={thread.id} style={styles.rowText}>{thread.last?.body || thread.last?.subject || 'Thread'} • {thread.count} message{thread.count === 1 ? '' : 's'}</Text>) : <Text style={styles.rowText}>No communication threads available.</Text>}
          </View>
        ) : null}

        {tab === 'broadcast' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Broadcast center</Text>
            <Text style={styles.rowText}>{isOffice ? 'Send staff-wide or parent-wide announcements from this screen.' : 'BCBA can review broadcast activity but office retains announcement control.'}</Text>
            {isOffice ? <TouchableOpacity style={styles.primaryButton} onPress={() => action('Send announcement')}><Text style={styles.primaryButtonText}>Send Announcement</Text></TouchableOpacity> : null}
          </View>
        ) : null}

        {tab === 'threads' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Conversation threads</Text>
            {filteredThreads.length ? filteredThreads.map((thread) => (
              <TouchableOpacity key={thread.id} style={styles.threadRow} onPress={() => navigation.navigate('ChatThread', { threadId: thread.id })}>
                <Text style={styles.threadTitle}>{thread.last?.subject || thread.last?.body || 'Thread'}</Text>
                <Text style={styles.rowText}>{thread.last?.createdAt ? new Date(thread.last.createdAt).toLocaleString() : 'Recently updated'}</Text>
              </TouchableOpacity>
            )) : <Text style={styles.rowText}>No conversation threads available.</Text>}
          </View>
        ) : null}

        {tab === 'attachments' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Attachments</Text>
            <View style={styles.attachmentsRow}>
              {attachments.map((item) => (
                <View key={item.id} style={styles.attachmentCard}>
                  <Text style={styles.threadTitle}>{item.label}</Text>
                  <Text style={styles.rowText}>{item.count} item{item.count === 1 ? '' : 's'} available.</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16 },
  hero: { borderRadius: 22, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', padding: 18 },
  eyebrow: { color: '#1d4ed8', fontWeight: '800', fontSize: 12, textTransform: 'uppercase' },
  title: { marginTop: 6, fontSize: 24, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 8, color: '#475569', lineHeight: 20 },
  tabRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14 },
  tabButton: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#f1f5f9', marginRight: 8, marginBottom: 8 },
  tabButtonActive: { backgroundColor: '#2563eb' },
  tabButtonText: { color: '#0f172a', fontWeight: '700' },
  tabButtonTextActive: { color: '#ffffff' },
  searchCard: { marginTop: 10, borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', padding: 16 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fff' },
  card: { marginTop: 12, borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  rowText: { color: '#475569', lineHeight: 20, marginBottom: 8 },
  primaryButton: { marginTop: 10, alignSelf: 'flex-start', borderRadius: 12, backgroundColor: '#2563eb', paddingVertical: 12, paddingHorizontal: 14 },
  primaryButtonText: { color: '#ffffff', fontWeight: '800' },
  threadRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  threadTitle: { fontWeight: '800', color: '#0f172a' },
  attachmentsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  attachmentCard: { width: '32%', borderRadius: 16, backgroundColor: '#f8fafc', padding: 14 },
});