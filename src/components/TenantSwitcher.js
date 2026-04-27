import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTenant } from '../core/tenant/TenantContext';

/**
 * Lightweight program/campus switcher chips.
 * Renders only when:
 *  - tenant context is available
 *  - the corresponding feature flag is enabled (programSwitcher / campusSwitcher)
 *  - the user has more than one program/campus to choose from
 *
 * Keep this purely cosmetic; selection is persisted via TenantContext.
 */
export default function TenantSwitcher({ style, compact = false }) {
  const tenant = useTenant();
  if (!tenant) return null;

  const {
    programs = [],
    campuses = [],
    currentProgramId,
    currentCampusId,
    setSelectedProgramId,
    setSelectedCampusId,
    featureFlags = {},
  } = tenant;

  const showProgramRow = featureFlags.programSwitcher !== false && Array.isArray(programs) && programs.length > 1;
  const showCampusRow = featureFlags.campusSwitcher !== false && Array.isArray(campuses) && campuses.length > 1;

  if (!showProgramRow && !showCampusRow) return null;

  return (
    <View style={[styles.container, compact && styles.containerCompact, style]}>
      {showProgramRow ? (
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Program</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipTrack}>
            {programs.map((program) => {
              const id = program.id;
              const active = id === currentProgramId;
              return (
                <TouchableOpacity
                  key={id}
                  onPress={() => setSelectedProgramId(id)}
                  style={[styles.chip, active && styles.chipActive]}
                  accessibilityLabel={`Switch program to ${program.name || id}`}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                    {program.name || id}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {showCampusRow ? (
        <View style={[styles.row, showProgramRow && { marginTop: 8 }]}>
          <Text style={styles.rowLabel}>Campus</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipTrack}>
            {campuses.map((campus) => {
              const id = campus.id;
              const active = id === currentCampusId;
              return (
                <TouchableOpacity
                  key={id}
                  onPress={() => setSelectedCampusId(id)}
                  style={[styles.chip, active && styles.chipActive]}
                  accessibilityLabel={`Switch campus to ${campus.name || id}`}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                    {campus.name || id}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  containerCompact: {
    padding: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowLabel: {
    width: 70,
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipTrack: { paddingRight: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginRight: 8,
    maxWidth: 220,
  },
  chipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#1d4ed8',
  },
  chipText: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: '#fff' },
});
