import React, { useState, useCallback } from 'react';
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

function toIsoDateString(date) {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseIsoDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  // Accept YYYY-MM-DD; tolerate MM/DD/YYYY by best-effort parse.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (us) {
    const d = new Date(Number(us[3]), Number(us[1]) - 1, Number(us[2]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * DateField — cross-platform date input that emits an ISO YYYY-MM-DD string.
 *
 * - Web: native <input type="date"> via React Native Web's TextInput (props passed through).
 * - Native: tappable field that opens DateTimePicker if available; falls back to a
 *   plain TextInput if the dependency cannot be loaded.
 *
 * The component is intentionally additive: callers that previously rendered a
 * TextInput with a free-form string keep working because this component
 * preserves the same string-shaped value contract.
 */
export default function DateField({
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
    setShowPicker(false);
    if (event?.type === 'dismissed') return;
    const next = toIsoDateString(selectedDate);
    if (next && typeof onChangeText === 'function') onChangeText(next);
  }, [onChangeText]);

  if (Platform.OS === 'web') {
    return (
      <TextInput
        // React Native Web passes unknown props through to the underlying DOM <input>.
        // `type="date"` renders a native browser date picker on web.
        // On native this prop is ignored, but we never reach this branch on native.
        // eslint-disable-next-line react/no-unknown-property
        type="date"
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
    // Graceful fallback: no picker available, behave like the original TextInput.
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

  const parsed = parseIsoDate(safeValue) || new Date();

  return (
    <View style={style}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || placeholder || 'Select date'}
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
          value={parsed}
          mode="date"
          display={Platform.OS === 'android' ? 'default' : 'inline'}
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
