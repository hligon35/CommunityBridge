import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

export default function LogoTitle({ width = 120, height = 36, style }) {
  return (
    <View style={styles.wrap}>
      <Image source={require('../../public/banner.png')} style={[{ width, height, resizeMode: 'contain' }, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 0, paddingHorizontal: 0, marginVertical: -6 },
  text: { fontSize: 20, fontWeight: '800', color: '#5a20c5ff' },
});
