/**
 * Pipeline Settings Page
 *
 * IFC-063: FLOW-007 Pipeline Stage Customization
 *
 * Server Component shell — streams skeleton immediately via Suspense,
 * then hydrates PipelineSettingsContent (client component).
 */

import { Suspense } from 'react';
import PipelineSettingsContent from './PipelineSettingsContent';
import PipelineSettingsLoading from './PipelineSettingsLoading';

export default function PipelineSettingsPage() {
  return (
    <Suspense fallback={<PipelineSettingsLoading />}>
      <PipelineSettingsContent />
    </Suspense>
  );
}
