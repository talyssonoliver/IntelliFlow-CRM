'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  SidebarWithSuspense,
  createAgentApprovalsSidebarConfig,
} from '@/components/sidebar';
import {
  findSectionForPath,
  isAISettingsPage,
  createAgentApprovalsSettingsSidebarConfig,
} from '@/components/sidebar/configs/agent-approvals';
import { ModuleGate } from '@/components/ModuleGate';
import { AIAgentSettingsPanel } from '@/components/ai-agents/AIAgentSettingsPanel';
import { AIAgentSectionNav } from '@/components/ai-agents/AIAgentSectionNav';
import { AIModuleSettingsPanel } from '@/components/ai-agents/AIModuleSettingsPanel';
import { AISettingsSidebarNav } from '@/components/ai-agents/AISettingsSidebarNav';

export default function AgentApprovalsLayoutShell({
  children,
}: Readonly<{
  readonly children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const urlSectionId = findSectionForPath(pathname);
  const [panelSectionId, setPanelSectionId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const onSettingsPage = isAISettingsPage(pathname);

  // Close panels when the user navigates
  useEffect(() => {
    setPanelSectionId(null);
    setSettingsOpen(false);
  }, [pathname]);

  const handleSectionClick = useCallback((sectionId: string) => {
    setSettingsOpen(false);
    setPanelSectionId((prev) => (prev === sectionId ? null : sectionId));
  }, []);

  const handleClose = useCallback(() => {
    setPanelSectionId(null);
  }, []);

  const handleSettingsClick = useCallback(() => {
    setPanelSectionId(null);
    setSettingsOpen((prev) => !prev);
  }, []);

  const InactiveSections = useMemo(() => {
    return function InactiveSectionsContent({ isExpanded }: { isExpanded: boolean }) {
      return (
        <AIAgentSectionNav
          isExpanded={isExpanded}
          urlSectionId={urlSectionId}
          panelSectionId={panelSectionId}
          onSectionClick={handleSectionClick}
        />
      );
    };
  }, [urlSectionId, panelSectionId, handleSectionClick]);

  const sidebarConfig = useMemo(() => {
    if (onSettingsPage) {
      return createAgentApprovalsSettingsSidebarConfig(
        ({ isExpanded }: { isExpanded: boolean }) => (
          <AISettingsSidebarNav isExpanded={isExpanded} />
        )
      );
    }
    return createAgentApprovalsSidebarConfig(urlSectionId, InactiveSections, handleSettingsClick);
  }, [onSettingsPage, urlSectionId, InactiveSections, handleSettingsClick]);

  return (
    <ModuleGate moduleId="AI_INTELLIGENCE">
      <SidebarProvider>
        <div className="flex min-h-[calc(100vh-4rem)]">
          <SidebarWithSuspense config={sidebarConfig} />

          {/* Section panel (accordion mode) */}
          {!onSettingsPage && (
            <>
              <AIAgentSettingsPanel activeSectionId={panelSectionId} onClose={handleClose} />
              <AIModuleSettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
            </>
          )}

          <SidebarInset>
            <main
              className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background relative"
              id="main-content"
            >
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border lg:hidden">
                <SidebarTrigger />
                <span className="text-sm font-medium text-foreground">AI & Agents</span>
              </div>
              <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4">
                <div className="mx-auto flex flex-col gap-6">{children}</div>
              </div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </ModuleGate>
  );
}
