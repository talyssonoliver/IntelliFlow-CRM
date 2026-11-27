import type { TaskListItem } from '@/components/tasks/TaskList';
import type { TaskFormData } from '@/components/tasks/TaskForm';

function formatFullName(first: string | null | undefined, last: string | null | undefined): string {
  return `${first ?? ''} ${last ?? ''}`.trim();
}

export function getEntityName(task: TaskListItem): string {
  if (task.lead) return formatFullName(task.lead.firstName, task.lead.lastName);
  if (task.contact) return formatFullName(task.contact.firstName, task.contact.lastName);
  if (task.opportunity) return task.opportunity.name;
  return '';
}

export function resolveEntityIds(formData: TaskFormData): {
  leadId?: string;
  contactId?: string;
  opportunityId?: string;
} {
  const id = formData.entityId || undefined;
  return {
    leadId: formData.entityType === 'lead' ? id : undefined,
    contactId: formData.entityType === 'contact' ? id : undefined,
    opportunityId: formData.entityType === 'opportunity' ? id : undefined,
  };
}

export function getEditingTaskDueDate(task: TaskListItem | null): string {
  if (!task?.dueDate) return '';
  if (typeof task.dueDate === 'string') return task.dueDate.split('T')[0];
  return task.dueDate.toISOString().split('T')[0];
}
