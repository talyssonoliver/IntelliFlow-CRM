'use client';

/**
 * Routing Content
 *
 * PG-132: Smart Lead Routing UI
 *
 * Tab-based layout with 5 routing views:
 * Rules, Assignments, SLA, Queue, Workload
 */

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@intelliflow/ui';
import { RoutingRulesEditor } from '@/components/routing/RoutingRulesEditor';
import { AssignmentDashboard } from '@/components/routing/AssignmentDashboard';
import { SLAMonitor } from '@/components/routing/SLAMonitor';
import { LeadQueueView } from '@/components/routing/LeadQueueView';
import { AgentWorkload } from '@/components/routing/AgentWorkload';

export default function RoutingContent() {
  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground mb-1">Settings</p>
        <h1 className="text-2xl font-semibold tracking-tight">Lead Routing</h1>
        <p className="text-muted-foreground mt-1">
          Configure routing rules, monitor assignments, and manage agent workload.
        </p>
      </div>

      <Tabs defaultValue="rules" className="w-full">
        <TabsList aria-label="Routing settings tabs">
          <TabsTrigger value="rules" className="gap-2">
            <span className="material-symbols-outlined text-[18px]">rule</span>
            Rules
          </TabsTrigger>
          <TabsTrigger value="assignments" className="gap-2">
            <span className="material-symbols-outlined text-[18px]">assignment_turned_in</span>
            Assignments
          </TabsTrigger>
          <TabsTrigger value="sla" className="gap-2">
            <span className="material-symbols-outlined text-[18px]">timer</span>
            SLA
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-2">
            <span className="material-symbols-outlined text-[18px]">queue</span>
            Queue
          </TabsTrigger>
          <TabsTrigger value="workload" className="gap-2">
            <span className="material-symbols-outlined text-[18px]">groups</span>
            Workload
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-6">
          <RoutingRulesEditor />
        </TabsContent>
        <TabsContent value="assignments" className="mt-6">
          <AssignmentDashboard />
        </TabsContent>
        <TabsContent value="sla" className="mt-6">
          <SLAMonitor />
        </TabsContent>
        <TabsContent value="queue" className="mt-6">
          <LeadQueueView />
        </TabsContent>
        <TabsContent value="workload" className="mt-6">
          <AgentWorkload />
        </TabsContent>
      </Tabs>
    </div>
  );
}
