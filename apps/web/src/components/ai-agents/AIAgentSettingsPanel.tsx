'use client';

import {
  ModuleSettingsNav,
} from '@/components/shared/module-settings-nav';
import { AI_AGENT_SECTIONS } from '@/components/sidebar/configs/agent-approvals';

interface AIAgentSettingsPanelProps {
  activeSectionId: string | null;
  onClose: () => void;
}

export function AIAgentSettingsPanel({ activeSectionId, onClose }: Readonly<AIAgentSettingsPanelProps>) {
  const section = activeSectionId
    ? AI_AGENT_SECTIONS.find((s) => s.id === activeSectionId)
    : undefined;

  return (
    <ModuleSettingsNav
      isOpen={activeSectionId !== null && !!section}
      onClose={onClose}
      title={section?.title ?? ''}
      items={section?.items ?? []}
    />
  );
}
