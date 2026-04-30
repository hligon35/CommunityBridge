import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScreenWrapper } from '../../components/ScreenWrapper';
import { useTenant } from '../../core/tenant/TenantContext';
import { logPress } from '../../utils/logger';
import moduleStyles from './ModuleStyles';
import * as Api from '../../Api';

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
  const [viewMode, setViewMode] = useState('library');
  const [draftTarget, setDraftTarget] = useState('');
  const [draftPromptHierarchy, setDraftPromptHierarchy] = useState('Verbal -> Model -> Gestural -> Physical');
  const [draftMasteryCriteria, setDraftMasteryCriteria] = useState('80% across 3 sessions');
  const [draftGeneralizationPlan, setDraftGeneralizationPlan] = useState('Practice across staff, rooms, and materials.');
  const [sharedDraftState, setSharedDraftState] = useState('idle');
  const editorDraftKey = `program_editor_draft_${String(currentOrganization?.id || 'org')}_${String(currentProgramId || 'default')}`;
  const learnerPrograms = useMemo(() => sorted.map((program, index) => ({
    id: `${program.id || index}`,
    name: program.name || 'Program',
    status: program.id === currentProgramId ? 'Active' : index % 2 === 0 ? 'In Progress' : 'Review',
    mastery: index % 2 === 0 ? 'Emerging' : 'Maintaining',
    lastUpdated: program.updatedAt || program.createdAt || 'Recently updated',
  })), [sorted, currentProgramId]);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const shared = currentProgramId ? await Api.getProgramWorkspace(currentProgramId).catch(() => null) : null;
        const sharedItem = shared?.item && typeof shared.item === 'object' ? shared.item : null;
        if (!disposed && sharedItem) {
          setDraftTarget(String(sharedItem.targetName || ''));
          setDraftPromptHierarchy(String(sharedItem.promptHierarchy || 'Verbal -> Model -> Gestural -> Physical'));
          setDraftMasteryCriteria(String(sharedItem.masteryCriteria || '80% across 3 sessions'));
          setDraftGeneralizationPlan(String(sharedItem.generalizationPlan || 'Practice across staff, rooms, and materials.'));
          setSharedDraftState(sharedItem.reviewedAt ? 'reviewed' : 'synced');
          return;
        }
        const raw = await AsyncStorage.getItem(editorDraftKey);
        if (disposed || !raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          setDraftTarget(String(parsed.draftTarget || ''));
          setDraftPromptHierarchy(String(parsed.draftPromptHierarchy || 'Verbal -> Model -> Gestural -> Physical'));
          setDraftMasteryCriteria(String(parsed.draftMasteryCriteria || '80% across 3 sessions'));
          setDraftGeneralizationPlan(String(parsed.draftGeneralizationPlan || 'Practice across staff, rooms, and materials.'));
        }
      } catch (_) {
        // ignore storage failures
      }
    })();
    return () => {
      disposed = true;
    };
  }, [editorDraftKey]);

  useEffect(() => {
    if (viewMode !== 'editor') return;
    AsyncStorage.setItem(editorDraftKey, JSON.stringify({
      draftTarget,
      draftPromptHierarchy,
      draftMasteryCriteria,
      draftGeneralizationPlan,
    })).catch(() => {});
  }, [draftGeneralizationPlan, draftMasteryCriteria, draftPromptHierarchy, draftTarget, editorDraftKey, viewMode]);

  async function saveSharedDraft(reviewedAt = null) {
    if (!currentProgramId) {
      Alert.alert('No program selected', 'Select a program before saving the shared draft.');
      return;
    }
    try {
      setSharedDraftState('saving');
      await Api.updateProgramWorkspace(currentProgramId, {
        organizationId: currentOrganization?.id,
        targetName: draftTarget,
        promptHierarchy: draftPromptHierarchy,
        masteryCriteria: draftMasteryCriteria,
        generalizationPlan: draftGeneralizationPlan,
        reviewedAt,
      });
      await AsyncStorage.setItem(editorDraftKey, JSON.stringify({
        draftTarget,
        draftPromptHierarchy,
        draftMasteryCriteria,
        draftGeneralizationPlan,
        reviewedAt,
      }));
      setSharedDraftState(reviewedAt ? 'reviewed' : 'synced');
    } catch (e) {
      setSharedDraftState('error');
      Alert.alert('Save failed', String(e?.message || e || 'Could not save the program workspace.'));
    }
  }

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
          <View style={[moduleStyles.cardRow, { marginTop: 12, flexWrap: 'wrap' }]}>
            {[
              { key: 'library', label: 'Library' },
              { key: 'learner', label: 'Student Programs' },
              { key: 'editor', label: 'Editor' },
            ].map((mode) => (
              <TouchableOpacity key={mode.key} onPress={() => setViewMode(mode.key)} style={[moduleStyles.secondaryBtn, viewMode === mode.key ? { backgroundColor: '#dbeafe', borderColor: '#2563eb' } : null, { marginRight: 8, marginTop: 8 }]}>
                <Text style={[moduleStyles.secondaryBtnText, viewMode === mode.key ? { color: '#1d4ed8' } : null]}>{mode.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {sorted.length === 0 ? (
          <View style={moduleStyles.empty}>
            <Text style={moduleStyles.emptyText}>No programs configured yet.</Text>
          </View>
        ) : viewMode === 'library' ? (
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
        ) : null}

        {sorted.length > 0 && viewMode === 'learner' ? (
          learnerPrograms.map((program) => (
            <View key={program.id} style={moduleStyles.card}>
              <View style={[moduleStyles.cardRow, { justifyContent: 'space-between', alignItems: 'center' }]}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={moduleStyles.cardTitle}>{program.name}</Text>
                  <Text style={moduleStyles.cardMeta}>{program.status} • {program.mastery}</Text>
                  <Text style={[moduleStyles.cardMeta, { marginTop: 6 }]}>Last updated: {program.lastUpdated}</Text>
                </View>
                <View style={moduleStyles.badge}>
                  <Text style={moduleStyles.badgeText}>{program.status}</Text>
                </View>
              </View>
            </View>
          ))
        ) : null}

        {viewMode === 'editor' ? (
          <View style={moduleStyles.card}>
            <Text style={moduleStyles.cardTitle}>Program Editor</Text>
            <Text style={[moduleStyles.cardMeta, { marginBottom: 12 }]}>Configure targets, prompts, mastery criteria, and generalization planning for BCBA review.</Text>
            <TextInput value={draftTarget} onChangeText={setDraftTarget} placeholder="Target name" style={editorStyles.input} />
            <TextInput value={draftPromptHierarchy} onChangeText={setDraftPromptHierarchy} placeholder="Prompt hierarchy" style={editorStyles.input} />
            <TextInput value={draftMasteryCriteria} onChangeText={setDraftMasteryCriteria} placeholder="Mastery criteria" style={editorStyles.input} />
            <TextInput value={draftGeneralizationPlan} onChangeText={setDraftGeneralizationPlan} placeholder="Generalization plan" multiline style={[editorStyles.input, editorStyles.multiline]} />
            <View style={[moduleStyles.cardRow, { justifyContent: 'space-between', marginTop: 12 }]}>
              <View style={moduleStyles.badge}><Text style={moduleStyles.badgeText}>{sharedDraftState === 'reviewed' ? 'Shared Review Ready' : sharedDraftState === 'synced' ? 'Shared Draft Saved' : 'BCBA Workspace'}</Text></View>
              <TouchableOpacity style={moduleStyles.secondaryBtn} accessibilityLabel="Save editor draft" onPress={() => saveSharedDraft(null)}>
                <Text style={moduleStyles.secondaryBtnText}>Save Draft</Text>
              </TouchableOpacity>
            </View>
            <View style={[moduleStyles.cardRow, { justifyContent: 'flex-end', marginTop: 8 }]}>
              <TouchableOpacity style={moduleStyles.secondaryBtn} accessibilityLabel="Mark draft ready for review" onPress={() => saveSharedDraft(new Date().toISOString())}>
                <Text style={moduleStyles.secondaryBtnText}>Mark Ready For Review</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </ScreenWrapper>
  );
}

const editorStyles = {
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
};
