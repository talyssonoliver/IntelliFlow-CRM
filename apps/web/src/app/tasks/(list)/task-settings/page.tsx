// Task Settings Page — PG-191
// Server component + Suspense wrapper around the client orchestrator.

import { Suspense } from 'react';
import TaskSettingsContent from './TaskSettingsContent';
import TaskSettingsLoading from './TaskSettingsLoading';

export const metadata = {
  title: 'Task Settings — IntelliFlow',
  description:
    'Configure default due-date offset, reminder defaults, and task templates for the Tasks module.',
};

export default function TaskSettingsPage() {
  return (
    <Suspense fallback={<TaskSettingsLoading />}>
      <TaskSettingsContent />
    </Suspense>
  );
}
