import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { ScreenWrapper } from '../../components/ScreenWrapper';
import { useTenant } from '../../core/tenant/TenantContext';
import { useData } from '../../DataContext';
import { logPress } from '../../utils/logger';
import moduleStyles from './ModuleStyles';

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AttendanceScreen() {
  const tenant = useTenant() || {};
  const { children = [] } = useData() || {};
  const { labels = {}, currentProgram, currentCampus, featureFlags = {} } = tenant;
  const enabled = featureFlags.attendanceModule !== false;

  const [marks, setMarks] = React.useState({}); // { childId: 'present'|'absent'|'tardy' }
  const dateKey = todayKey();

  const roster = useMemo(() => {
    if (!Array.isArray(children)) return [];
    if (!currentProgram?.id) return children;
    return children.filter((c) => !c.programId || c.programId === currentProgram.id);
  }, [children, currentProgram?.id]);

  function setMark(childId, status) {
    logPress('Attendance:Mark', { childId, status });
    setMarks((prev) => ({ ...prev, [childId]: status }));
  }

  const counts = useMemo(() => {
    const out = { present: 0, absent: 0, tardy: 0, unmarked: 0 };
    roster.forEach((c) => {
      const m = marks[c.id];
      if (m === 'present') out.present += 1;
      else if (m === 'absent') out.absent += 1;
      else if (m === 'tardy') out.tardy += 1;
      else out.unmarked += 1;
    });
    return out;
  }, [roster, marks]);

  function submit() {
    logPress('Attendance:Submit', { dateKey, counts });
    Alert.alert('Attendance saved (preview)', `Present: ${counts.present}\nAbsent: ${counts.absent}\nTardy: ${counts.tardy}\nUnmarked: ${counts.unmarked}`);
  }

  if (!enabled) {
    return (
      <ScreenWrapper>
        <ScrollView contentContainerStyle={moduleStyles.content}>
          <View style={moduleStyles.empty}>
            <Text style={moduleStyles.emptyText}>Attendance is not enabled for this program.</Text>
          </View>
        </ScrollView>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <ScrollView contentContainerStyle={moduleStyles.content} keyboardShouldPersistTaps="handled">
        <View style={moduleStyles.header}>
          <Text style={moduleStyles.title}>Attendance</Text>
          <Text style={moduleStyles.subtitle}>Daily roster for {labels.myClass || 'My Class'} • {dateKey}</Text>
          <View style={moduleStyles.contextRow}>
            {currentProgram?.name ? (
              <View style={moduleStyles.contextChip}><Text style={moduleStyles.contextChipText}>{currentProgram.name}</Text></View>
            ) : null}
            {currentCampus?.name ? (
              <View style={moduleStyles.contextChip}><Text style={moduleStyles.contextChipText}>{currentCampus.name}</Text></View>
            ) : null}
            <View style={[moduleStyles.contextChip, { backgroundColor: '#dcfce7' }]}>
              <Text style={[moduleStyles.contextChipText, { color: '#166534' }]}>Present {counts.present}</Text>
            </View>
            <View style={[moduleStyles.contextChip, { backgroundColor: '#fee2e2' }]}>
              <Text style={[moduleStyles.contextChipText, { color: '#991b1b' }]}>Absent {counts.absent}</Text>
            </View>
            <View style={[moduleStyles.contextChip, { backgroundColor: '#fef3c7' }]}>
              <Text style={[moduleStyles.contextChipText, { color: '#92400e' }]}>Tardy {counts.tardy}</Text>
            </View>
          </View>
        </View>

        {roster.length === 0 ? (
          <View style={moduleStyles.empty}>
            <Text style={moduleStyles.emptyText}>No students on the roster yet.</Text>
          </View>
        ) : (
          roster.map((c) => {
            const status = marks[c.id];
            return (
              <View key={c.id} style={moduleStyles.card}>
                <View style={[moduleStyles.cardRow, { justifyContent: 'space-between' }]}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={moduleStyles.cardTitle}>{c.name || c.firstName || 'Student'}</Text>
                    <Text style={moduleStyles.cardMeta}>{c.age ? `Age ${c.age}` : '—'}</Text>
                  </View>
                  <View style={{ flexDirection: 'row' }}>
                    {[
                      { key: 'present', label: 'P', color: '#16a34a' },
                      { key: 'tardy', label: 'T', color: '#d97706' },
                      { key: 'absent', label: 'A', color: '#dc2626' },
                    ].map((opt) => (
                      <TouchableOpacity
                        key={opt.key}
                        onPress={() => setMark(c.id, opt.key)}
                        style={{
                          minWidth: 36,
                          paddingVertical: 6,
                          paddingHorizontal: 8,
                          borderRadius: 8,
                          marginLeft: 6,
                          backgroundColor: status === opt.key ? opt.color : '#f1f5f9',
                        }}
                        accessibilityLabel={`Mark ${opt.key} for ${c.name || 'student'}`}
                      >
                        <Text style={{ color: status === opt.key ? '#fff' : '#0f172a', textAlign: 'center', fontWeight: '800' }}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            );
          })
        )}

        <TouchableOpacity onPress={submit} style={moduleStyles.primaryBtn} accessibilityLabel="Save attendance">
          <Text style={moduleStyles.primaryBtnText}>Save attendance</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenWrapper>
  );
}
