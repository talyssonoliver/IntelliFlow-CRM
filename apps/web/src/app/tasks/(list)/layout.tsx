import { TasksShell } from '../tasks-shell';

export default function TasksListLayout({ children }: Readonly<{ readonly children: React.ReactNode }>) {
  return <TasksShell>{children}</TasksShell>;
}
