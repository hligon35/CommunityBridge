import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../AuthContext';
import { useData } from '../DataContext';

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function formatDayKey(date) {
  return startOfDay(date).toISOString().slice(0, 10);
}

function findRelevantChildren(role, userId, children) {
  const allChildren = Array.isArray(children) ? children : [];
  if (!userId) return [];
  if (role === 'therapist') {
    return allChildren.filter((child) => {
      const assigned = [child?.amTherapist, child?.pmTherapist, child?.bcaTherapist];
      return assigned.some((entry) => {
        if (!entry) return false;
        if (typeof entry === 'string') return entry === userId;
        return entry?.id === userId;
      });
    });
  }
  return allChildren.filter((child) => Array.isArray(child?.parents) && child.parents.some((parent) => parent?.id === userId));
}

function getScheduleEntries(children, selectedDate) {
  const day = startOfDay(selectedDate);
  return children
    .map((child, index) => {
      const dropBase = child?.dropoffTimeISO ? new Date(child.dropoffTimeISO) : null;
      const pickBase = child?.pickupTimeISO ? new Date(child.pickupTimeISO) : null;
      const dropoff = dropBase && !Number.isNaN(dropBase.getTime())
        ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), dropBase.getHours(), dropBase.getMinutes())
        : null;
      const pickup = pickBase && !Number.isNaN(pickBase.getTime())
        ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), pickBase.getHours(), pickBase.getMinutes())
        : null;
      const therapist = child?.session === 'AM'
        ? child?.amTherapist
        : child?.session === 'PM'
          ? child?.pmTherapist
          : (child?.amTherapist || child?.pmTherapist || child?.bcaTherapist);
      return {
        id: child?.id || `child-${index}`,
        childName: child?.name || 'Child',
        session: child?.session || 'Session',
        room: child?.room || '',
        dropoff,
        pickup,
        therapistName: therapist?.name || '',
      };
    })
    .filter((entry) => entry.dropoff || entry.pickup)
    .sort((left, right) => {
      const leftTime = left.dropoff?.getTime() || left.pickup?.getTime() || 0;
      const rightTime = right.dropoff?.getTime() || right.pickup?.getTime() || 0;
      return leftTime - rightTime;
    });
}

function formatTime(date) {
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function buildCalendarDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const start = new Date(firstOfMonth);
  start.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
  const days = [];
  for (let index = 0; index < 42; index += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    days.push(day);
  }
  return days;
}

function monthLabel(date) {
  return date.toLocaleDateString([], { month: 'long', year: 'numeric' });
}

function getNextUpcomingEntry(children, now = new Date()) {
  const allChildren = Array.isArray(children) ? children : [];
  const entries = allChildren.flatMap((child) => {
    const base = child?.dropoffTimeISO ? new Date(child.dropoffTimeISO) : null;
    if (!base || Number.isNaN(base.getTime())) return [];
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), base.getHours(), base.getMinutes());
    const scheduledAt = today.getTime() >= now.getTime()
      ? today
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, base.getHours(), base.getMinutes());
    return [{
      childName: child?.name || 'Child',
      session: child?.session || 'Session',
      scheduledAt,
      room: child?.room || '',
    }];
  });
  entries.sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime());
  return entries[0] || null;
}

