// Route loading state — PG-208. Without it the (list) group's task-list
// skeleton flashes before the automation page (R3-F14).

import TaskAutomationLoading from './TaskAutomationLoading';

export default function Loading() {
  return <TaskAutomationLoading />;
}
