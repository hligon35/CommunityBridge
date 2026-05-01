import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenWrapper } from '../components/ScreenWrapper';
import ImageToggle from '../components/ImageToggle';
import { useAuth } from '../AuthContext';
import { isSuperAdminRole, normalizeUserRole } from '../core/tenant/models';
import { listActiveOrganizations } from '../core/tenant/OrganizationRepository';
import { listProgramsByOrganization } from '../core/tenant/ProgramRepository';
import { listCampusesByOrganization } from '../core/tenant/CampusRepository';
import { THERAPY_ROLE_LABELS, getDisplayRoleLabel } from '../utils/roleTerminology';
import * as Api from '../Api';

const DEFAULT_ROLES = ['Admin', 'Teacher', 'Therapist', 'Parent', 'Staff'];
const DEFAULT_CAPS = [
  { id: 'users:manage', label: 'Manage users' },
  { id: 'children:edit', label: 'Edit children' },
  { id: 'messages:send', label: 'Send messages' },
  { id: 'settings:system', label: 'System settings' },
  { id: 'export:data', label: 'Export data' },
];
const PERMISSION_GROUPS = [
  {
    key: 'office',
    label: 'Office',
    description: 'Organization settings, imports, exports, compliance, and scheduling controls.',
    roles: ['Admin', 'Staff'],
  },
  {
    key: 'clinical',
    label: 'Clinical',
    description: `BCBA and ${THERAPY_ROLE_LABELS.therapist} workflows, child editing, and clinical communication.`,
    roles: ['Therapist', 'Teacher'],
  },
  {
    key: 'family',
    label: 'Family',
    description: 'Parent-facing communication and constrained account access.',
    roles: ['Parent'],
  },
];
const ROLE_OPTIONS = [
  { value: 'parent', label: 'Parent', adminOnly: false },
  { value: 'faculty', label: 'Faculty', adminOnly: false },
  { value: 'therapist', label: THERAPY_ROLE_LABELS.therapist, adminOnly: false },
  { value: 'bcba', label: 'BCBA', adminOnly: false },
  { value: 'admin', label: 'Admin', adminOnly: true },
  { value: 'campusAdmin', label: 'Campus Admin', adminOnly: true },
  { value: 'orgAdmin', label: 'Org Admin', adminOnly: true },
  { value: 'superAdmin', label: 'Super Admin', adminOnly: true },
];

function capabilityRoleKey(role) {
  const value = normalizeUserRole(role);
  if (value === 'superAdmin' || value === 'orgAdmin' || value === 'campusAdmin' || value === 'admin') return 'Admin';
  if (value === 'therapist' || value === 'bcba') return 'Therapist';
  if (value === 'faculty') return 'Teacher';
  if (value === 'parent') return 'Parent';
  return 'Staff';
}

function createUserDraft(user) {
  const item = user && typeof user === 'object' ? user : {};
  return {
    name: String(item.name || ''),
    email: String(item.email || ''),
    phone: String(item.phone || ''),
    address: String(item.address || ''),
    role: normalizeUserRole(item.role),
    organizationId: String(item.organizationId || ''),
    programIds: Array.isArray(item.programIds) ? item.programIds.map(String) : [],
    campusIds: Array.isArray(item.campusIds) ? item.campusIds.map(String) : [],
    password: '',
  };
}

function normalizeManagedUsers(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    role: normalizeUserRole(item?.role),
  }));
}

function buildDefaultMapping() {
  const init = {};
  DEFAULT_ROLES.forEach((role) => {
    init[role] = {};
    DEFAULT_CAPS.forEach((cap) => { init[role][cap.id] = false; });
  });
  return init;
}

