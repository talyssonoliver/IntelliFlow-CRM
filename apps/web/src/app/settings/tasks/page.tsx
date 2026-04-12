'use client';

/**
 * Tasks Settings Page (Legacy — redirects to /tasks/task-settings)
 * @deprecated Use /tasks/task-settings instead
 */

import { redirect } from 'next/navigation';

export default function TasksSettingsPage() {
  redirect('/tasks/task-settings');
}
