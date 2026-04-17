import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Image } from 'react-native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useData } from '../DataContext';
import { useAuth } from '../AuthContext';
import { pravatarUriFor } from '../utils/idVisibility';
import { findLinkedTherapistId } from '../utils/directoryLinking';

function StudentCard({ student, resolveParents }) {
  return (
    <View style={styles.studentCard}>
      <View style={styles.rowSmall}>
        <Image source={{ uri: student.avatar }} style={styles.tinyAvatar} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.nameSmall}>{student.name}</Text>
          <Text style={styles.metaSmall}>{student.age} • {student.room}</Text>
          <Text style={styles.studentDetail}>Parents: {resolveParents(student).map((p) => p.name || String(p)).join(', ')}</Text>
          {student.bcaTherapist ? <Text style={styles.studentDetail}>BCBA: {student.bcaTherapist.name}</Text> : null}
        </View>
      </View>
    </View>
  );
}

export default function MyClassScreen() {
  const { children = [], therapists = [], parents = [] } = useData();
  const { user } = useAuth();
  const uid = user?.id;
  const linkedTherapistId = findLinkedTherapistId(user, therapists) || uid;

  const role = (user?.role || '').toString().toLowerCase();
  const isBCBA = role.includes('bcba');
  const isTherapist = role.includes('therapist') || isBCBA;

  const amStudents = useMemo(
    () => (children || []).filter((c) => c?.amTherapist && c.amTherapist.id === linkedTherapistId),
    [children, linkedTherapistId]
  );
  const pmStudents = useMemo(
    () => (children || []).filter((c) => c?.pmTherapist && c.pmTherapist.id === linkedTherapistId),
    [children, linkedTherapistId]
  );

  const abasManaged = useMemo(() => {
    if (!isBCBA) return [];
    return (therapists || []).filter((t) => t && t.supervisedBy === linkedTherapistId);
  }, [therapists, linkedTherapistId, isBCBA]);

  const studentsForAba = (abaId) => (children || []).filter((c) => (c?.amTherapist && c.amTherapist.id === abaId) || (c?.pmTherapist && c.pmTherapist.id === abaId));

  const resolveParents = (student) => {
    const list = student?.parents || [];
    return list
      .map((p) => {
        if (!p) return null;
        if (typeof p === 'object' && p.id) return (parents || []).find((pp) => pp.id === p.id) || p;
        if (typeof p === 'string') return (parents || []).find((pp) => pp.id === p) || { id: p, name: p };
        return p;
      })
      .filter(Boolean);
  };

  return (
    <ScreenWrapper bannerShowBack={false} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {isTherapist ? (
          <>
            <Text style={styles.pageHeader}>My Class</Text>

            <Text style={styles.sectionTitle}>AM Students</Text>
            {(amStudents || []).length ? (
              <View style={styles.studentGrid}>
                {amStudents.map((s) => (
                  <StudentCard key={s.id} student={s} resolveParents={resolveParents} />
                ))}
              </View>
            ) : (
              <Text style={styles.paragraph}>No AM students assigned.</Text>
            )}

            <Text style={[styles.sectionTitle, { marginTop: 12 }]}>PM Students</Text>
            {(pmStudents || []).length ? (
              <View style={styles.studentGrid}>
                {pmStudents.map((s) => (
                  <StudentCard key={s.id} student={s} resolveParents={resolveParents} />
                ))}
              </View>
            ) : (
              <Text style={styles.paragraph}>No PM students assigned.</Text>
            )}
          </>
        ) : (
          <Text style={styles.paragraph}>No class assigned.</Text>
        )}

        {isBCBA ? (
          <>
            <Text style={[styles.pageHeader, { marginTop: 16 }]}>My Team</Text>
            {(abasManaged || []).length ? (
              abasManaged.map((aba) => {
                const abaStudents = studentsForAba(aba.id);
                return (
                  <View key={aba.id} style={styles.card}>
                    <View style={styles.row}>
                      <Image source={{ uri: aba.avatar || pravatarUriFor(aba, 64) }} style={styles.avatar} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name}>{aba.name}</Text>
                        <Text style={styles.meta}>{aba.role || 'ABA'}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontWeight: '700' }}>{abaStudents.length}</Text>
                        <Text style={{ color: '#6b7280' }}>students</Text>
                      </View>
                    </View>

                    {abaStudents.length ? (
                      <View style={[styles.studentGrid, { marginTop: 12 }]}>
                        {abaStudents.map((s) => (
                          <StudentCard key={s.id} student={s} resolveParents={resolveParents} />
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.paragraph}>No students assigned.</Text>
                    )}
                  </View>
                );
              })
            ) : (
              <Text style={styles.paragraph}>You do not currently manage any ABAs.</Text>
            )}
          </>
        ) : null}

        <View style={{ height: 32 }} />
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16 },
  pageHeader: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  sectionTitle: { marginTop: 8, fontWeight: '700' },
  paragraph: { marginTop: 8, color: '#374151' },

  card: { marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#eef2f7', backgroundColor: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#eee' },
  name: { fontSize: 20, fontWeight: '700' },
  meta: { color: '#6b7280' },

  studentGrid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  studentCard: { width: '48%', marginTop: 12, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#eef2f7', backgroundColor: '#fff' },

  rowSmall: { flexDirection: 'row', alignItems: 'center' },
  tinyAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#eee' },
  nameSmall: { fontWeight: '700' },
  metaSmall: { color: '#6b7280' },
  studentDetail: { color: '#6b7280', marginTop: 6, fontSize: 12 },
});
