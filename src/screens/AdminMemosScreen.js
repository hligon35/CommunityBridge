import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, Image, StyleSheet, Alert, ScrollView, TouchableWithoutFeedback } from 'react-native';
import { useData } from '../DataContext';
import { avatarSourceFor } from '../utils/idVisibility';
import ScreenHeader from '../components/ScreenHeader';

export default function AdminMemosScreen() {
  const { parents = [], therapists = [], sendAdminMemo } = useData();
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [typingStopped, setTypingStopped] = useState(true);
  const [debugLogs, setDebugLogs] = useState([]);
  const typingTimer = useRef(null);
  const blurTimer = useRef(null);
  const [searchLayout, setSearchLayout] = useState(null);
  const inputRef = useRef(null);

  const MESSAGE_HEIGHT = 120;
  // Increase dropdown height by additional 25% (total ~56% taller than message field)
  const DROPDOWN_HEIGHT = Math.round(MESSAGE_HEIGHT * 2.5);

  const allRecipients = useMemo(() => {
    const p = (parents || []).map((x) => ({ ...x, role: 'parent' }));
    const t = (therapists || []).map((x) => ({ ...x, role: 'therapist' }));
    return [...t, ...p];
  }, [parents, therapists]);

  // Filter recipients by name query
  const filteredRecipients = useMemo(() => {
    let list = allRecipients;
    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((r) => (`${r.firstName || ''} ${r.lastName || r.name || ''}`.toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q)));
    }
    return list;
  }, [allRecipients, query]);

  // detect exact match
  const exactMatch = useMemo(() => {
    const q = (query || '').trim().toLowerCase();
    if (!q) return false;
    return filteredRecipients.some((r) => ((r.name || `${r.firstName || ''} ${r.lastName || ''}`).toLowerCase().trim() === q));
  }, [filteredRecipients, query]);

  useEffect(() => {
    // typing detection: when query changes, consider user typing; when they stop for 700ms, mark stopped
    setTypingStopped(false);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => { setTypingStopped(true); }, 700);
    return () => { if (typingTimer.current) clearTimeout(typingTimer.current); };
  }, [query]);

  const dropdownVisible = ((isFocused && (!typingStopped || !query.trim())) && !exactMatch);

  function pushLog(msg) {
    try {
      const t = new Date().toLocaleTimeString();
      setDebugLogs((s) => [`${t} - ${msg}`, ...((s || []).slice(0, 49))]);
      console.log('AdminMemos-debug:', msg);
    } catch (e) { console.warn(e); }
  }

  const handleToggle = (id) => setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  // wrap toggle to log
  const handleToggleLogged = (id) => {
    pushLog(`toggle ${id}`);
    setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const handleSend = async () => {
    console.log('AdminMemos: handleSend called', { selectedIds, subject, body });
    pushLog(`handleSend called (selected=${selectedIds.length})`);
    if (!selectedIds.length) {
      Alert.alert('Select recipients', 'Please select at least one recipient for the memo.');
      return;
    }
    if (!subject.trim() && !body.trim()) {
      Alert.alert('Add content', 'Please add a subject or message body.');
      return;
    }
    const recipients = selectedIds.map((id) => {
      const found = allRecipients.find((r) => r.id === id) || {};
      return { id: found.id, role: found.role || 'parent', name: found.name || `${found.firstName || ''} ${found.lastName || ''}`.trim() };
    });
    const payload = { recipients, subject: subject.trim(), body: body.trim() };
    try {
      if (typeof sendAdminMemo !== 'function') {
        console.warn('sendAdminMemo is not a function', sendAdminMemo);
        Alert.alert('Error', 'Unable to send memo: send handler not available.');
        return;
      }
      pushLog('calling sendAdminMemo');
      const created = await sendAdminMemo(payload);
      if (created) {
        Alert.alert('Sent', 'Memo sent successfully.');
        setSelectedIds([]);
        setSubject('');
        setBody('');
        setQuery('');
      } else {
        Alert.alert('Failed', 'Failed to send memo. Please try again.');
      }
    } catch (e) {
      console.warn('AdminMemos: sendAdminMemo threw', e);
      Alert.alert('Error', 'An unexpected error occurred.');
    }
  };

  const renderRecipient = ({ item }) => {
    const name = item.name || `${item.firstName || ''} ${item.lastName || ''}`.trim();
    const selected = selectedIds.includes(item.id);
    return (
      <TouchableOpacity style={[styles.recipientRow, selected ? styles.recipientRowSelected : null]} onPress={() => handleToggle(item.id)}>
        <Image source={avatarSourceFor(item)} style={styles.avatar} />
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.recipientName}>{name}</Text>
          <Text style={styles.recipientRole}>{item.role === 'therapist' ? 'Faculty' : 'Parent'}</Text>
          {(item.email || item.phone) ? (
            <Text style={styles.recipientMeta}>{item.email ? item.email : item.phone}</Text>
          ) : null}
        </View>
        <View style={styles.checkbox}>
          <View style={[styles.checkCircle, selected ? styles.checkCircleActive : null]}>
            {selected ? <Text style={{ color: '#fff', fontWeight: '700' }}>✓</Text> : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Top area: title, search, inline dropdown
  const renderTop = useCallback(() => (
    <View style={[styles.headerWrap, { position: 'relative' }] }>
      {/* Title is handled by universal ScreenHeader */}

      <Text style={styles.label}>Filter recipients by name</Text>
      <TextInput
        ref={inputRef}
        style={styles.input}
        placeholder="Search name (parents or faculty)"
        value={query}
        onChangeText={(t) => { setQuery(t); pushLog(`query -> ${t}`); }}
        onFocus={() => { pushLog('search focused'); if (blurTimer.current) { clearTimeout(blurTimer.current); blurTimer.current = null; } setIsFocused(true); }}
        onBlur={() => { pushLog('search blurred'); if (blurTimer.current) clearTimeout(blurTimer.current); blurTimer.current = setTimeout(() => { setIsFocused(false); blurTimer.current = null; }, 220); }}
        onLayout={(e) => setSearchLayout(e.nativeEvent.layout)}
      />

      {/* Inline dropdown (non-modal) to avoid modal focus/Expo issues */}
      {dropdownVisible ? (
        <View style={[styles.dropdownWindow, { maxHeight: DROPDOWN_HEIGHT, marginTop: 8 }]}>
          <View style={styles.dropdownHeaderRow}>
            <Text style={styles.dropdownTitle}>Select recipients</Text>
            <View style={styles.dropdownHeaderActions}>
            {filteredRecipients && filteredRecipients.length ? (() => {
              const visibleIds = filteredRecipients.map((r) => r.id);
              const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
              const toggleAll = () => {
                pushLog(allSelected ? 'deselect all' : 'select all');
                // Cancel any pending blur-dismissal so the dropdown stays open.
                if (blurTimer.current) { clearTimeout(blurTimer.current); blurTimer.current = null; }
                setIsFocused(true);
                try { inputRef.current?.focus?.(); } catch (e) {}
                setSelectedIds((s) => {
                  if (allSelected) return s.filter((id) => !visibleIds.includes(id));
                  const merged = new Set([...(s || []), ...visibleIds]);
                  return Array.from(merged);
                });
              };
              return (
                <TouchableOpacity
                  onPress={toggleAll}
                  onPressIn={() => { setIsFocused(true); }}
                  style={styles.selectAllBtn}
                  accessibilityLabel={allSelected ? 'Deselect all' : 'Select all'}
                >
                  <View style={[styles.checkCircle, styles.checkCircleSmall, allSelected ? styles.checkCircleActive : null]}>
                    {allSelected ? <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>✓</Text> : null}
                  </View>
                  <Text style={styles.selectAllText}>{allSelected ? 'Clear all' : 'Select all'}</Text>
                </TouchableOpacity>
              );
            })() : null}
            <TouchableOpacity
              onPress={() => {
                pushLog('done pressed');
                if (blurTimer.current) { clearTimeout(blurTimer.current); blurTimer.current = null; }
                setIsFocused(false);
                try { inputRef.current?.blur?.(); } catch (e) {}
              }}
              style={styles.doneBtn}
              accessibilityLabel="Done selecting recipients"
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
            </View>
          </View>
          {/* removed matches count row per design */}
          {filteredRecipients && filteredRecipients.length ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator
              style={{ maxHeight: DROPDOWN_HEIGHT - 86 }}
            >
              {filteredRecipients.map((item) => (
                <View key={item.id}>
                  {/* renderRecipient uses handleToggle; switch to logged toggle to capture logs */}
                  <TouchableOpacity onPress={() => handleToggleLogged(item.id)}>
                    {renderRecipient({ item })}
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={{ padding: 18, alignItems: 'center' }}><Text style={{ color: '#666' }}>No matches</Text></View>
          )}
        </View>
      ) : null}
    </View>
  ), [query, filteredRecipients, selectedIds, dropdownVisible]);

  // Bottom area: subject, message, send button
  const renderBottom = useCallback(() => (
    <View>
      <Text style={[styles.label, { marginTop: 14 }]}>Recipients ({filteredRecipients.length})</Text>

      <Text style={[styles.label, { marginTop: 12 }]}>Subject</Text>
      <TextInput
        style={styles.input}
        placeholder="Subject"
        value={subject}
        onChangeText={(t) => { setSubject(t); pushLog(`subject -> ${t}`); }}
        onFocus={() => pushLog('subject focused')}
        onBlur={() => pushLog('subject blurred')}
      />

      <Text style={[styles.label, { marginTop: 12 }]}>Message</Text>
      <TextInput
        style={[styles.input, { height: 120 }]}
        placeholder="Write your memo here"
        value={body}
        onChangeText={(t) => { setBody(t); pushLog(`body -> ${t.slice(0,40)}`); }}
        multiline
        onFocus={() => pushLog('body focused')}
        onBlur={() => pushLog('body blurred')}
      />

      <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>Send Memo</Text>
      </TouchableOpacity>
    </View>
  ), [subject, body, filteredRecipients.length, handleSend]);

  // Debug overlay render
  const DebugOverlay = () => (
    <View style={styles.debugOverlay} pointerEvents="box-none">
      <Text style={styles.debugTitle}>DBG</Text>
      <Text style={styles.debugText}>focused: {String(isFocused)}</Text>
      <Text style={styles.debugText}>dropdown: {String(dropdownVisible)}</Text>
      <Text style={styles.debugText}>typingStopped: {String(typingStopped)}</Text>
      <Text style={styles.debugText}>selected: {selectedIds.length}</Text>
      <Text style={styles.debugText}>query: {query ? query.slice(0, 20) : '<empty>'}</Text>
      <ScrollView style={styles.logScroll}>
        {debugLogs.map((l, idx) => (<Text key={idx} style={styles.logLine}>{l}</Text>))}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Compose Memo" />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="always"
        onScrollBeginDrag={() => { try { inputRef.current?.blur(); } catch (e) {} setIsFocused(false); }}
      >
        {renderTop()}

        {/* When the dropdown is closed, show a compact summary of the selected
            recipients directly under the search field. If more than 3 are selected
            we collapse to the first 3 plus a "+N more" chip showing the total. */}
        {!dropdownVisible && selectedIds.length > 0 ? (() => {
          const selectedItems = selectedIds
            .map((id) => allRecipients.find((r) => r.id === id))
            .filter(Boolean);
          const MAX_CHIPS = 3;
          const visible = selectedItems.slice(0, MAX_CHIPS);
          const overflow = selectedItems.length - visible.length;
          return (
            <View style={styles.chipsRow}>
              {visible.map((item) => {
                const name = item.name || `${item.firstName || ''} ${item.lastName || ''}`.trim() || 'Recipient';
                return (
                  <View key={item.id} style={styles.chip}>
                    <Text style={styles.chipText} numberOfLines={1}>{name}</Text>
                    <TouchableOpacity
                      onPress={() => handleToggleLogged(item.id)}
                      style={styles.chipRemove}
                      accessibilityLabel={`Remove ${name}`}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.chipRemoveText}>×</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              {overflow > 0 ? (
                <View style={[styles.chip, styles.chipMore]}>
                  <Text style={[styles.chipText, styles.chipMoreText]}>+{overflow} more ({selectedItems.length} total)</Text>
                </View>
              ) : null}
            </View>
          );
        })() : null}

        {/* Wrap the bottom area so tapping in/around it dismisses the search dropdown. */}
        <TouchableWithoutFeedback onPress={() => { try { inputRef.current?.blur(); } catch (e) {} setIsFocused(false); }}>
          <View>
            {renderBottom()}
            {/* Tall tap target so empty space below the form also dismisses the dropdown. */}
            <View style={{ height: 80 }} />
          </View>
        </TouchableWithoutFeedback>
      </ScrollView>
      {/* No absolute backdrop: dismissal happens via TouchableWithoutFeedback around
          the bottom area, onScrollBeginDrag, and the search input's onBlur. Adding
          an absolute overlay would intercept taps on the dropdown's Select all button. */}
      {/* Render debug overlay (non-interactive) */}
      <View pointerEvents="none">
        <DebugOverlay />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  header: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  label: { fontSize: 13, color: '#333', marginBottom: 6 },
  input: { borderColor: '#ddd', borderWidth: 1, borderRadius: 8, padding: 10, backgroundColor: '#fff' },
  recipientRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomColor: '#f0f0f0', borderBottomWidth: 1 },
  avatar: { width: 46, height: 46, borderRadius: 24, marginRight: 12, backgroundColor: '#eee' },
  recipientName: { fontSize: 15, fontWeight: '600' },
  recipientRole: { fontSize: 12, color: '#666' },
  checkbox: { width: 36, alignItems: 'center' },
  sendButton: { marginTop: 18, backgroundColor: '#007aff', padding: 12, borderRadius: 8, alignItems: 'center' },
  dropdownWindow: { backgroundColor: '#fff', borderRadius: 10, marginTop: 8, padding: 6, borderWidth: 1, borderColor: '#e6eef8', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 6, zIndex: 50 },
  dropdownHandleContainer: { alignItems: 'center', justifyContent: 'center', position: 'relative', marginBottom: 6 },
  handle: { width: 48, height: 4, backgroundColor: '#e5e7eb', borderRadius: 4 },
  closeBtn: { position: 'absolute', right: 6, top: -2, padding: 6 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'transparent', zIndex: 40 },
  modalBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.2)' },
  modalContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  modalContainerCentered: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  dropdownHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 6, borderBottomColor: '#f1f5f9', borderBottomWidth: 1 },
  dropdownTitle: { fontWeight: '700', fontSize: 16 },
  selectAllBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6 },
  selectAllText: { marginLeft: 6, color: '#2563eb', fontWeight: '700', fontSize: 13 },
  dropdownHeaderActions: { flexDirection: 'row', alignItems: 'center' },
  doneBtn: { marginLeft: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#2563eb', borderRadius: 6 },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eef2ff', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, marginRight: 6, marginBottom: 6, maxWidth: '100%' },
  chipText: { color: '#1e3a8a', fontSize: 13, fontWeight: '600', maxWidth: 180 },
  chipRemove: { marginLeft: 6, paddingHorizontal: 4 },
  chipRemoveText: { color: '#1e3a8a', fontSize: 16, fontWeight: '700', lineHeight: 16 },
  chipMore: { backgroundColor: '#e2e8f0' },
  chipMoreText: { color: '#334155' },
  dropdownSearchRow: { paddingHorizontal: 8, paddingVertical: 8, borderBottomColor: '#f3f4f6', borderBottomWidth: 1 },
  recipientRowSelected: { backgroundColor: '#eef2ff' },
  recipientMeta: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  checkCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  checkCircleSmall: { width: 20, height: 20, borderRadius: 10 },
  checkCircleActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  debugOverlay: { position: 'absolute', right: 10, top: 10, width: 200, maxHeight: 260, backgroundColor: 'rgba(0,0,0,0.7)', padding: 8, borderRadius: 8, zIndex: 999 },
  debugTitle: { color: '#fff', fontWeight: '700', marginBottom: 6 },
  debugText: { color: '#fff', fontSize: 12 },
  logScroll: { marginTop: 8, maxHeight: 160 },
  logLine: { color: '#cfe8ff', fontSize: 11 },
});
