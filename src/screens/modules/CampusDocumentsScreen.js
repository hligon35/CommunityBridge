import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../components/ScreenWrapper';
import { useTenant } from '../../core/tenant/TenantContext';
import { logPress } from '../../utils/logger';
import moduleStyles from './ModuleStyles';

const CAMPUS_DOC_TEMPLATES = [
  { id: 'safety-plan', title: 'Campus Safety Plan', meta: 'Emergency procedures' },
  { id: 'floor-map', title: 'Floor Map', meta: 'Rooms & exits' },
  { id: 'pickup-policy', title: 'Pickup & Dropoff Policy', meta: 'Family logistics' },
  { id: 'staff-roster', title: 'Campus Staff Roster', meta: 'On-site team' },
];

export default function CampusDocumentsScreen() {
  const tenant = useTenant() || {};
  const { currentCampus, featureFlags = {} } = tenant;
  const enabled = featureFlags.campusDocuments !== false;

  function open(doc) {
    logPress('CampusDocuments:Open', { id: doc.id });
    Alert.alert(doc.title, `${doc.meta}\n\nThis is a placeholder. Wire up document storage to view the file.`);
  }

  if (!enabled) {
    return (
      <ScreenWrapper>
        <ScrollView contentContainerStyle={moduleStyles.content}>
          <View style={moduleStyles.empty}>
            <Text style={moduleStyles.emptyText}>Campus documents are not enabled for this program.</Text>
          </View>
        </ScrollView>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <ScrollView contentContainerStyle={moduleStyles.content}>
        <View style={moduleStyles.header}>
          <Text style={moduleStyles.title}>Campus Documents</Text>
          <Text style={moduleStyles.subtitle}>{currentCampus?.name || 'Campus'} resources</Text>
        </View>

        {CAMPUS_DOC_TEMPLATES.map((doc) => (
          <TouchableOpacity key={doc.id} onPress={() => open(doc)} style={moduleStyles.card} accessibilityLabel={`Open ${doc.title}`}>
            <View style={[moduleStyles.cardRow, { justifyContent: 'space-between' }]}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={moduleStyles.cardTitle}>{doc.title}</Text>
                <Text style={moduleStyles.cardMeta}>{doc.meta}</Text>
              </View>
              <MaterialIcons name="folder" size={22} color="#475569" />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </ScreenWrapper>
  );
}
