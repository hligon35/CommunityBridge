import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Image, Platform, TextInput } from 'react-native';
import { useData } from '../DataContext';
import { useNavigation } from '@react-navigation/native';
// header provided by ScreenWrapper
import { ScreenWrapper, CenteredContainer, WebColumns, WebStickySection, WebSurface } from '../components/ScreenWrapper';
import { avatarSourceFor } from '../utils/idVisibility';

export default function StudentDirectoryScreen() {
  const { children } = useData();
  const navigation = useNavigation();
  const [query, setQuery] = React.useState('');
  const isWeb = Platform.OS === 'web';

  const filteredChildren = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return children || [];
    return (children || []).filter((item) => {
      const haystack = [item?.name, item?.age, item?.room, item?.carePlan].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(normalized);
    });
  }, [children, query]);

  const renderItem = ({ item }) => (
    <View style={[styles.row, isWeb ? styles.rowWeb : null]}>
      <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} onPress={() => navigation.navigate('ChildDetail', { childId: item.id })}>
        <Image source={avatarSourceFor(item)} style={styles.avatar} />
        <View style={styles.info}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>{item.age} • {item.room}</Text>
          {item.carePlan ? <Text numberOfLines={2} style={styles.care}>{item.carePlan}</Text> : null}
        </View>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScreenWrapper style={styles.container}>
      <CenteredContainer contentStyle={isWeb ? { maxWidth: 1120 } : null}>
        {isWeb ? (
          <WebColumns
            left={(
              <WebStickySection>
                <WebSurface>
                  <Text style={styles.sidebarTitle}>Directory</Text>
                  <Text style={styles.sidebarText}>Browse students by name, room, age, or care plan details.</Text>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricValue}>{filteredChildren.length}</Text>
                    <Text style={styles.metricLabel}>Visible students</Text>
                  </View>
                </WebSurface>
              </WebStickySection>
            )}
            main={(
              <WebSurface style={{ padding: 0, overflow: 'hidden' }}>
                <View style={styles.headerBlock}>
                  <Text style={styles.headerTitle}>Student Directory</Text>
                  <Text style={styles.headerText}>A denser desktop view for quick scanning and profile access.</Text>
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search students, rooms, or care plans"
                    style={styles.searchInput}
                  />
                </View>
                <FlatList
                  data={filteredChildren}
                  keyExtractor={(i) => i.id}
                  renderItem={renderItem}
                  ListEmptyComponent={<View style={styles.empty}><Text style={{ color: '#666' }}>No students available</Text></View>}
                  contentContainerStyle={{ padding: 16 }}
                />
              </WebSurface>
            )}
          />
        ) : (
          <>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search students"
              style={styles.searchInput}
            />
            <FlatList
              data={filteredChildren}
              keyExtractor={(i) => i.id}
              renderItem={renderItem}
              ListEmptyComponent={<View style={styles.empty}><Text style={{ color: '#666' }}>No students available</Text></View>}
              contentContainerStyle={{ paddingBottom: 12 }}
            />
          </>
        )}
      </CenteredContainer>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#fff', borderRadius: 16, marginBottom: 10 },
  rowWeb: { borderWidth: 1, borderColor: '#e5e7eb' },
  avatar: { width: 56, height: 56, borderRadius: 28, marginRight: 12, backgroundColor: '#ddd' },
  info: { flex: 1 },
  name: { fontWeight: '700', fontSize: 16 },
  meta: { color: '#6b7280', marginTop: 4 },
  care: { color: '#374151', marginTop: 6 },
  empty: { padding: 24, alignItems: 'center' },
  headerBlock: { padding: 18, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  headerText: { marginTop: 6, color: '#64748b' },
  searchInput: { marginTop: 14, borderWidth: 1, borderColor: '#d7dee7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fff' },
  sidebarTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  sidebarText: { marginTop: 8, color: '#64748b', lineHeight: 20 },
  metricCard: { marginTop: 16, borderRadius: 16, backgroundColor: '#eff6ff', padding: 16, borderWidth: 1, borderColor: '#dbeafe' },
  metricValue: { fontSize: 26, fontWeight: '800', color: '#1d4ed8' },
  metricLabel: { marginTop: 4, color: '#475569', fontWeight: '600' },
  actions: { flexDirection: 'row', alignItems: 'center' },
  iconTouch: { paddingHorizontal: 8, display: 'none' },
});
