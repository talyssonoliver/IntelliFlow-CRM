import { TasksShell } from '../tasks-shell';

export default function TaskDetailLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <TasksShell>{children}</TasksShell>;
}
