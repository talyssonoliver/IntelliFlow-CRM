import { Suspense } from 'react';
import PipelineSettingsContent from '@/app/settings/pipeline/PipelineSettingsContent';
import PipelineSettingsLoading from '@/app/settings/pipeline/PipelineSettingsLoading';

export default function PipelineSettingsPage() {
  return (
    <Suspense fallback={<PipelineSettingsLoading />}>
      <PipelineSettingsContent />
    </Suspense>
  );
}
