'use client';

import { cn } from '@intelliflow/ui';
import { AI_AGENT_SECTIONS } from '@/components/sidebar/configs/agent-approvals';

interface AIAgentSectionNavProps {
  isExpanded: boolean;
  urlSectionId: string;
  panelSectionId: string | null;
  onSectionClick: (sectionId: string) => void;
}

/**
 * Renders the inactive AI sections as clickable buttons that open the panel.
 * The active section is rendered natively by the sidebar via `sections`.
 */
export function AIAgentSectionNav({
  isExpanded: sidebarExpanded,
  urlSectionId,
  panelSectionId,
  onSectionClick,
}: Readonly<AIAgentSectionNavProps>) {
  const inactiveSections = AI_AGENT_SECTIONS.filter((s) => s.id !== urlSectionId);

  if (inactiveSections.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {inactiveSections.map((section) => {
        const isPanelOpen = section.id === panelSectionId;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSectionClick(section.id)}
            title={sidebarExpanded ? undefined : section.title}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors group w-full',
              isPanelOpen
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              !sidebarExpanded && 'justify-center'
            )}
          >
            <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 bg-slate-100 dark:bg-slate-800">
              <span
                className="material-symbols-outlined text-lg text-purple-600 dark:text-purple-400"
                aria-hidden="true"
              >
                {section.icon}
              </span>
            </div>
            {sidebarExpanded && <span className="font-medium truncate">{section.title}</span>}
          </button>
        );
      })}
    </div>
  );
}
