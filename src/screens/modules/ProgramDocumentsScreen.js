import { useTenant } from '../../core/tenant/TenantContext';
import ScopedDocumentsScreen from './ScopedDocumentsScreen';

export default function ProgramDocumentsScreen() {
  const tenant = useTenant() || {};
  const { currentProgram, featureFlags = {} } = tenant;
  return (
    <ScopedDocumentsScreen
      title="Program Documents"
      subtitle={`${currentProgram?.name || 'Program'} resources`}
      disabledMessage="Program documents are not enabled for this program."
      emptyMessage="No program documents have been uploaded yet."
      storageKey="programDocumentsByProgramId"
      scopeId={currentProgram?.id}
      enabled={featureFlags.programDocuments !== false}
      iconName="picture-as-pdf"
    />
  );
}
