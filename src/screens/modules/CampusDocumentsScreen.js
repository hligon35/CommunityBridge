import { useTenant } from '../../core/tenant/TenantContext';
import ScopedDocumentsScreen from './ScopedDocumentsScreen';

export default function CampusDocumentsScreen() {
  const tenant = useTenant() || {};
  const { currentCampus, featureFlags = {} } = tenant;
  return (
    <ScopedDocumentsScreen
      title="Campus Documents"
      subtitle={`${currentCampus?.name || 'Campus'} resources`}
      disabledMessage="Campus documents are not enabled for this program."
      emptyMessage="No campus documents have been uploaded yet."
      storageKey="campusDocumentsByCampusId"
      scopeId={currentCampus?.id}
      enabled={featureFlags.campusDocuments !== false}
      iconName="folder"
    />
  );
}
