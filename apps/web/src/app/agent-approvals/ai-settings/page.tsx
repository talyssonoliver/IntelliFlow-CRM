import { Suspense } from 'react';
import AISettingsContent from '@/components/ai-agents/ai-settings/AISettingsContent';
import AISettingsLoading from './AISettingsLoading';

export default function AISettingsPage() {
  return (
    <Suspense fallback={<AISettingsLoading />}>
      <AISettingsContent />
    </Suspense>
  );
}
