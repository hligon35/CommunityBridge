import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../AuthContext';
import { listActiveOrganizations, getOrganizationById } from './OrganizationRepository';
import { listProgramsByOrganization } from './ProgramRepository';
import { listCampusesByOrganization } from './CampusRepository';
import { buildTenantProfile, uniqueIds } from './models';
import { getProgramTypeConfig } from './programConfig';

const TenantContext = createContext(null);
const PROGRAM_KEY = 'bb_selected_program_context_v1';
const CAMPUS_KEY = 'bb_selected_campus_context_v1';

export function useTenant() {
  return useContext(TenantContext);
}

export function TenantProvider({ children }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [organizations, setOrganizations] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [currentOrganization, setCurrentOrganization] = useState(null);
  const [currentProgramId, setCurrentProgramIdState] = useState('');
  const [currentCampusId, setCurrentCampusIdState] = useState('');

  const tenantProfile = useMemo(() => buildTenantProfile(user || {}), [user]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!tenantProfile.organizationId) {
        if (!mounted) return;
        setOrganizations([]);
        setPrograms([]);
        setCampuses([]);
        setCurrentOrganization(null);
        setCurrentProgramIdState('');
        setCurrentCampusIdState('');
        return;
      }

      setLoading(true);
      try {
        const [organization, organizationList, programList, storedProgramId, storedCampusId] = await Promise.all([
          getOrganizationById(tenantProfile.organizationId),
          listActiveOrganizations(),
          listProgramsByOrganization(tenantProfile.organizationId),
          AsyncStorage.getItem(PROGRAM_KEY),
          AsyncStorage.getItem(CAMPUS_KEY),
        ]);

        if (!mounted) return;
        const allowedProgramIds = uniqueIds(tenantProfile.programIds);
        const allowedCampusIds = uniqueIds(tenantProfile.campusIds);
        const filteredPrograms = allowedProgramIds.length
          ? programList.filter((program) => allowedProgramIds.includes(String(program.id || '').trim()))
          : programList;
        const selectedProgramId = filteredPrograms.find((program) => program.id === storedProgramId)?.id
          || tenantProfile.currentProgramId
          || filteredPrograms[0]?.id
          || '';
        const campusList = await listCampusesByOrganization(tenantProfile.organizationId, selectedProgramId);
        const filteredCampuses = allowedCampusIds.length
          ? campusList.filter((campus) => allowedCampusIds.includes(String(campus.id || '').trim()))
          : campusList;
        const selectedCampusId = filteredCampuses.find((campus) => campus.id === storedCampusId)?.id
          || filteredCampuses.find((campus) => !selectedProgramId || campus.programId === selectedProgramId)?.id
          || filteredCampuses[0]?.id
          || '';

        setOrganizations(organizationList);
        setCurrentOrganization(organization || organizationList.find((item) => item.id === tenantProfile.organizationId) || null);
        setPrograms(filteredPrograms);
        setCampuses(filteredCampuses);
        setCurrentProgramIdState(selectedProgramId);
        setCurrentCampusIdState(selectedCampusId);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [tenantProfile.organizationId, tenantProfile.programIds, tenantProfile.campusIds, tenantProfile.currentProgramId]);

  async function setSelectedProgramId(programId) {
    const normalized = String(programId || '').trim();
    setCurrentProgramIdState(normalized);
    try {
      if (normalized) await AsyncStorage.setItem(PROGRAM_KEY, normalized);
      else await AsyncStorage.removeItem(PROGRAM_KEY);
    } catch (_) {
      // ignore persistence failures
    }
  }

  async function setSelectedCampusId(campusId) {
    const normalized = String(campusId || '').trim();
    setCurrentCampusIdState(normalized);
    try {
      if (normalized) await AsyncStorage.setItem(CAMPUS_KEY, normalized);
      else await AsyncStorage.removeItem(CAMPUS_KEY);
    } catch (_) {
      // ignore persistence failures
    }
  }

  const currentProgram = useMemo(
    () => programs.find((item) => item.id === currentProgramId) || programs[0] || null,
    [programs, currentProgramId]
  );
  const currentCampus = useMemo(
    () => campuses.find((item) => item.id === currentCampusId) || campuses[0] || null,
    [campuses, currentCampusId]
  );
  const currentProgramType = currentProgram?.type || tenantProfile.currentProgramType;
  const programConfig = useMemo(() => getProgramTypeConfig(currentProgramType), [currentProgramType]);

  const value = useMemo(() => ({
    loading,
    organizations,
    programs,
    campuses,
    currentOrganization,
    currentProgram,
    currentProgramId,
    currentProgramType,
    currentCampus,
    currentCampusId,
    organizationId: tenantProfile.organizationId,
    role: tenantProfile.role,
    memberships: tenantProfile.memberships,
    labels: programConfig.labels,
    dashboardPreset: programConfig.dashboardPreset,
    childProfileMode: programConfig.childProfileMode,
    featureFlags: programConfig.featureFlags,
    programConfig,
    setSelectedProgramId,
    setSelectedCampusId,
  }), [loading, organizations, programs, campuses, currentOrganization, currentProgram, currentProgramId, currentProgramType, currentCampus, currentCampusId, tenantProfile, programConfig]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}
