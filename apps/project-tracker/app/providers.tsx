'use client';

import { TaskDataProvider } from '@/lib/TaskDataContext';

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  return <TaskDataProvider>{children}</TaskDataProvider>;
}
