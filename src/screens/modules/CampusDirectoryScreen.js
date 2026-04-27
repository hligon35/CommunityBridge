import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { ScreenWrapper } from '../../components/ScreenWrapper';
import { useTenant } from '../../core/tenant/TenantContext';
import { logPress } from '../../utils/logger';
import moduleStyles from './ModuleStyles';

export default function CampusDirectoryScreen() {
  const tenant = useTenant() || {};
  const {
    campuses = [],
    currentProgram,
    currentCampusId,
    setSelectedCampusId,
    featureFlags = {},
  } = tenant;
  const enabled = featureFlags.campusDirectory !== false;

  const sorted = useMemo(
    () => [...campuses].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''))),
    [campuses]
  );

  if (!enabled) {
    return (
      <ScreenWrapper>
        <ScrollView contentContainerStyle={moduleStyles.content}>
          <View style={moduleStyles.empty}>
            <Text style={moduleStyles.emptyText}>Campus directory is not enabled for this program.</Text>
          </View>
        </ScrollView>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <ScrollView contentContainerStyle={moduleStyles.content}>
        <View style={moduleStyles.header}>
          <Text style={moduleStyles.title}>Campus Directory</Text>
          <Text style={moduleStyles.subtitle}>{currentProgram?.name ? `${currentProgram.name} campuses` : 'All campuses'}</Text>
        </View>

        {sorted.length === 0 ? (
          <View style={moduleStyles.empty}>
            <Text style={moduleStyles.emptyText}>No campuses configured yet.</Text>
          </View>
        ) : (
          sorted.map((c) => {
            const active = c.id === currentCampusId;
            return (
              <View key={c.id} style={moduleStyles.card}>
                <View style={[moduleStyles.cardRow, { justifyContent: 'space-between' }]}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={moduleStyles.cardTitle}>{c.name || 'Campus'}</Text>
                    {active ? (
                      <View style={[moduleStyles.badge, { alignSelf: 'flex-start', marginTop: 4 }]}>
                        <Text style={moduleStyles.badgeText}>Active</Text>
                      </View>
                    ) : null}
                    {c.address ? <Text style={[moduleStyles.cardMeta, { marginTop: 4 }]}>{c.address}</Text> : null}
                  </View>
                  {!active && setSelectedCampusId ? (
                    <TouchableOpacity
                      onPress={() => { logPress('CampusDirectory:Select', { id: c.id }); setSelectedCampusId(c.id); }}
                      style={moduleStyles.secondaryBtn}
                      accessibilityLabel={`Select campus ${c.name}`}
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
