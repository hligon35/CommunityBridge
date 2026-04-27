import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { ScreenWrapper } from '../../components/ScreenWrapper';
import { useTenant } from '../../core/tenant/TenantContext';
import { logPress } from '../../utils/logger';
import moduleStyles from './ModuleStyles';

export default function ProgramDirectoryScreen() {
  const tenant = useTenant() || {};
  const {
    programs = [],
    currentOrganization,
    currentProgramId,
    setSelectedProgramId,
    featureFlags = {},
  } = tenant;
  const enabled = featureFlags.programDirectory !== false;

  const sorted = useMemo(
    () => [...programs].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''))),
    [programs]
  );

  if (!enabled) {
    return (
      <ScreenWrapper>
        <ScrollView contentContainerStyle={moduleStyles.content}>
          <View style={moduleStyles.empty}>
            <Text style={moduleStyles.emptyText}>Program directory is not enabled for this organization.</Text>
          </View>
        </ScrollView>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <ScrollView contentContainerStyle={moduleStyles.content}>
        <View style={moduleStyles.header}>
          <Text style={moduleStyles.title}>Program Directory</Text>
          <Text style={moduleStyles.subtitle}>{currentOrganization?.name || 'Organization'} programs</Text>
        </View>

        {sorted.length === 0 ? (
          <View style={moduleStyles.empty}>
            <Text style={moduleStyles.emptyText}>No programs configured yet.</Text>
          </View>
        ) : (
          sorted.map((p) => {
            const active = p.id === currentProgramId;
            return (
              <View key={p.id} style={moduleStyles.card}>
                <View style={[moduleStyles.cardRow, { justifyContent: 'space-between' }]}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <View style={moduleStyles.cardRow}>
                      <Text style={moduleStyles.cardTitle}>{p.name || 'Program'}</Text>
                      {active ? (
                        <View style={moduleStyles.badge}>
                          <Text style={moduleStyles.badgeText}>Active</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={moduleStyles.cardMeta}>
                      {(p.type || 'program').toString().replaceAll('_', ' ').toLowerCase()}
                    </Text>
                  </View>
                  {!active && setSelectedProgramId ? (
                    <TouchableOpacity
                      onPress={() => { logPress('ProgramDirectory:Select', { id: p.id }); setSelectedProgramId(p.id); }}
                      style={moduleStyles.secondaryBtn}
                      accessibilityLabel={`Select program ${p.name}`}
                    >
                      <Text style={moduleStyles.secondaryBtnText}>Select</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}
