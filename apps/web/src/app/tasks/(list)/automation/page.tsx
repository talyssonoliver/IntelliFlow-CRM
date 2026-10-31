// Task Automation Page — PG-208
// Server component + Suspense wrapper around the client orchestrator (replaces
// the old placeholder). Rules run in the API's task automation engine (ADR-084).

import { Suspense } from 'react';
import TaskAutomationContent from './TaskAutomationContent';
import TaskAutomationLoading from './TaskAutomationLoading';

export const metadata = {
  title: 'Task Automation — Aurora',
  description:
    'Rules that create, assign and announce tasks when CRM events happen, on a schedule or from a signed webhook.',
};

export default function TaskAutomationPage() {
  return (
    <Suspense fallback={<TaskAutomationLoading />}>
      <TaskAutomationContent />
    </Suspense>
  );
}
