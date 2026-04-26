import React from 'react';
import { Image, StyleSheet, TouchableOpacity } from 'react-native';

const onToggleIcon = require('../../assets/icons/onToggle.png');
const offToggleIcon = require('../../assets/icons/offToggle.png');

export default function ImageToggle({ value, onValueChange, disabled = false, accessibilityLabel, style }) {
  return (
    <TouchableOpacity
      onPress={() => {
        if (!disabled && typeof onValueChange === 'function') onValueChange(!value);
      }}
      activeOpacity={disabled ? 1 : 0.85}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: !!value, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel}
      style={[styles.button, style]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Image
        source={value ? onToggleIcon : offToggleIcon}
        style={[styles.image, disabled ? styles.imageDisabled : null]}
        resizeMode="contain"
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 58,
    minHeight: 36,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  image: {
    width: 54,
    height: 54,
  },
  imageDisabled: {
    opacity: 0.45,
  },
});