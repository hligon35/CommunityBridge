import React, { useCallback, useState } from 'react';
import { Platform, TextInput, TouchableOpacity, View, Text, StyleSheet } from 'react-native';

let DateTimePicker = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line global-require
    DateTimePicker = require('@react-native-community/datetimepicker').default;
  } catch (_) {
    DateTimePicker = null;
  }
}

function toTimeString(date) {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function parseTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  const base = new Date();
  if (!match) {
    base.setHours(9, 0, 0, 0);
    return base;
  }
  base.setHours(
    Math.max(0, Math.min(23, Number(match[1]))),
    Math.max(0, Math.min(59, Number(match[2]))),
    0,
    0,
  );
  return base;
}

export default function TimeField({
  value,
  onChangeText,
  placeholder,
  editable = true,
  style,
  inputStyle,
  testID,
  accessibilityLabel,
}) {
  const [showPicker, setShowPicker] = useState(false);
  const safeValue = String(value || '');

  const handleNativeChange = useCallback((event, selectedDate) => {
    if (Platform.OS !== 'ios') setShowPicker(false);
    if (event?.type === 'dismissed') return;
    const next = toTimeString(selectedDate);
    if (next && typeof onChangeText === 'function') onChangeText(next);
  }, [onChangeText]);

  if (Platform.OS === 'web') {
    return (
      <TextInput
        // eslint-disable-next-line react/no-unknown-property
        type="time"
        value={safeValue}
        onChangeText={onChangeText}
        editable={editable}
        placeholder={placeholder}
        style={[styles.input, inputStyle, style]}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
      />
    );
  }

  if (!DateTimePicker) {
    return (
      <TextInput
        value={safeValue}
        onChangeText={onChangeText}
        editable={editable}
        placeholder={placeholder}
        style={[styles.input, inputStyle, style]}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
      />
    );
  }

  return (
    <View style={style}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || placeholder || 'Select time'}
        onPress={() => { if (editable) setShowPicker(true); }}
        disabled={!editable}
        testID={testID}
      >
        <View pointerEvents="none">
          <TextInput
            value={safeValue}
            placeholder={placeholder}
            editable={false}
            style={[styles.input, inputStyle]}
          />
        </View>
      </TouchableOpacity>
      {showPicker ? (
        <DateTimePicker
          value={parseTime(safeValue)}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleNativeChange}
        />
      ) : null}
      {!editable && !safeValue ? <Text style={styles.hint}>Not recorded</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    color: '#0f172a',
    marginTop: 8,
  },
  hint: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
});