import React, { useEffect, useMemo, useState } from 'react';
import { Alert, View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { ScreenWrapper } from '../../components/ScreenWrapper';
import { useAuth } from '../../AuthContext';
import { useTenant } from '../../core/tenant/TenantContext';
import { listActiveOrganizations } from '../../core/tenant/OrganizationRepository';
import { listCampusesByOrganization } from '../../core/tenant/CampusRepository';
import { listProgramsByOrganization } from '../../core/tenant/ProgramRepository';
import { isScopedAdminRole } from '../../core/tenant/models';
import { maskEmailDisplay, maskPhoneDisplay } from '../../utils/inputFormat';
import { logPress } from '../../utils/logger';
import moduleStyles from './ModuleStyles';

function formatAddress(item) {
  if (!item || typeof item !== 'object') return '';
  const street = [item.address, item.address1, item.address2].filter(Boolean).join(', ').trim();
  const cityStateZip = [
    [item.city, item.state].filter(Boolean).join(', ').trim(),
    item.zipCode,
  ].filter(Boolean).join(' ').trim();
  return [street, cityStateZip].filter(Boolean).join(' • ').trim();
}

function openPhone(phone) {
  const normalized = String(phone || '').trim();
  if (!normalized) return;
  Linking.openURL(`tel:${normalized}`).catch(() => {
    Alert.alert('Unable to place call', 'Your device could not open the phone app.');
  });
}

function openEmail(email) {
  const normalized = String(email || '').trim();
  if (!normalized) return;
  Linking.openURL(`mailto:${normalized}`).catch(() => {
    Alert.alert('Unable to open email', 'Your device could not open the email app.');
  });
}

function renderContactLines(item, { phoneFallback = '', emailFallback = '', addressFallback = '' } = {}) {
  const phone = String(item?.phone || phoneFallback || '').trim();
  const email = String(item?.email || emailFallback || '').trim();
  const address = String(formatAddress(item) || addressFallback || '').trim();

  return (
    <>
      {phone ? (
        <TouchableOpacity onPress={() => openPhone(phone)} accessibilityRole="link" accessibilityLabel={`Call ${phone}`} style={{ alignSelf: 'flex-start' }}>
          <Text style={[moduleStyles.cardMeta, moduleStyles.contactLink, { marginTop: 4 }]}>{maskPhoneDisplay(phone)}</Text>
        </TouchableOpacity>
      ) : null}
      {email ? (
        <TouchableOpacity onPress={() => openEmail(email)} accessibilityRole="link" accessibilityLabel={`Email ${email}`} style={{ alignSelf: 'flex-start' }}>
          <Text style={[moduleStyles.cardMeta, moduleStyles.contactLink]}>{maskEmailDisplay(email)}</Text>
        </TouchableOpacity>
      ) : null}
      {address ? <Text style={moduleStyles.cardMeta}>{address}</Text> : null}
    </>
  );
}

export default function CampusDirectoryScreen() {
  const { user } = useAuth();
  const tenant = useTenant() || {};
  const {
    organizations = [],
    programs = [],
    campuses = [],
    currentOrganization,
    currentProgram,
    currentCampusId,
    setSelectedCampusId,
    featureFlags = {},
  } = tenant;
  const enabled = featureFlags.campusDirectory !== false;
  const [fallbackOrganizations, setFallbackOrganizations] = useState([]);
  const [fallbackPrograms, setFallbackPrograms] = useState([]);
  const [fallbackCampuses, setFallbackCampuses] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (organizations.length || programs.length || campuses.length) {
        if (!mounted) return;
        setFallbackOrganizations([]);
        setFallbackPrograms([]);
        setFallbackCampuses([]);
        return;
      }
      try {
        const publicOrganizations = await listActiveOrganizations();
        const [programGroups, campusGroups] = await Promise.all([
          Promise.all((publicOrganizations || []).map((organization) => listProgramsByOrganization(organization?.id))),
          Promise.all((publicOrganizations || []).map((organization) => listCampusesByOrganization(organization?.id, ''))),
        ]);
        if (!mounted) return;
        setFallbackOrganizations(Array.isArray(publicOrganizations) ? publicOrganizations : []);
        setFallbackPrograms(
          (programGroups || []).flat().filter((program, index, collection) => (
            collection.findIndex((item) => String(item?.id || '') === String(program?.id || '')) === index
          ))
        );
        setFallbackCampuses(
          (campusGroups || []).flat().filter((campus, index, collection) => (
            collection.findIndex((item) => String(item?.id || '') === String(campus?.id || '')) === index
          ))
        );
      } catch (_) {
        if (!mounted) return;
        setFallbackOrganizations([]);
        setFallbackPrograms([]);
        setFallbackCampuses([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [organizations, programs, campuses]);

  const visibleOrganizations = organizations.length ? organizations : fallbackOrganizations;
  const visiblePrograms = programs.length ? programs : fallbackPrograms;
  const visibleCampuses = campuses.length ? campuses : fallbackCampuses;

  const sorted = useMemo(
    () => [...visibleCampuses].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''))),
    [visibleCampuses]
  );
  const sortedOrganizations = useMemo(
    () => [...visibleOrganizations].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''))),
    [visibleOrganizations]
  );
  const sortedPrograms = useMemo(
    () => [...visiblePrograms].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''))),
    [visiblePrograms]
  );
  const canSelectCampus = isScopedAdminRole(user?.role) && typeof setSelectedCampusId === 'function';
  const combinedListings = useMemo(() => {
    const campusProgramIds = new Set(
      sorted.map((campus) => String(campus?.programId || '').trim()).filter(Boolean)
    );
    const programOnlyEntries = sortedPrograms
      .filter((program) => !campusProgramIds.has(String(program?.id || '').trim()))
      .map((program) => ({
        key: `program-${program.id}`,
        type: 'program',
        item: program,
        active: program.id === currentProgram?.id,
      }));

    const campusEntries = sorted.map((campus) => ({
      key: `campus-${campus.id}`,
      type: 'campus',
      item: campus,
      active: campus.id === currentCampusId,
    }));

    return [...programOnlyEntries, ...campusEntries].sort((a, b) => (
      String(a?.item?.name || '').localeCompare(String(b?.item?.name || ''))
    ));
  }, [sorted, sortedPrograms, currentProgram?.id, currentCampusId]);
  const hasDirectoryEntries = sortedOrganizations.length > 0 || combinedListings.length > 0;

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

        {sortedOrganizations.length > 0 ? (
          <View style={{ marginBottom: 16 }}>
            <Text style={[moduleStyles.cardMeta, { marginBottom: 8 }]}>Organizations</Text>
            {sortedOrganizations.map((organization) => {
              const active = organization.id === currentOrganization?.id;
              return (
                <View key={`org-${organization.id}`} style={moduleStyles.card}>
                  <View style={[moduleStyles.cardRow, { justifyContent: 'space-between' }]}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={moduleStyles.cardTitle}>{organization.directoryName || organization.name || 'Organization'}</Text>
                      {active ? (
                        <View style={[moduleStyles.badge, { alignSelf: 'flex-start', marginTop: 4 }]}>
                          <Text style={moduleStyles.badgeText}>Active</Text>
                        </View>
                      ) : null}
                      {renderContactLines(organization)}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {combinedListings.length > 0 ? (
          <View style={{ marginBottom: 16 }}>
            <Text style={[moduleStyles.cardMeta, { marginBottom: 8 }]}>Programs/Campuses</Text>
            {combinedListings.map(({ key, type, item, active }) => {
              const isCampus = type === 'campus';
              return (
                <View key={key} style={moduleStyles.card}>
                  <View style={[moduleStyles.cardRow, { justifyContent: 'space-between' }]}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={moduleStyles.cardTitle}>{item.name || (isCampus ? 'Campus' : 'Program')}</Text>
                      {active ? (
                        <View style={[moduleStyles.badge, { alignSelf: 'flex-start', marginTop: 4 }]}>
                          <Text style={moduleStyles.badgeText}>Active</Text>
                        </View>
                      ) : null}
                      {renderContactLines(item, {
                        phoneFallback: currentOrganization?.phone || '',
                        emailFallback: currentOrganization?.email || '',
                        addressFallback: '',
                      })}
                    </View>
                    {!active && isCampus && canSelectCampus ? (
                      <TouchableOpacity
                        onPress={() => { logPress('CampusDirectory:Select', { id: item.id }); setSelectedCampusId(item.id); }}
                        style={moduleStyles.secondaryBtn}
                        accessibilityLabel={`Select campus ${item.name}`}
                      >
                        <Text style={moduleStyles.secondaryBtnText}>Select</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {!hasDirectoryEntries ? (
          <View style={moduleStyles.empty}>
            <Text style={moduleStyles.emptyText}>No campuses configured yet.</Text>
          </View>
        ) : null}
      </ScrollView>
    </ScreenWrapper>
  );
}
