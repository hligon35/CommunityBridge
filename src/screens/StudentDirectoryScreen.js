import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useData } from '../DataContext';
import { useNavigation } from '@react-navigation/native';
// header provided by ScreenWrapper
import { ScreenWrapper } from '../components/ScreenWrapper';
import { avatarSourceFor } from '../utils/idVisibility';

export default function StudentDirectoryScreen() {
  const { children } = useData();
  const navigation = useNavigation();

  const renderItem = ({ item }) => (
    <View style={styles.row}>
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
      
      <FlatList
        data={children || []}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        ListEmptyComponent={<View style={styles.empty}><Text style={{ color: '#666' }}>No students available</Text></View>}
        contentContainerStyle={{ padding: 12 }}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  avatar: { width: 56, height: 56, borderRadius: 28, marginRight: 12, backgroundColor: '#ddd' },
  info: { flex: 1 },
  name: { fontWeight: '700', fontSize: 16 },
  meta: { color: '#6b7280', marginTop: 4 },
  care: { color: '#374151', marginTop: 6 },
  empty: { padding: 24, alignItems: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center' },
  iconTouch: { paddingHorizontal: 8, display: 'none' },
  
});