export default function ManagePermissionsScreen(){
  const { user } = useAuth();
  const [mapping, setMapping] = useState(buildDefaultMapping());
  const [managedUsers, setManagedUsers] = useState([]);
  const [userDrafts, setUserDrafts] = useState({});
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [permissionsSaving, setPermissionsSaving] = useState(false);
  const [permissionsError, setPermissionsError] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [savingUserId, setSavingUserId] = useState('');
  const [deletingUserId, setDeletingUserId] = useState('');
  const [sectionsOpen, setSectionsOpen] = useState({ users: true, permissions: true });
  const [roleSectionsOpen, setRoleSectionsOpen] = useState({
    Admin: true,
    Teacher: false,
    Therapist: false,
    Parent: false,
    Staff: false,
  });
  const [userSectionsOpen, setUserSectionsOpen] = useState({});
  const [selectedPermissionGroup, setSelectedPermissionGroup] = useState('office');
  const [organizations, setOrganizations] = useState([]);
  const [programsByOrg, setProgramsByOrg] = useState({});
  const [campusesByOrg, setCampusesByOrg] = useState({});
  const canManagePermissions = isSuperAdminRole(user?.role);
  const canManageUsers = useMemo(() => {
    if (canManagePermissions) return true;
    const roleKey = capabilityRoleKey(user?.role);
    return Boolean(mapping?.[roleKey]?.['users:manage']);
  }, [canManagePermissions, mapping, user?.role]);
  const visibleRoleOptions = useMemo(() => {
    return ROLE_OPTIONS.filter((option) => canManagePermissions || !option.adminOnly);
  }, [canManagePermissions]);

  const campusLookup = useMemo(() => {
    const map = new Map();
    Object.values(campusesByOrg || {}).forEach((items) => {
      (Array.isArray(items) ? items : []).forEach((item) => {
        if (item?.id) map.set(String(item.id), item);
      });
    });
    return map;
  }, [campusesByOrg]);
  const visiblePermissionGroup = useMemo(() => {
    return PERMISSION_GROUPS.find((group) => group.key === selectedPermissionGroup) || PERMISSION_GROUPS[0];
  }, [selectedPermissionGroup]);
  const visiblePermissionRoles = useMemo(() => {
    const roles = visiblePermissionGroup?.roles || DEFAULT_ROLES;
    return roles.filter((role) => DEFAULT_ROLES.includes(role));
  }, [visiblePermissionGroup]);

  useEffect(() => {
    (async () => {
      try {
        const items = await listActiveOrganizations();
        setOrganizations(Array.isArray(items) ? items : []);
      } catch (_) {
        setOrganizations([]);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setPermissionsLoading(true);
        setPermissionsError('');
        const res = await Api.getPermissionsConfig();
        setMapping({ ...buildDefaultMapping(), ...(res?.item || {}) });
      } catch (e) {
        setPermissionsError(String(e?.message || 'Could not load permissions configuration.'));
        setMapping(buildDefaultMapping());
      } finally {
        setPermissionsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!canManageUsers) {
      setManagedUsers([]);
      setUserDrafts({});
      return;
    }

    (async () => {
      try {
        setUsersLoading(true);
        setUsersError('');
        const res = await Api.listManagedUsers();
        const items = normalizeManagedUsers(res?.items);
        const nextDrafts = {};
        const nextSectionsOpen = {};
        items.forEach((item, index) => {
          nextDrafts[item.id] = createUserDraft(item);
          nextSectionsOpen[item.id] = index === 0;
        });
        setManagedUsers(items);
        setUserDrafts(nextDrafts);
        setUserSectionsOpen(nextSectionsOpen);
      } catch (e) {
        setUsersError(String(e?.message || 'Could not load managed users.'));
      } finally {
        setUsersLoading(false);
      }
    })();
  }, [canManageUsers]);

  useEffect(() => {
    const orgIds = Array.from(new Set(Object.values(userDrafts || {})
      .map((draft) => String(draft?.organizationId || '').trim())
      .filter(Boolean)));
    orgIds.forEach((orgId) => {
      ensureProgramsLoaded(orgId);
      ensureCampusesLoaded(orgId);
    });
  }, [userDrafts]);

  async function toggle(role, capId, value){
    if (!canManagePermissions || permissionsSaving) return;
    const nextMapping = { ...mapping, [role]: { ...(mapping[role] || {}), [capId]: !!value } };
    setMapping(nextMapping);
    try {
      setPermissionsSaving(true);
      setPermissionsError('');
      await Api.updatePermissionsConfig(nextMapping);
    } catch (e) {
      setPermissionsError(String(e?.message || 'Could not save permissions configuration.'));
      setMapping(mapping);
    } finally {
      setPermissionsSaving(false);
    }
  }

  function updateUserDraft(userId, field, value) {
    setUserDrafts((current) => ({
      ...current,
      [userId]: {
        ...(current[userId] || createUserDraft({})),
        [field]: value,
      },
    }));
  }

  async function ensureProgramsLoaded(organizationId) {
    const orgId = String(organizationId || '').trim();
    if (!orgId || programsByOrg[orgId]) return;
    try {
      const items = await listProgramsByOrganization(orgId);
      setProgramsByOrg((current) => ({ ...current, [orgId]: Array.isArray(items) ? items : [] }));
    } catch (_) {
      setProgramsByOrg((current) => ({ ...current, [orgId]: [] }));
    }
  }

  async function ensureCampusesLoaded(organizationId) {
    const orgId = String(organizationId || '').trim();
    if (!orgId || campusesByOrg[orgId]) return;
    try {
      const items = await listCampusesByOrganization(orgId, '');
      setCampusesByOrg((current) => ({ ...current, [orgId]: Array.isArray(items) ? items : [] }));
    } catch (_) {
      setCampusesByOrg((current) => ({ ...current, [orgId]: [] }));
    }
  }

  function setUserOrganization(userId, organizationId) {
    const nextOrganizationId = String(organizationId || '').trim();
    updateUserDraft(userId, 'organizationId', nextOrganizationId);
    updateUserDraft(userId, 'programIds', []);
    updateUserDraft(userId, 'campusIds', []);
    if (nextOrganizationId) {
      ensureProgramsLoaded(nextOrganizationId);
      ensureCampusesLoaded(nextOrganizationId);
    }
  }

  function toggleDraftSelection(userId, field, value) {
    const normalized = String(value || '').trim();
    const current = Array.isArray(userDrafts[userId]?.[field]) ? userDrafts[userId][field] : [];
    const next = current.includes(normalized)
      ? current.filter((item) => item !== normalized)
      : [...current, normalized];
    updateUserDraft(userId, field, next);
    if (field === 'programIds') {
      const availableCampuses = campusesByOrg[String(userDrafts[userId]?.organizationId || '').trim()] || [];
      const allowedCampusIds = new Set((availableCampuses || [])
        .filter((campus) => !next.length || next.includes(String(campus.programId || '')))
        .map((campus) => String(campus.id || '')));
      const currentCampusIds = Array.isArray(userDrafts[userId]?.campusIds) ? userDrafts[userId].campusIds : [];
      updateUserDraft(userId, 'campusIds', currentCampusIds.filter((campusId) => allowedCampusIds.has(String(campusId))));
    }
  }

  function buildMembershipsForDraft(draft) {
    const role = normalizeUserRole(draft.role);
    const organizationId = String(draft.organizationId || '').trim();
    if (!organizationId) return [];

    const campusIds = Array.isArray(draft.campusIds) ? draft.campusIds.map(String) : [];
    const programIds = Array.isArray(draft.programIds) ? draft.programIds.map(String) : [];
    if (campusIds.length) {
      return campusIds.map((campusId) => {
        const campus = campusLookup.get(String(campusId));
        return {
          organizationId,
          programId: String(campus?.programId || ''),
          campusId: String(campusId),
          role,
        };
      });
    }
    if (programIds.length) {
      return programIds.map((programId) => ({
        organizationId,
        programId: String(programId),
        campusId: '',
        role,
      }));
    }
    return [{ organizationId, programId: '', campusId: '', role }];
  }

  async function saveUser(userItem) {
    const draft = userDrafts[userItem.id] || createUserDraft(userItem);
    const payload = {};
    if (String(draft.name || '').trim() !== String(userItem.name || '').trim()) payload.name = String(draft.name || '').trim();
    if (String(draft.email || '').trim().toLowerCase() !== String(userItem.email || '').trim().toLowerCase()) payload.email = String(draft.email || '').trim().toLowerCase();
    if (String(draft.phone || '').trim() !== String(userItem.phone || '').trim()) payload.phone = String(draft.phone || '').trim();
    if (String(draft.address || '').trim() !== String(userItem.address || '').trim()) payload.address = String(draft.address || '').trim();
    if (normalizeUserRole(draft.role) !== normalizeUserRole(userItem.role)) payload.role = normalizeUserRole(draft.role);
    const nextOrganizationId = String(draft.organizationId || '').trim();
    const nextProgramIds = Array.isArray(draft.programIds) ? draft.programIds.map(String) : [];
    const nextCampusIdsRaw = Array.isArray(draft.campusIds) ? draft.campusIds.map(String) : [];
    const nextCampusIds = nextProgramIds.length
      ? nextCampusIdsRaw.filter((campusId) => nextProgramIds.includes(String(campusLookup.get(String(campusId))?.programId || '')))
      : nextCampusIdsRaw;
    const currentOrganizationId = String(userItem.organizationId || '').trim();
    const currentProgramIds = Array.isArray(userItem.programIds) ? userItem.programIds.map(String) : [];
    const currentCampusIds = Array.isArray(userItem.campusIds) ? userItem.campusIds.map(String) : [];
    if (nextOrganizationId !== currentOrganizationId) payload.organizationId = nextOrganizationId;
    if (JSON.stringify(nextProgramIds) !== JSON.stringify(currentProgramIds)) payload.programIds = nextProgramIds;
    if (JSON.stringify(nextCampusIds) !== JSON.stringify(currentCampusIds)) payload.campusIds = nextCampusIds;
    const memberships = buildMembershipsForDraft(draft);
    if (JSON.stringify(memberships) !== JSON.stringify(Array.isArray(userItem.memberships) ? userItem.memberships : [])) payload.memberships = memberships;
    if (String(draft.password || '').trim()) payload.password = String(draft.password);

    const normalizedRole = normalizeUserRole(draft.role);
    if ((normalizedRole === 'orgAdmin' || normalizedRole === 'campusAdmin') && !nextOrganizationId) {
      Alert.alert('Organization required', 'Org admins and campus admins must be assigned to an organization.');
      return;
    }
    if (normalizedRole === 'campusAdmin' && !nextCampusIds.length) {
      Alert.alert('Campus required', 'Campus admins must be assigned to at least one campus.');
      return;
    }

    if (!Object.keys(payload).length) {
      Alert.alert('No changes', 'Update one or more fields before saving.');
      return;
    }

    try {
      setSavingUserId(userItem.id);
      setUsersError('');
      const res = await Api.updateManagedUser(userItem.id, payload);
      const nextUser = normalizeManagedUsers([res?.user])[0] || userItem;
      setManagedUsers((current) => current.map((item) => (item.id === userItem.id ? nextUser : item)));
      setUserDrafts((current) => ({
        ...current,
        [userItem.id]: createUserDraft(nextUser),
      }));
    } catch (e) {
      setUsersError(String(e?.message || 'Could not update user.'));
    } finally {
      setSavingUserId('');
    }
  }

  function confirmDeleteUser(userItem) {
    Alert.alert(
      'Delete user',
      `Delete ${userItem.name || userItem.email || 'this user'}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingUserId(userItem.id);
              setUsersError('');
              await Api.deleteManagedUser(userItem.id);
              setManagedUsers((current) => current.filter((item) => item.id !== userItem.id));
              setUserDrafts((current) => {
                const next = { ...current };
                delete next[userItem.id];
                return next;
              });
            } catch (e) {
              setUsersError(String(e?.message || 'Could not delete user.'));
            } finally {
              setDeletingUserId('');
            }
          },
        },
      ]
    );
  }

  function renderRole(role){
    const caps = mapping[role] || {};
    const open = !!roleSectionsOpen[role];
    return (
      <View style={styles.roleCard}>
        <TouchableOpacity
          style={styles.sectionHeader}
          activeOpacity={0.85}
          onPress={() => setRoleSectionsOpen((current) => ({ ...current, [role]: !current[role] }))}
        >
          <Text style={styles.roleTitle}>{getDisplayRoleLabel(role)}</Text>
          <MaterialIcons name={open ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={22} color={open ? '#2563eb' : '#6b7280'} />
        </TouchableOpacity>
        {open ? DEFAULT_CAPS.map((c) => (
          <View key={c.id} style={styles.capRow}>
            <Text style={styles.capLabel}>{c.label}</Text>
            <ImageToggle value={!!caps[c.id]} onValueChange={(v) => toggle(role, c.id, v)} accessibilityLabel={`${getDisplayRoleLabel(role)} ${c.label}`} disabled={!canManagePermissions || permissionsSaving} />
          </View>
        )) : null}
      </View>
    );
  }

  function renderUserCard(userItem) {
    const draft = userDrafts[userItem.id] || createUserDraft(userItem);
    const open = !!userSectionsOpen[userItem.id];
    const busy = savingUserId === userItem.id || deletingUserId === userItem.id;
    const scopedRole = normalizeUserRole(draft.role);
    const availablePrograms = programsByOrg[String(draft.organizationId || '').trim()] || [];
    const availableCampuses = (campusesByOrg[String(draft.organizationId || '').trim()] || []).filter((campus) => {
      if (!draft.programIds?.length) return true;
      return draft.programIds.includes(String(campus.programId || ''));
    });
    return (
      <View key={userItem.id} style={styles.userCard}>
        <TouchableOpacity
          style={styles.sectionHeader}
          activeOpacity={0.85}
          onPress={() => setUserSectionsOpen((current) => ({ ...current, [userItem.id]: !current[userItem.id] }))}
        >
          <View style={styles.userHeaderTextWrap}>
            <Text style={styles.userName}>{userItem.name || 'Unnamed user'}</Text>
            <Text style={styles.userMeta}>{userItem.email || 'No email'} • {getDisplayRoleLabel(draft.role || 'parent')}</Text>
          </View>
          <MaterialIcons name={open ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={22} color={open ? '#2563eb' : '#6b7280'} />
        </TouchableOpacity>
        {open ? (
          <View style={styles.userBody}>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput value={draft.name} onChangeText={(value) => updateUserDraft(userItem.id, 'name', value)} style={styles.input} placeholder="Full name" />

            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput value={draft.email} onChangeText={(value) => updateUserDraft(userItem.id, 'email', value)} style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" />

            <Text style={styles.fieldLabel}>Phone</Text>
            <TextInput value={draft.phone} onChangeText={(value) => updateUserDraft(userItem.id, 'phone', value)} style={styles.input} placeholder="+15551234567" autoCapitalize="none" />

            <Text style={styles.fieldLabel}>Address</Text>
            <TextInput value={draft.address} onChangeText={(value) => updateUserDraft(userItem.id, 'address', value)} style={[styles.input, styles.multilineInput]} placeholder="Address" multiline />

            <Text style={styles.fieldLabel}>Role</Text>
            <View style={styles.roleChipWrap}>
              {visibleRoleOptions.map((option) => {
                const selected = normalizeUserRole(draft.role) === option.value;
                return (
                  <TouchableOpacity
                    key={`${userItem.id}-${option.value}`}
                    onPress={() => updateUserDraft(userItem.id, 'role', option.value)}
                    style={[styles.roleChip, selected ? styles.roleChipSelected : null]}
                    disabled={busy}
                  >
                    <Text style={[styles.roleChipLabel, selected ? styles.roleChipLabelSelected : null]}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Organization scope</Text>
            <View style={styles.roleChipWrap}>
              <TouchableOpacity
                onPress={() => setUserOrganization(userItem.id, '')}
                style={[styles.roleChip, !draft.organizationId ? styles.roleChipSelected : null]}
                disabled={busy}
              >
                <Text style={[styles.roleChipLabel, !draft.organizationId ? styles.roleChipLabelSelected : null]}>No org scope</Text>
              </TouchableOpacity>
              {organizations.map((organization) => {
                const selected = String(draft.organizationId || '') === String(organization.id || '');
                return (
                  <TouchableOpacity
                    key={`${userItem.id}-org-${organization.id}`}
                    onPress={() => setUserOrganization(userItem.id, organization.id)}
                    style={[styles.roleChip, selected ? styles.roleChipSelected : null]}
                    disabled={busy}
                  >
                    <Text style={[styles.roleChipLabel, selected ? styles.roleChipLabelSelected : null]}>{organization.name || organization.id}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {draft.organizationId ? (
              <>
                <Text style={styles.fieldLabel}>Program access</Text>
                <View style={styles.roleChipWrap}>
                  {availablePrograms.length ? availablePrograms.map((program) => {
                    const selected = draft.programIds.includes(String(program.id || ''));
                    return (
                      <TouchableOpacity
                        key={`${userItem.id}-program-${program.id}`}
                        onPress={() => toggleDraftSelection(userItem.id, 'programIds', program.id)}
                        style={[styles.roleChip, selected ? styles.roleChipSelected : null]}
                        disabled={busy}
                      >
                        <Text style={[styles.roleChipLabel, selected ? styles.roleChipLabelSelected : null]}>{program.name || program.id}</Text>
                      </TouchableOpacity>
                    );
                  }) : <Text style={styles.helperText}>No programs found for this organization.</Text>}
                </View>

                <Text style={styles.fieldLabel}>Campus access</Text>
                <View style={styles.roleChipWrap}>
                  {availableCampuses.length ? availableCampuses.map((campus) => {
                    const selected = draft.campusIds.includes(String(campus.id || ''));
                    return (
                      <TouchableOpacity
                        key={`${userItem.id}-campus-${campus.id}`}
                        onPress={() => toggleDraftSelection(userItem.id, 'campusIds', campus.id)}
                        style={[styles.roleChip, selected ? styles.roleChipSelected : null]}
                        disabled={busy}
                      >
                        <Text style={[styles.roleChipLabel, selected ? styles.roleChipLabelSelected : null]}>{campus.name || campus.id}</Text>
                      </TouchableOpacity>
                    );
                  }) : <Text style={styles.helperText}>No campuses found for the selected scope.</Text>}
                </View>
              </>
            ) : null}

            {(scopedRole === 'orgAdmin' || scopedRole === 'campusAdmin') ? (
              <Text style={styles.helperText}>
                {scopedRole === 'orgAdmin'
                  ? 'Org admins should have one organization selected. Program and campus chips can narrow that access further.'
                  : 'Campus admins must have an organization and at least one campus selected.'}
              </Text>
            ) : null}

            <Text style={styles.fieldLabel}>Reset password</Text>
            <TextInput value={draft.password} onChangeText={(value) => updateUserDraft(userItem.id, 'password', value)} style={styles.input} placeholder="Leave blank to keep current password" secureTextEntry />
            <Text style={styles.helperText}>Use this only for office-managed account recovery. End users should still use the standard reset-password flow from login.</Text>

            <View style={styles.userActionRow}>
              <TouchableOpacity style={[styles.actionButton, styles.saveButton]} onPress={() => saveUser(userItem)} disabled={busy}>
                <Text style={styles.actionButtonText}>{savingUserId === userItem.id ? 'Saving...' : 'Save changes'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => confirmDeleteUser(userItem)} disabled={busy}>
                <Text style={styles.actionButtonText}>{deletingUserId === userItem.id ? 'Deleting...' : 'Delete user'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <ScreenWrapper style={styles.container}>
      {!canManagePermissions && !canManageUsers ? (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Access required</Text>
          <Text style={styles.noticeBody}>You need permission to manage users or edit permission mapping.</Text>
        </View>
      ) : null}
      {permissionsError ? (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>Permissions unavailable</Text>
          <Text style={styles.noticeBody}>{permissionsError}</Text>
        </View>
      ) : null}
      {usersError ? (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>User management unavailable</Text>
          <Text style={styles.noticeBody}>{usersError}</Text>
        </View>
      ) : null}
      {(permissionsLoading || permissionsSaving || usersLoading) ? (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color="#2563eb" />
          <Text style={styles.statusText}>
            {permissionsLoading ? 'Loading access controls...' : permissionsSaving ? 'Saving permissions...' : 'Loading users...'}
          </Text>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.panel}>
          <TouchableOpacity
            style={styles.sectionHeader}
            activeOpacity={0.85}
            onPress={() => setSectionsOpen((current) => ({ ...current, users: !current.users }))}
          >
            <View>
              <Text style={styles.sectionTitle}>User management</Text>
              <Text style={styles.sectionHint}>Edit user details, roles, and account access.</Text>
            </View>
            <MaterialIcons name={sectionsOpen.users ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={24} color={sectionsOpen.users ? '#2563eb' : '#6b7280'} />
          </TouchableOpacity>
          {sectionsOpen.users ? (
            canManageUsers ? (
              <View style={styles.sectionBody}>
                <View style={styles.infoCard}>
                  <Text style={styles.infoTitle}>Role assignment rules</Text>
                  <Text style={styles.infoBody}>Only super admins can assign elevated roles. Org admins should be scoped to one organization. Campus admins should be scoped to one organization and one or more campuses.</Text>
                </View>
                {managedUsers.length ? managedUsers.map((item) => renderUserCard(item)) : (
                  <Text style={styles.emptyState}>No users available to manage.</Text>
                )}
              </View>
            ) : (
              <View style={styles.sectionBody}>
                <Text style={styles.emptyState}>Your account cannot manage users.</Text>
              </View>
            )
          ) : null}
        </View>

        <View style={styles.panel}>
          <TouchableOpacity
            style={styles.sectionHeader}
            activeOpacity={0.85}
            onPress={() => setSectionsOpen((current) => ({ ...current, permissions: !current.permissions }))}
          >
            <View>
              <Text style={styles.sectionTitle}>Permission mapping</Text>
              <Text style={styles.sectionHint}>Control which capabilities each role receives.</Text>
            </View>
            <MaterialIcons name={sectionsOpen.permissions ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} size={24} color={sectionsOpen.permissions ? '#2563eb' : '#6b7280'} />
          </TouchableOpacity>
          {sectionsOpen.permissions ? (
            canManagePermissions ? (
              <View style={styles.sectionBody}>
                <View style={styles.infoCard}>
                  <Text style={styles.infoTitle}>adminPermissions</Text>
                  <Text style={styles.infoBody}>The permission matrix is grouped by office, clinical, and family access so the document’s split admin model maps to existing roles without duplicating accounts.</Text>
                </View>
                <View style={styles.groupChipWrap}>
                  {PERMISSION_GROUPS.map((group) => {
                    const selected = group.key === visiblePermissionGroup.key;
                    return (
                      <TouchableOpacity
                        key={group.key}
                        onPress={() => setSelectedPermissionGroup(group.key)}
                        style={[styles.groupChip, selected ? styles.groupChipSelected : null]}
                      >
                        <Text style={[styles.groupChipLabel, selected ? styles.groupChipLabelSelected : null]}>{group.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.groupDescription}>{visiblePermissionGroup.description}</Text>
                {visiblePermissionRoles.map((role) => renderRole(role))}
              </View>
            ) : (
              <View style={styles.sectionBody}>
                <Text style={styles.emptyState}>Only super admins can change permission mapping.</Text>
              </View>
            )
          ) : null}
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 12, paddingBottom: 28 },
  panel: { marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  sectionHeader: { paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  sectionHint: { marginTop: 2, color: '#6b7280' },
  sectionBody: { paddingHorizontal: 12, paddingBottom: 12 },
  noticeCard: { margin: 12, padding: 14, borderRadius: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  noticeTitle: { fontWeight: '800', color: '#991b1b', marginBottom: 4 },
  noticeBody: { color: '#7f1d1d', lineHeight: 20 },
  statusRow: { marginHorizontal: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
  statusText: { marginLeft: 8, color: '#1d4ed8', fontWeight: '600' },
  infoCard: { marginBottom: 12, padding: 12, borderRadius: 10, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  infoTitle: { color: '#1d4ed8', fontWeight: '800', marginBottom: 4 },
  infoBody: { color: '#1e3a8a', lineHeight: 20 },
  roleCard: { padding: 12, borderRadius: 8, backgroundColor: '#fff', marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6' },
  roleTitle: { fontWeight: '700', color: '#111827' },
  capRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  capLabel: { color: '#111827' },
  userCard: { marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, backgroundColor: '#f8fafc' },
  userHeaderTextWrap: { flex: 1, paddingRight: 12 },
  userName: { fontWeight: '800', color: '#0f172a' },
  userMeta: { marginTop: 2, color: '#6b7280' },
  userBody: { paddingHorizontal: 12, paddingBottom: 12 },
  fieldLabel: { marginTop: 10, marginBottom: 6, fontWeight: '700', color: '#374151' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, backgroundColor: '#fff', color: '#111827' },
  multilineInput: { minHeight: 72, textAlignVertical: 'top' },
  roleChipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  roleChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff', marginRight: 8, marginBottom: 8 },
  roleChipSelected: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
  roleChipLabel: { color: '#334155', fontWeight: '600' },
  roleChipLabelSelected: { color: '#1d4ed8' },
  groupChipWrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  groupChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff', marginRight: 8, marginBottom: 8 },
  groupChipSelected: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  groupChipLabel: { color: '#1d4ed8', fontWeight: '700' },
  groupChipLabelSelected: { color: '#fff' },
  groupDescription: { color: '#475569', lineHeight: 20, marginBottom: 12 },
  helperText: { color: '#64748b', lineHeight: 20, marginBottom: 8 },
  userActionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  actionButton: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveButton: { backgroundColor: '#2563eb', marginRight: 8 },
  deleteButton: { backgroundColor: '#dc2626', marginLeft: 8 },
  actionButtonText: { color: '#fff', fontWeight: '700' },
  emptyState: { color: '#6b7280', lineHeight: 20 },
});