import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, TouchableOpacity, Linking, Modal, TouchableWithoutFeedback, Alert, Platform, Switch } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialIcons } from '@expo/vector-icons';
import { useData } from '../DataContext';
import { useAuth } from '../AuthContext';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { childHasParent, findLinkedParentId } from '../utils/directoryLinking';

export default function MyChildScreen() {
  const { children, parents, urgentMemos, sendTimeUpdateAlert, timeChangeProposals, proposeTimeChange, respondToProposal, respondToUrgentMemo } = useData();
  const { user } = useAuth();

  const role = (user?.role || '').toString().toLowerCase();
  const isParent = role.includes('parent');
  const linkedParentId = isParent ? (findLinkedParentId(user, parents) || null) : null;

  // Only show linked children for parents; keep existing behavior for other roles.
  const baseChildList = (Array.isArray(children) && children.length) ? children : [];
  const childList = isParent
    ? (linkedParentId ? baseChildList.filter((c) => childHasParent(c, linkedParentId)) : [])
    : baseChildList;
  const [selectedIndex, setSelectedIndex] = useState(0);
  useEffect(() => {
    if (selectedIndex >= childList.length) setSelectedIndex(0);
  }, [childList.length]);
  // If there are multiple children, default to showing the second child now
  useEffect(() => {
    if (childList.length > 1 && selectedIndex === 0) setSelectedIndex(1);
  }, [childList.length]);
  const child = childList[selectedIndex] || { id: 'no-child', name: 'No children added', age: '', room: '', avatar: 'https://i.pravatar.cc/120?u=empty', carePlan: '', notes: '' };

  // const provided above via single useData call
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [proposeType, setProposeType] = useState('pickup');
  const [useExactDate, setUseExactDate] = useState(false);
  const [exactDate, setExactDate] = useState(new Date());
  const [isPermanent, setIsPermanent] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  function formatISO(iso) {
    try {
      if (!iso) return '—';
      const d = new Date(iso);
      return d.toLocaleString();
    } catch (e) { return iso; }
  }

  const childProposals = (timeChangeProposals || []).filter((p) => p.childId === child.id);
  const [proposePreset, setProposePreset] = useState('10m_later');
  const [showTimeAlertModal, setShowTimeAlertModal] = useState(false);
  const [timeAlertType, setTimeAlertType] = useState('pickup');
  const [timeAlertDate, setTimeAlertDate] = useState(new Date());

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  const moodScore = clamp(Number(child?.moodScore ?? child?.mood ?? 10) || 10, 1, 15);
  const moodPct = ((moodScore - 1) / 14) * 100;
  const moodColor = moodScore <= 4 ? '#ef4444' : moodScore <= 8 ? '#F59E0B' : moodScore <= 12 ? '#FBBF24' : '#10B981';

  async function submitProposal(offsetMillis) {
    try {
      let proposedISO;
      if (useExactDate) {
        proposedISO = new Date(exactDate).toISOString();
      } else {
        const base = new Date(child.pickupTimeISO || child.dropoffTimeISO || Date.now());
        proposedISO = new Date(base.getTime() + offsetMillis).toISOString();
      }
      const note = `${proposeType} change via app`; 
      // include permanence in note so it is visible in local proposals when server doesn't persist scope
      const scopeNote = isPermanent ? `${note} (permanent)` : note;
      const created = await proposeTimeChange(child.id, proposeType, proposedISO, scopeNote);
      if (created) {
        Alert.alert('Proposal sent');
        setShowProposeModal(false);
      } else {
        Alert.alert('Failed', 'Could not send proposal');
      }
    } catch (e) {
      console.warn('submitProposal failed', e?.message || e);
      Alert.alert('Failed', 'Could not send proposal');
    }
  }

  function shortName(name, maxLen = 18) {
    if (!name || typeof name !== 'string') return '';
    if (name.length <= maxLen) return name;
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      // single long name — truncate
      return parts[0].slice(0, maxLen - 1) + '…';
    }
    const first = parts[0];
    const last = parts[parts.length - 1];
    return `${first} ${last.charAt(0)}.`;
  }

  const openPhone = (phone) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };
  const openEmail = (email) => {
    if (!email) return;
    Linking.openURL(`mailto:${email}`).catch(() => {});
  };

  const dailySessions = useMemo(() => {
    const baseDrop = child?.dropoffTimeISO ? new Date(child.dropoffTimeISO) : null;
    const basePick = child?.pickupTimeISO ? new Date(child.pickupTimeISO) : null;

    const days = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + i);
      days.push(d);
    }

    function timeOnDay(day, base) {
      if (!base || Number.isNaN(base.getTime())) return null;
      const dt = new Date(day);
      dt.setHours(base.getHours(), base.getMinutes(), 0, 0);
      return dt;
    }

    function formatDayLabel(day) {
      try {
        return day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      } catch (e) {
        return String(day);
      }
    }

    function formatTime(t) {
      if (!t || Number.isNaN(t.getTime())) return '—';
      try {
        return t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      } catch (e) {
        return t.toLocaleString();
      }
    }

    return days.map((day, idx) => {
      const drop = timeOnDay(day, baseDrop);
      const pick = timeOnDay(day, basePick);
      const therapist = (child?.session === 'AM')
        ? child?.amTherapist
        : (child?.session === 'PM')
          ? child?.pmTherapist
          : (child?.amTherapist || child?.pmTherapist);
      return {
        id: `${child?.id || 'child'}_${idx}_${day.toISOString().slice(0, 10)}`,
        label: formatDayLabel(day),
        dropoff: formatTime(drop),
        pickup: formatTime(pick),
        session: child?.session || 'Session',
        room: child?.room || '',
        therapistName: therapist?.name || '',
      };
    });
  }, [child]);

  const programDocs = useMemo(() => {
    const docsRaw = child?.programDocs;
    if (!docsRaw) return [];
    if (Array.isArray(docsRaw)) {
      return docsRaw
        .map((d) => {
          if (!d) return null;
          if (typeof d === 'string') return { title: 'Program document', url: d };
          const title = d.title || d.name || 'Program document';
          const url = d.url || d.href || '';
          if (!url) return null;
          return { title: String(title), url: String(url) };
        })
        .filter(Boolean);
    }
    if (typeof docsRaw === 'string') return [{ title: 'Program document', url: docsRaw }];
    return [];
  }, [child]);

  const openDoc = async (url) => {
    const u = String(url || '').trim();
    if (!u) return;
    try {
      await Linking.openURL(u);
    } catch (e) {
      Alert.alert('Could not open document', 'Please try again later.');
    }
  };

  const printDoc = (url) => {
    const u = String(url || '').trim();
    if (!u) return;
    if (Platform.OS !== 'web') {
      // On iOS/Android, opening the document lets users use the OS print/share flows.
      openDoc(u);
      return;
    }
    try {
      // Best-effort: open in a new tab/window; users can print from the browser.
      // Some browsers block programmatic print for cross-origin documents.
      window.open(u, '_blank', 'noopener,noreferrer');
    } catch (e) {
      // ignore
    }
  };

  return (
    <ScreenWrapper bannerShowBack={false} style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
      {/* Child selector - only show if user has multiple children */}
      {childList.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} pagingEnabled={false}>
          {childList.map((c, i) => (
            <TouchableOpacity key={c.id || i} onPress={() => setSelectedIndex(i)} style={[styles.selectorItem, selectedIndex === i && styles.selectorActive]}>
              <Image source={{ uri: c.avatar }} style={styles.selectorAvatar} />
              <Text style={styles.selectorName}>{shortName(c.name, 12)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
      {/* Developer action moved to DevRoleSwitcher */}
      
      <View style={styles.card}>
        <Image source={{ uri: child.avatar }} style={styles.avatar} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.name}>{shortName(child.name, 20)}</Text>
          <Text style={styles.meta}>{child.age} • {child.room}</Text>
        </View>
      </View>

      <View style={styles.halfRow}>
        <View style={[styles.section, styles.halfTile, styles.needsTile]}>
          <Text style={styles.sectionTitle}>Your child needs...</Text>
          <Text style={styles.sectionText}>{child.notes || 'No notes available.'}</Text>
        </View>

        <View style={[styles.section, styles.halfTile, styles.moodTile]}>
          <Text style={styles.sectionTitle}>Mood</Text>
          <Text style={[styles.sectionText, { marginBottom: 8 }]}>Score: {moodScore} / 15</Text>
          <View style={styles.moodMeterOuter}>
            <View style={[styles.moodMeterFill, { width: `${moodPct}%`, backgroundColor: moodColor }]} />
          </View>
          <View style={styles.moodMeterLabels}>
            <Text style={styles.moodLabel}>1 (bad)</Text>
            <Text style={styles.moodLabel}>15 (awesome)</Text>
          </View>
        </View>
      </View>

      {/* Propose modal */}
      {showProposeModal && (
        <Modal transparent visible animationType="fade">
          <TouchableWithoutFeedback onPress={() => setShowProposeModal(false)}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' }}>
              <TouchableWithoutFeedback>
                <View style={{ width: '90%', backgroundColor: '#fff', padding: 12, borderRadius: 8 }}>
                  <Text style={{ fontWeight: '700', marginBottom: 8 }}>Propose {proposeType === 'pickup' ? 'Pickup' : 'Drop-off'} Time</Text>
                  <Text style={{ marginBottom: 8 }}>Choose a quick offset from the currently scheduled time.</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <TouchableOpacity onPress={() => submitProposal(10 * 60 * 1000)} style={{ padding: 8, backgroundColor: '#e5e7eb', borderRadius: 8 }}><Text>+10m</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => submitProposal(30 * 60 * 1000)} style={{ padding: 8, backgroundColor: '#e5e7eb', borderRadius: 8 }}><Text>+30m</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => submitProposal(60 * 60 * 1000)} style={{ padding: 8, backgroundColor: '#e5e7eb', borderRadius: 8 }}><Text>+1h</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => submitProposal(-15 * 60 * 1000)} style={{ padding: 8, backgroundColor: '#e5e7eb', borderRadius: 8 }}><Text>-15m</Text></TouchableOpacity>
                  </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text>Permanent change</Text>
                      <Switch value={isPermanent} onValueChange={(v) => { setIsPermanent(v); if (v) { setUseExactDate(false); } }} />
                    </View>
                    <View style={{ marginBottom: 8 }}>
                      <TouchableOpacity onPress={() => { setUseExactDate(!useExactDate); if (Platform.OS === 'android' && !showPicker && !useExactDate) setShowPicker(true); }} style={{ padding: 8, backgroundColor: useExactDate ? '#c7f9cc' : '#e5e7eb', borderRadius: 8 }}>
                        <Text>{useExactDate ? 'Using exact date/time' : 'Choose exact date/time'}</Text>
                      </TouchableOpacity>
                      {useExactDate && (
                        <View style={{ marginTop: 8 }}>
                          <Text style={{ marginBottom: 6 }}>Selected: {new Date(exactDate).toLocaleString()}</Text>
                          {showPicker && (
                            <DateTimePicker
                              value={exactDate}
                              mode="datetime"
                              display={Platform.OS === 'android' ? 'default' : 'inline'}
                              onChange={(e, d) => {
                                if (d) setExactDate(d);
                                if (Platform.OS === 'android') setShowPicker(false);
                              }}
                            />
                          )}
                          {!showPicker && Platform.OS === 'ios' ? (
                            <DateTimePicker value={exactDate} mode="datetime" display="inline" onChange={(e, d) => d && setExactDate(d)} />
                          ) : null}
                        </View>
                      )}
                    </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <TouchableOpacity onPress={() => setShowProposeModal(false)} style={{ marginLeft: 8, padding: 8 }}><Text>Cancel</Text></TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      <View style={styles.scheduleWrap}>
        <Text style={styles.scheduleGroupTitle}>Schedule</Text>

        <View style={[styles.section, { marginTop: 8 }]}>
          <Text style={styles.sectionTitle}>Daily Sessions</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 6 }}>
            {(dailySessions || []).map((s) => (
              <View key={s.id} style={styles.sessionCard}>
                <Text style={styles.sessionDay}>{s.label}</Text>
                <Text style={styles.sessionMeta}>{s.session}{s.room ? ` • ${s.room}` : ''}</Text>
                <View style={{ height: 8 }} />
                <Text style={styles.sessionTimeLabel}>Drop-off</Text>
                <Text style={styles.sessionTime}>{s.dropoff}</Text>
                <View style={{ height: 6 }} />
                <Text style={styles.sessionTimeLabel}>Pick-up</Text>
                <Text style={styles.sessionTime}>{s.pickup}</Text>
                {s.therapistName ? (
                  <Text style={styles.sessionTherapist} numberOfLines={1}>Therapist: {s.therapistName}</Text>
                ) : null}
              </View>
            ))}
          </ScrollView>
        </View>

        <View style={[styles.section, { marginTop: 8 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            {/* Drop-off container */}
            <TouchableOpacity onPress={() => { setTimeAlertType('dropoff'); setTimeAlertDate(new Date(child.dropoffTimeISO || Date.now())); setShowTimeAlertModal(true); }} style={styles.scheduleTile}>
              <Text style={styles.scheduleLabel}>Drop-off</Text>
              <View style={styles.scheduleDivider} />
              <Text style={styles.scheduleTime}>{formatISO(child.dropoffTimeISO)}</Text>
              {/* status indicator */}
              {(() => {
                const memo = (urgentMemos || []).find((m) => m.childId === child.id && m.type === 'time_update' && m.updateType === 'dropoff');
                if (!memo) return null;
                const color = memo.status === 'accepted' ? '#10B981' : memo.status === 'denied' ? '#ef4444' : '#F59E0B';
                return <View style={[styles.statusDot, { backgroundColor: color }]} />;
              })()}
              {(() => {
                const memo = (urgentMemos || []).find((m) => m.childId === child.id && m.type === 'time_update' && m.updateType === 'dropoff');
                if (memo && memo.status === 'denied') {
                  return <Text style={styles.callBanner}>Please call</Text>;
                }
                return null;
              })()}
            </TouchableOpacity>

            {/* Pick-up container */}
            <TouchableOpacity onPress={() => { setTimeAlertType('pickup'); setTimeAlertDate(new Date(child.pickupTimeISO || Date.now())); setShowTimeAlertModal(true); }} style={styles.scheduleTile}>
              <Text style={styles.scheduleLabel}>Pick-up</Text>
              <View style={styles.scheduleDivider} />
              <Text style={styles.scheduleTime}>{formatISO(child.pickupTimeISO)}</Text>
              {(() => {
                const memo = (urgentMemos || []).find((m) => m.childId === child.id && m.type === 'time_update' && m.updateType === 'pickup');
                if (!memo) return null;
                const color = memo.status === 'accepted' ? '#10B981' : memo.status === 'denied' ? '#ef4444' : '#F59E0B';
                return <View style={[styles.statusDot, { backgroundColor: color }]} />;
              })()}
              {(() => {
                const memo = (urgentMemos || []).find((m) => m.childId === child.id && m.type === 'time_update' && m.updateType === 'pickup');
                if (memo && memo.status === 'denied') {
                  return <Text style={styles.callBanner}>Please call</Text>;
                }
                return null;
              })()}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pending Notifications</Text>
          {(() => {
            const memoRequests = (urgentMemos || []).filter((m) => m.childId === child.id && m.type === 'time_update' && (!m.status || m.status === 'pending'));
            const proposalRequests = (timeChangeProposals || []).filter((p) => p.childId === child.id);
            const combined = [
              ...proposalRequests.map((p) => ({ ...p, _source: 'proposal', status: p.status || 'pending' })),
              ...memoRequests.map((m) => ({ id: m.id, type: m.updateType, proposedISO: m.proposedISO, note: m.note, proposerName: m.proposerId, _source: 'memo', status: m.status || 'pending' }))
            ];
            if (!combined.length) return <Text style={styles.sectionText}>No pending notifications.</Text>;
            return combined.map((p) => (
              <View key={p.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
                <Text style={{ fontWeight: '700' }}>{p.type === 'pickup' ? 'Pickup' : 'Drop-off'} notification</Text>
                <Text style={{ color: '#374151' }}>Requested: {formatISO(p.proposedISO)}</Text>
                <Text style={{ color: '#6b7280', fontSize: 12 }}>{p.note || ''}</Text>
                <Text style={{ fontSize: 12, color: '#6b7280' }}>By: {p.proposerName || p.proposerId}</Text>
                {user && (user.role === 'admin' || user.role === 'administrator') ? (
                  <View style={{ flexDirection: 'row', marginTop: 8 }}>
                    {p._source === 'proposal' ? (
                      <>
                        <TouchableOpacity onPress={async () => { const res = await respondToProposal(p.id, 'accept'); if (res) Alert.alert('Accepted'); }} style={{ marginRight: 8, padding: 8, backgroundColor: '#10B981', borderRadius: 8 }}>
                          <Text style={{ color: '#fff' }}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={async () => { const res = await respondToProposal(p.id, 'reject'); if (res) Alert.alert('Rejected'); }} style={{ padding: 8, backgroundColor: '#ef4444', borderRadius: 8 }}>
                          <Text style={{ color: '#fff' }}>Reject</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <TouchableOpacity onPress={async () => { const ok = await respondToUrgentMemo(p.id, 'accepted'); if (ok) Alert.alert('Accepted'); }} style={{ marginRight: 8, padding: 8, backgroundColor: '#10B981', borderRadius: 8 }}>
                          <Text style={{ color: '#fff' }}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={async () => { const ok = await respondToUrgentMemo(p.id, 'denied'); if (ok) Alert.alert('Denied'); }} style={{ padding: 8, backgroundColor: '#ef4444', borderRadius: 8 }}>
                          <Text style={{ color: '#fff' }}>Deny</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                ) : (
                  <Text style={{ marginTop: 8, color: '#6b7280' }}>Waiting for admin response</Text>
                )}
              </View>
            ));
          })()}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Meeting with BCBA</Text>
          {((child.upcoming || []).filter((u) => u.type === 'parent-aba')).length ? (
            (child.upcoming || []).filter((u) => u.type === 'parent-aba').map((u) => (
              <View key={u.id} style={{ marginBottom: 8 }}>
                <Text style={styles.sectionText}>• {u.when} — {u.title}</Text>
                {u.organizer ? (
                  <Text style={[styles.sectionText, { marginTop: 4 }]}>Organizer: {u.organizer.name} • {u.organizer.phone} • {u.organizer.email}</Text>
                ) : null}
              </View>
            ))
          ) : (
            <Text style={styles.sectionText}>No meeting scheduled yet.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Program</Text>
          <Text style={styles.sectionText}>
            {child?.curriculum || child?.programCurriculum || child?.carePlan || 'No curriculum details available yet.'}
          </Text>

          <View style={{ height: 10 }} />
          <Text style={[styles.sectionTitle, { marginBottom: 6 }]}>Curriculum Documents</Text>
          {(programDocs || []).length ? (
            (programDocs || []).map((d) => (
              <View key={d.url} style={styles.docRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700' }} numberOfLines={1}>{d.title}</Text>
                  <Text style={{ color: '#6b7280', fontSize: 12 }} numberOfLines={1}>{d.url}</Text>
                </View>
                <TouchableOpacity onPress={() => openDoc(d.url)} style={styles.docBtn} accessibilityLabel={`Download ${d.title}`}>
                  <MaterialIcons name="file-download" size={18} color="#2563eb" />
                  <Text style={styles.docBtnText}>Download</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => printDoc(d.url)} style={styles.docBtn} accessibilityLabel={`Print ${d.title}`}>
                  <MaterialIcons name="print" size={18} color="#2563eb" />
                  <Text style={styles.docBtnText}>Print</Text>
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <Text style={styles.sectionText}>No program documents available.</Text>
          )}
        </View>
      </View>

      {/* Time alert modal */}
      {showTimeAlertModal && (
        <Modal transparent visible animationType="fade">
          <TouchableWithoutFeedback onPress={() => setShowTimeAlertModal(false)}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' }}>
              <TouchableWithoutFeedback>
                <View style={{ width: '90%', backgroundColor: '#fff', padding: 12, borderRadius: 8 }}>
                  <Text style={{ fontWeight: '700', marginBottom: 8 }}>Send {timeAlertType === 'pickup' ? 'Pickup' : 'Drop-off'} Time Update</Text>
                  <Text style={{ marginBottom: 8 }}>Select the updated time to send as an urgent alert to admin.</Text>
                  <View style={{ marginBottom: 8 }}>
                    <Text style={{ marginBottom: 6 }}>Selected: {new Date(timeAlertDate).toLocaleString()}</Text>
                    <DateTimePicker value={timeAlertDate} mode="datetime" display={Platform.OS === 'android' ? 'default' : 'inline'} onChange={(e, d) => d && setTimeAlertDate(d)} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <TouchableOpacity onPress={() => setShowTimeAlertModal(false)} style={{ marginRight: 8, padding: 8 }}><Text>Cancel</Text></TouchableOpacity>
                    <TouchableOpacity onPress={async () => {
                      try {
                        await sendTimeUpdateAlert(child.id, timeAlertType, new Date(timeAlertDate).toISOString(), `Requested by ${user?.name || 'Parent'}`);
                        Alert.alert('Sent', 'Your time update has been sent as an urgent alert to administration.');
                        setShowTimeAlertModal(false);
                      } catch (e) {
                        console.warn('sendTimeUpdateAlert failed', e?.message || e);
                        Alert.alert('Failed', 'Could not send alert.');
                      }
                    }} style={{ padding: 8, backgroundColor: '#2563eb', borderRadius: 8 }}><Text style={{ color: '#fff' }}>Send</Text></TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      {/* Care team */}
      <View style={styles.careTeamWrap}>
        <Text style={styles.careTeamTitle}>Care Team</Text>

        {/* BCA therapist tile (always render; show placeholder when not assigned) */}
        <View style={[styles.card, { marginTop: 8, alignItems: 'center' }]}>
          {child.bcaTherapist ? (
            <>
              <Image source={{ uri: child.bcaTherapist.avatar }} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#eee' }} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.name}>{shortName(child.bcaTherapist.name, 20)}</Text>
                <Text style={styles.meta}>{child.bcaTherapist.role}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <TouchableOpacity onPress={() => openPhone(child.bcaTherapist.phone)} style={{ paddingVertical: 6 }} accessibilityLabel="Call BCA therapist">
                  <MaterialIcons name="call" size={20} color="#2563eb" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => openEmail(child.bcaTherapist.email)} style={{ paddingVertical: 6 }} accessibilityLabel="Email BCA therapist">
                  <MaterialIcons name="email" size={20} color="#2563eb" />
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.name}>BCA Therapist</Text>
              <Text style={styles.meta}>No BCA therapist assigned.</Text>
            </View>
          )}
        </View>

        <View style={[styles.row, { marginTop: 12 }]}> 
          <View style={[styles.therapistBlock, { marginRight: 8 }]}>
            <Text style={styles.therapistTitle}>AM Therapist</Text>
            {child.amTherapist ? (
              <View style={styles.therapistInner}>
                <Image source={{ uri: child.amTherapist.avatar }} style={styles.therapistAvatar} />
                <View style={{ flex: 1, marginLeft: 8, alignItems: 'center' }}>
                  <Text style={styles.therapistName}>{shortName(child.amTherapist.name, 18)}</Text>
                  <Text style={styles.therapistRole}>{child.amTherapist.role}</Text>
                  <View style={styles.amIconRow}>
                    <TouchableOpacity onPress={() => openPhone(child.amTherapist.phone)} style={styles.iconTouch} accessibilityLabel="Call AM therapist">
                      <MaterialIcons name="call" size={22} color="#2563eb" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openEmail(child.amTherapist.email)} style={styles.iconTouch} accessibilityLabel="Email AM therapist">
                      <MaterialIcons name="email" size={22} color="#2563eb" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <Text style={styles.sectionText}>No AM therapist assigned.</Text>
            )}
          </View>

          <View style={[styles.therapistBlock, { marginLeft: 8 }]}>
            <Text style={styles.therapistTitle}>PM Therapist</Text>
            {child.pmTherapist ? (
              <View style={styles.therapistInner}>
                <Image source={{ uri: child.pmTherapist.avatar }} style={styles.therapistAvatar} />
                <View style={{ flex: 1, marginLeft: 8, alignItems: 'center' }}>
                  <Text style={styles.therapistName}>{shortName(child.pmTherapist.name, 18)}</Text>
                  <Text style={styles.therapistRole}>{child.pmTherapist.role}</Text>
                  <View style={styles.amIconRow}>
                    <TouchableOpacity onPress={() => openPhone(child.pmTherapist.phone)} style={styles.iconTouch} accessibilityLabel="Call PM therapist">
                      <MaterialIcons name="call" size={22} color="#2563eb" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openEmail(child.pmTherapist.email)} style={styles.iconTouch} accessibilityLabel="Email PM therapist">
                      <MaterialIcons name="email" size={22} color="#2563eb" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <Text style={styles.sectionText}>No PM therapist assigned.</Text>
            )}
          </View>
        </View>

        <View style={[styles.card, { marginTop: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Care Plan</Text>
            <Text style={styles.sectionText}>{child.carePlan || "Sam's goals: fine motor, communication prompts, and independent dressing."}</Text>
          </View>
        </View>
      </View>

      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 8 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#eee' },
  name: { fontSize: 18, fontWeight: '700' },
  meta: { color: '#6b7280', marginTop: 4 },
  section: { marginTop: 12, backgroundColor: '#fff', padding: 12, borderRadius: 8 },
  sectionTitle: { fontWeight: '700', marginBottom: 6 },
  sectionText: { color: '#374151' },
  sessionCard: { width: 180, marginRight: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', borderRadius: 12, padding: 12 },
  sessionDay: { fontWeight: '800', color: '#111827' },
  sessionMeta: { color: '#6b7280', marginTop: 4, fontSize: 12 },
  sessionTimeLabel: { color: '#6b7280', fontSize: 12, fontWeight: '700' },
  sessionTime: { color: '#111827', fontWeight: '700' },
  sessionTherapist: { marginTop: 8, color: '#374151', fontSize: 12 },
  docRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  docBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', marginLeft: 8 },
  docBtnText: { marginLeft: 6, color: '#2563eb', fontWeight: '700' },
  scheduleTile: { flex: 1, backgroundColor: '#fff', padding: 12, marginHorizontal: 6, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  scheduleLabel: { fontWeight: '700', marginBottom: 6 },
  scheduleDivider: { height: 1, width: '60%', backgroundColor: '#e6e7ea', marginVertical: 6 },
  scheduleTime: { color: '#374151', textAlign: 'center' },
  statusDot: { width: 12, height: 12, borderRadius: 6, position: 'absolute', top: 8, right: 8 },
  callBanner: { marginTop: 8, color: '#b91c1c', fontWeight: '700' },
  row: { flexDirection: 'row', marginTop: 12 },
  therapistBlock: { flex: 1, backgroundColor: '#fff', padding: 10, borderRadius: 8 },
  therapistTitle: { fontWeight: '700', marginBottom: 8 },
  therapistInner: { flexDirection: 'row', alignItems: 'center' },
  therapistAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#eee' },
  therapistName: { fontWeight: '700' },
  therapistRole: { color: '#6b7280', fontSize: 12 },
  contactButton: { paddingVertical: 6 },
  contactText: { color: '#2563eb', fontSize: 13 },
  selectorItem: { alignItems: 'center', padding: 8, marginRight: 8, backgroundColor: '#fff', borderRadius: 8, width: 100 },
  selectorAvatar: { width: 48, height: 48, borderRadius: 24, marginBottom: 6 },
  selectorName: { fontSize: 12, textAlign: 'center' },
  selectorActive: { borderWidth: 2, borderColor: '#2563eb' },
  amIconRow: { flexDirection: 'row', marginTop: 8, justifyContent: 'center' },
  iconTouch: { marginHorizontal: 12 },
  demoButton: { backgroundColor: '#2563eb', padding: 10, borderRadius: 8, alignItems: 'center', marginBottom: 8 },
  careTeamWrap: { marginTop: 12, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12 },
  careTeamTitle: { textAlign: 'center', fontWeight: '800', fontSize: 16, color: '#111827' },
  scheduleWrap: { marginTop: 12, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12 },
  scheduleGroupTitle: { textAlign: 'center', fontWeight: '800', fontSize: 16, color: '#111827' },
  halfRow: { flexDirection: 'row', marginTop: 12 },
  halfTile: { flex: 1 },
  needsTile: { minHeight: 160, marginRight: 8 },
  moodTile: { minHeight: 160, marginLeft: 8 },
  moodMeterOuter: { height: 14, borderRadius: 999, backgroundColor: '#e5e7eb', overflow: 'hidden', borderWidth: 1, borderColor: '#d1d5db' },
  moodMeterFill: { height: '100%', borderRadius: 999 },
  moodMeterLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  moodLabel: { fontSize: 12, color: '#6b7280' },
});
