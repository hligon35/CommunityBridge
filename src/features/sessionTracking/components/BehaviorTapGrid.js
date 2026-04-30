import React, { useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const INTENSITY_OPTIONS = Object.freeze(['Precursor', 'Low', 'Moderate', 'High', 'Hazardous']);

export default function BehaviorTapGrid({ groups = [], queuedEvents = [], disabled = false, onQueueEvent, onUndoLast }) {
  const [intensityPicker, setIntensityPicker] = useState(null);
  const [variantPicker, setVariantPicker] = useState(null);
  const [textPromptState, setTextPromptState] = useState(null);
  const [textPromptValue, setTextPromptValue] = useState('');

  const queuedPreview = useMemo(() => queuedEvents.slice(-4).reverse(), [queuedEvents]);

  function queuePreset(preset, intensityOverride = null, variantOption = null) {
    if (!preset || typeof onQueueEvent !== 'function') return;
    const payload = {
      ...preset.payload,
      intensity: intensityOverride || preset.payload?.intensity || null,
      metadata: {
        ...(preset.payload?.metadata || {}),
        ...(variantOption?.metadata || {}),
      },
    };
    onQueueEvent(payload, preset, intensityOverride, variantOption);
  }

  function openTextPrompt(preset, variantOption) {
    const textPrompt = preset?.variantPrompt?.textPrompt;
    if (!textPrompt) {
      queuePreset(preset, null, variantOption);
      return;
    }
    setTextPromptState({ preset, variantOption, textPrompt });
    setTextPromptValue('');
  }

  function handleLongPress(preset) {
    if (!preset?.payload || preset.payload.eventType !== 'behavior') {
      queuePreset(preset);
      return;
    }
    setIntensityPicker(preset);
  }

  function handlePress(preset) {
    if (preset?.variantPrompt?.options?.length) {
      setVariantPicker(preset);
      return;
    }
    queuePreset(preset);
  }

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>Live Tap Tracker</Text>
          <Text style={styles.instructionsText}>Tap to queue an event. Long-press behavior cards to choose intensity before sync.</Text>
        </View>
        <TouchableOpacity style={[styles.undoButton, (!queuedEvents.length || disabled) ? styles.undoButtonDisabled : null]} disabled={!queuedEvents.length || disabled} onPress={onUndoLast}>
          <Text style={styles.undoButtonText}>Undo Last</Text>
        </TouchableOpacity>
      </View>

      {queuedPreview.length ? (
        <View style={styles.queueWrap}>
          <Text style={styles.queueTitle}>Queued before sync</Text>
          <View style={styles.queueChipRow}>
            {queuedPreview.map((event) => (
              <View key={event.localId} style={styles.queueChip}>
                <Text style={styles.queueChipText} numberOfLines={1}>{event.label}</Text>
                {event.intensity ? <Text style={styles.queueChipMeta}>{event.intensity}</Text> : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {groups.map((group) => (
        <View key={group.key} style={styles.section}>
          <Text style={styles.sectionTitle}>{group.title}</Text>
          <View style={styles.grid}>
            {group.items.map((preset) => (
              <TouchableOpacity
                key={preset.key}
                style={[styles.tile, disabled ? styles.tileDisabled : null]}
                activeOpacity={0.88}
                disabled={disabled}
                onPress={() => handlePress(preset)}
                onLongPress={() => handleLongPress(preset)}
                delayLongPress={220}
              >
                <Text style={styles.tileLabel}>{preset.label}</Text>
                <Text style={styles.tileDescription}>{preset.description}</Text>
                {preset?.variantPrompt?.options?.length ? <Text style={styles.tileMetaHint}>Tap to choose detail</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      <Modal transparent visible={!!intensityPicker} animationType="fade" onRequestClose={() => setIntensityPicker(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{intensityPicker?.label || 'Behavior intensity'}</Text>
            <Text style={styles.modalSubtitle}>Choose intensity for this event.</Text>
            <View style={styles.modalOptions}>
              {INTENSITY_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={styles.modalOption}
                  onPress={() => {
                    const preset = intensityPicker;
                    setIntensityPicker(null);
                    if (preset) queuePreset(preset, option);
                  }}
                >
                  <Text style={styles.modalOptionText}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setIntensityPicker(null)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={!!variantPicker} animationType="fade" onRequestClose={() => setVariantPicker(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{variantPicker?.variantPrompt?.title || variantPicker?.label || 'Choose detail'}</Text>
            <Text style={styles.modalSubtitle}>Add structured detail before the event is queued.</Text>
            <View style={styles.modalOptions}>
              {(variantPicker?.variantPrompt?.options || []).map((option) => (
                <TouchableOpacity
                  key={option.label}
                  style={styles.modalOption}
                  onPress={() => {
                    const preset = variantPicker;
                    setVariantPicker(null);
                    if (preset) openTextPrompt(preset, option);
                  }}
                >
                  <Text style={styles.modalOptionText}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setVariantPicker(null)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={!!textPromptState} animationType="fade" onRequestClose={() => setTextPromptState(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{textPromptState?.textPrompt?.title || 'Add detail'}</Text>
            <Text style={styles.modalSubtitle}>Capture short structured context for this event.</Text>
            <TextInput
              value={textPromptValue}
              onChangeText={setTextPromptValue}
              placeholder={textPromptState?.textPrompt?.placeholder || 'Enter detail'}
              multiline
              style={styles.modalInput}
            />
            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.modalSecondaryButton} onPress={() => setTextPromptState(null)}>
                <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalPrimaryButton, !textPromptValue.trim() ? styles.modalPrimaryButtonDisabled : null]}
                disabled={!textPromptValue.trim()}
                onPress={() => {
                  const promptState = textPromptState;
                  setTextPromptState(null);
                  if (!promptState?.preset) return;
                  const metadataKey = promptState?.textPrompt?.metadataKey || 'noteText';
                  const variantOption = {
                    ...(promptState.variantOption || {}),
                    metadata: {
                      ...(promptState.variantOption?.metadata || {}),
                      [metadataKey]: textPromptValue.trim(),
                    },
                  };
                  queuePreset(promptState.preset, null, variantOption);
                }}
              >
                <Text style={styles.modalPrimaryButtonText}>Queue Event</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginTop: 12 },
  headerRow: { marginBottom: 8 },
  instructionsCard: {
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    padding: 12,
  },
  instructionsTitle: { fontSize: 15, fontWeight: '800', color: '#1e3a8a' },
  instructionsText: { marginTop: 4, color: '#334155', lineHeight: 18 },
  undoButton: {
    alignSelf: 'flex-end',
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  undoButtonDisabled: { opacity: 0.45 },
  undoButtonText: { color: '#0f172a', fontWeight: '800' },
  queueWrap: { marginTop: 12 },
  queueTitle: { fontWeight: '700', color: '#334155', marginBottom: 8 },
  queueChipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  queueChip: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginRight: 8,
    marginBottom: 8,
  },
  queueChipText: { fontWeight: '700', color: '#0f172a', maxWidth: 160 },
  queueChipMeta: { marginTop: 2, color: '#64748b', fontSize: 11 },
  section: { marginTop: 14 },
  sectionTitle: { fontWeight: '800', color: '#0f172a', marginBottom: 10, fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  tile: {
    width: '48%',
    minHeight: 104,
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    marginBottom: 10,
    justifyContent: 'space-between',
  },
  tileDisabled: { opacity: 0.5 },
  tileLabel: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  tileDescription: { marginTop: 8, color: '#475569', lineHeight: 18, fontSize: 12 },
  tileMetaHint: { marginTop: 8, color: '#2563eb', fontSize: 11, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 18,
    backgroundColor: '#ffffff',
    padding: 18,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  modalSubtitle: { marginTop: 4, color: '#64748b' },
  modalOptions: { marginTop: 14 },
  modalOption: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    marginBottom: 8,
  },
  modalOptionText: { color: '#1d4ed8', fontWeight: '800' },
  modalCancel: { marginTop: 4, alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 4 },
  modalCancelText: { color: '#64748b', fontWeight: '700' },
  modalInput: {
    marginTop: 14,
    minHeight: 90,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  modalActionRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 },
  modalSecondaryButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#e2e8f0', marginRight: 8 },
  modalSecondaryButtonText: { color: '#0f172a', fontWeight: '700' },
  modalPrimaryButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#2563eb' },
  modalPrimaryButtonDisabled: { opacity: 0.45 },
  modalPrimaryButtonText: { color: '#ffffff', fontWeight: '700' },
});