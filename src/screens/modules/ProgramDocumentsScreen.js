import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenWrapper } from '../../components/ScreenWrapper';
import { useTenant } from '../../core/tenant/TenantContext';
import { logPress } from '../../utils/logger';
import moduleStyles from './ModuleStyles';

const PROGRAM_DOC_TEMPLATES = [
  { id: 'handbook', title: 'Program Handbook', meta: 'Policies & expectations' },
  { id: 'curriculum', title: 'Curriculum Overview', meta: 'Learning framework' },
  { id: 'compliance', title: 'Compliance Forms', meta: 'HIPAA & consent' },
  { id: 'staff-onboarding', title: 'Staff Onboarding Guide', meta: 'New hire packet' },
];

export default function ProgramDocumentsScreen() {
  const tenant = useTenant() || {};
  const { currentProgram, featureFlags = {} } = tenant;
  const enabled = featureFlags.programDocuments !== false;

  function open(doc) {
    logPress('ProgramDocuments:Open', { id: doc.id });
    Alert.alert(doc.title, `${doc.meta}\n\nThis is a placeholder. Wire up document storage to view the file.`);
  }

  if (!enabled) {
    return (
      <ScreenWrapper>
        <ScrollView contentContainerStyle={moduleStyles.content}>
          <View style={moduleStyles.empty}>
            <Text style={moduleStyles.emptyText}>Program documents are not enabled for this program.</Text>
          </View>
        </ScrollView>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <ScrollView contentContainerStyle={moduleStyles.content}>
        <View style={moduleStyles.header}>
          <Text style={moduleStyles.title}>Program Documents</Text>
          <Text style={moduleStyles.subtitle}>{currentProgram?.name || 'Program'} resources</Text>
        </View>

        {PROGRAM_DOC_TEMPLATES.map((doc) => (
          <TouchableOpacity key={doc.id} onPress={() => open(doc)} style={moduleStyles.card} accessibilityLabel={`Open ${doc.title}`}>
            <View style={[moduleStyles.cardRow, { justifyContent: 'space-between' }]}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={moduleStyles.cardTitle}>{doc.title}</Text>
                <Text style={moduleStyles.cardMeta}>{doc.meta}</Text>
              </View>
              <MaterialIcons name="picture-as-pdf" size={22} color="#475569" />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </ScreenWrapper>
  );
}