export default function ScheduleCalendarScreen() {
  const route = useRoute();
  const { user } = useAuth();
  const { children = [] } = useData();
  const role = String(user?.role || 'parent').trim().toLowerCase();
  const isTherapistSchedule = role === 'therapist' && route?.params?.therapistSchedule;
  const relevantChildren = useMemo(() => {
    const linkedChildren = findRelevantChildren(role, user?.id, children);
    const requestedChildId = route?.params?.childId;
    if (isTherapistSchedule) return linkedChildren;
    if (!requestedChildId) return linkedChildren;
    return linkedChildren.filter((child) => child?.id === requestedChildId);
  }, [children, isTherapistSchedule, role, route?.params?.childId, user?.id]);
  const initialDate = useMemo(() => {
    const firstChild = relevantChildren[0];
    const base = firstChild?.dropoffTimeISO || firstChild?.pickupTimeISO || Date.now();
    return startOfDay(new Date(base));
  }, [relevantChildren]);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [displayMonth, setDisplayMonth] = useState(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
  const [viewMode, setViewMode] = useState(isTherapistSchedule ? 'staff' : 'day');

  const calendarDays = useMemo(() => buildCalendarDays(displayMonth), [displayMonth]);
  const selectedDayKey = formatDayKey(selectedDate);
  const entries = useMemo(() => getScheduleEntries(relevantChildren, selectedDate), [relevantChildren, selectedDate]);
  const nextUpcomingEntry = useMemo(() => getNextUpcomingEntry(relevantChildren), [relevantChildren]);
  const groupedEntries = useMemo(() => {
    if (viewMode === 'student') {
      return relevantChildren.map((child) => ({
        key: child?.id || child?.name,
        title: child?.name || 'Child',
        subtitle: `${child?.session || 'Session'}${child?.room ? ` • ${child.room}` : ''}`,
      }));
    }
    if (viewMode === 'staff') {
      const groups = new Map();
      entries.forEach((entry) => {
        const key = entry.therapistName || 'Unassigned';
        const next = groups.get(key) || [];
        next.push(entry);
        groups.set(key, next);
      });
      return Array.from(groups.entries()).map(([key, value]) => ({
        key,
        title: key,
        subtitle: `${value.length} session${value.length === 1 ? '' : 's'}`,
      }));
    }
    if (viewMode === 'week') {
      return Array.from({ length: 7 }).map((_, index) => {
        const day = new Date(selectedDate);
        day.setDate(selectedDate.getDate() - selectedDate.getDay() + index);
        return {
          key: formatDayKey(day),
          title: day.toLocaleDateString([], { weekday: 'long' }),
          subtitle: `${entries.length} planned entries`,
        };
      });
    }
    return entries.map((entry) => ({
      key: entry.id,
      title: entry.childName,
      subtitle: `${entry.session}${entry.room ? ` • ${entry.room}` : ''}`,
    }));
  }, [entries, relevantChildren, selectedDate, viewMode]);

  return (
    <ScreenWrapper
      bannerTitle={isTherapistSchedule ? 'Work Schedule' : 'Schedule'}
      style={styles.container}
      bottomSpacerHeight={0}
      webBottomSpacerHeight={0}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isTherapistSchedule ? (
          <View style={styles.nextSessionCard}>
            <Text style={styles.nextSessionEyebrow}>Next Scheduled Session</Text>
            {nextUpcomingEntry ? (
              <>
                <Text style={styles.nextSessionChild}>{nextUpcomingEntry.childName}</Text>
                <Text style={styles.nextSessionMeta}>
                  {nextUpcomingEntry.session} • {nextUpcomingEntry.scheduledAt.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </Text>
                {nextUpcomingEntry.room ? <Text style={styles.nextSessionMeta}>Room {nextUpcomingEntry.room}</Text> : null}
              </>
            ) : (
              <Text style={styles.nextSessionMeta}>No upcoming sessions found.</Text>
            )}
          </View>
        ) : null}

        <View style={styles.calendarCard}>
          <View style={styles.modeRow}>
            {[
              { key: 'day', label: 'Day' },
              { key: 'week', label: 'Week' },
              { key: 'staff', label: 'Staff' },
              { key: 'student', label: 'Student' },
            ].map((mode) => (
              <TouchableOpacity key={mode.key} style={[styles.modeChip, viewMode === mode.key ? styles.modeChipActive : null]} onPress={() => setViewMode(mode.key)}>
                <Text style={[styles.modeChipText, viewMode === mode.key ? styles.modeChipTextActive : null]}>{mode.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.calendarHeader}>
            <TouchableOpacity
              onPress={() => setDisplayMonth(new Date(displayMonth.getFullYear(), displayMonth.getMonth() - 1, 1))}
              style={styles.navButton}
            >
              <Text style={styles.navButtonText}>{'<'}</Text>
            </TouchableOpacity>
            <Text style={styles.monthTitle}>{monthLabel(displayMonth)}</Text>
            <TouchableOpacity
              onPress={() => setDisplayMonth(new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 1))}
              style={styles.navButton}
            >
              <Text style={styles.navButtonText}>{'>'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.weekdayRow}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
              <Text key={label} style={styles.weekdayLabel}>{label}</Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {calendarDays.map((day) => {
              const dayKey = formatDayKey(day);
              const isSelected = dayKey === selectedDayKey;
              const inMonth = day.getMonth() === displayMonth.getMonth();
              return (
                <TouchableOpacity
                  key={dayKey}
                  style={[styles.dayButton, isSelected ? styles.dayButtonSelected : null]}
                  onPress={() => setSelectedDate(startOfDay(day))}
                >
                  <Text style={[styles.dayText, !inMonth ? styles.dayTextMuted : null, isSelected ? styles.dayTextSelected : null]}>
                    {day.getDate()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.scheduleSection}>
          <Text style={styles.scheduleTitle}>
            {viewMode === 'staff' ? 'Staff schedule overview' : viewMode === 'student' ? 'Student schedule overview' : isTherapistSchedule ? 'Work schedule' : 'Schedule for'} {selectedDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>

          {viewMode !== 'day' ? groupedEntries.map((group) => (
            <View key={group.key} style={styles.entryCard}>
              <Text style={styles.entryName}>{group.title}</Text>
              <Text style={styles.entryMeta}>{group.subtitle}</Text>
            </View>
          )) : null}

          {viewMode === 'day' && entries.length ? entries.map((entry) => (
            <View key={entry.id} style={styles.entryCard}>
              <Text style={styles.entryName}>{entry.childName}</Text>
              <Text style={styles.entryMeta}>{entry.session}{entry.room ? ` • ${entry.room}` : ''}</Text>

              <View style={styles.timeRow}>
                <View style={styles.timeBlock}>
                  <Text style={styles.timeLabel}>Drop-off</Text>
                  <Text style={styles.timeValue}>{formatTime(entry.dropoff)}</Text>
                </View>
                <View style={styles.timeBlock}>
                  <Text style={styles.timeLabel}>Pick-up</Text>
                  <Text style={styles.timeValue}>{formatTime(entry.pickup)}</Text>
                </View>
              </View>

              {entry.therapistName ? <Text style={styles.therapistText}>Therapist: {entry.therapistName}</Text> : null}
            </View>
          )) : viewMode === 'day' ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No schedule for this day</Text>
              <Text style={styles.emptyText}>Select another day to view scheduled drop-off and pick-up times.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f6f8',
  },
  content: {
    padding: 16,
    paddingBottom: 16,
  },
  nextSessionCard: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  nextSessionEyebrow: {
    color: '#93c5fd',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  nextSessionChild: {
    marginTop: 8,
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  nextSessionMeta: {
    marginTop: 6,
    color: '#cbd5e1',
    fontSize: 14,
  },
  calendarCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  modeChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#eff6ff',
    marginRight: 8,
    marginBottom: 8,
  },
  modeChipActive: {
    backgroundColor: '#1d4ed8',
  },
  modeChipText: {
    color: '#1d4ed8',
    fontWeight: '700',
  },
  modeChipTextActive: {
    color: '#fff',
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  navButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
  },
  navButtonText: {
    color: '#1d4ed8',
    fontSize: 18,
    fontWeight: '700',
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekdayLabel: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayButton: {
    width: '14.28%',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    marginBottom: 4,
  },
  dayButtonSelected: {
    backgroundColor: '#1d4ed8',
  },
  dayText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '600',
  },
  dayTextMuted: {
    color: '#94a3b8',
  },
  dayTextSelected: {
    color: '#ffffff',
  },
  scheduleSection: {
    marginTop: 16,
  },
  scheduleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  entryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginBottom: 10,
  },
  entryName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  entryMeta: {
    marginTop: 4,
    fontSize: 13,
    color: '#475569',
  },
  timeRow: {
    flexDirection: 'row',
    marginTop: 14,
  },
  timeBlock: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  timeValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  therapistText: {
    marginTop: 12,
    fontSize: 13,
    color: '#334155',
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    color: '#64748b',
    lineHeight: 19,
  },
});