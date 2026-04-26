import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../AuthContext';
import { listActiveOrganizations, getOrganizationById } from './OrganizationRepository';
import { listBranchesByOrganization } from './BranchRepository';
import { listCampusesByOrganization } from './CampusRepository';
import { buildTenantProfile, uniqueIds } from './models';

const TenantContext = createContext(null);
const BRANCH_KEY = 'bb_selected_branch_context_v1';
const CAMPUS_KEY = 'bb_selected_campus_context_v1';

export function useTenant() {
  return useContext(TenantContext);
}

export function TenantProvider({ children }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [organizations, setOrganizations] = useState([]);
  const [branches, setBranches] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [currentOrganization, setCurrentOrganization] = useState(null);
  const [currentBranchId, setCurrentBranchIdState] = useState('');
  const [currentCampusId, setCurrentCampusIdState] = useState('');

  const tenantProfile = useMemo(() => buildTenantProfile(user || {}), [user]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!tenantProfile.organizationId) {
        if (!mounted) return;
        setOrganizations([]);
        setBranches([]);
        setCampuses([]);
        setCurrentOrganization(null);
        setCurrentBranchIdState('');
        setCurrentCampusIdState('');
        return;
      }

      setLoading(true);
      try {
        const [organization, organizationList, branchList, campusList, storedBranchId, storedCampusId] = await Promise.all([
          getOrganizationById(tenantProfile.organizationId),
          listActiveOrganizations(),
          listBranchesByOrganization(tenantProfile.organizationId),
          listCampusesByOrganization(tenantProfile.organizationId),
          AsyncStorage.getItem(BRANCH_KEY),
          AsyncStorage.getItem(CAMPUS_KEY),
        ]);

        if (!mounted) return;
        const allowedBranchIds = uniqueIds(tenantProfile.branchIds);
        const allowedCampusIds = uniqueIds(tenantProfile.campusIds);
        const filteredBranches = allowedBranchIds.length
          ? branchList.filter((branch) => allowedBranchIds.includes(String(branch.id || '').trim()))
          : branchList;
        const filteredCampuses = allowedCampusIds.length
          ? campusList.filter((campus) => allowedCampusIds.includes(String(campus.id || '').trim()))
          : campusList;

        const selectedBranchId = filteredBranches.find((branch) => branch.id === storedBranchId)?.id
          || filteredBranches[0]?.id
          || '';
        const selectedCampusId = filteredCampuses.find((campus) => campus.id === storedCampusId)?.id
          || filteredCampuses.find((campus) => !selectedBranchId || campus.branchId === selectedBranchId)?.id
          || filteredCampuses[0]?.id
          || '';

        setOrganizations(organizationList);
        setCurrentOrganization(organization || organizationList.find((item) => item.id === tenantProfile.organizationId) || null);
        setBranches(filteredBranches);
        setCampuses(filteredCampuses);
        setCurrentBranchIdState(selectedBranchId);
        setCurrentCampusIdState(selectedCampusId);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [tenantProfile.organizationId, tenantProfile.branchIds, tenantProfile.campusIds]);

  async function setSelectedBranchId(branchId) {
    const normalized = String(branchId || '').trim();
    setCurrentBranchIdState(normalized);
    try {
      if (normalized) await AsyncStorage.setItem(BRANCH_KEY, normalized);
      else await AsyncStorage.removeItem(BRANCH_KEY);
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

  const value = useMemo(() => ({
    loading,
    organizations,
    branches,
    campuses,
    currentOrganization,
    currentBranchId,
    currentCampusId,
    organizationId: tenantProfile.organizationId,
    role: tenantProfile.role,
    memberships: tenantProfile.memberships,
    setSelectedBranchId,
    setSelectedCampusId,
  }), [loading, organizations, branches, campuses, currentOrganization, currentBranchId, currentCampusId, tenantProfile]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}
