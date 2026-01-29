'use client';

import { TaskDataProvider } from '@/lib/TaskDataContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return <TaskDataProvider>{children}</TaskDataProvider>;
}
