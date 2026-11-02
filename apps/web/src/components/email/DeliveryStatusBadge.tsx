/**
 * Delivery problems on a sent email (PG-207, AC-EM-028): "Bounced" when every
 * recipient hard-bounced, "Partly bounced" when some did, "Failed" when the
 * mailbox refused it. Text plus a decorative icon — never colour alone.
 */
import { cn } from '@/lib/utils';

export interface DeliveryStatusInput {
  status?: string;
  bouncedRecipientCount?: number;
}

interface DeliveryStatusView {
  label: string;
  icon: string;
  className: string;
}

const DANGER = 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200';
const WARNING = 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200';

export function deliveryStatusOf({
  status,
  bouncedRecipientCount = 0,
}: DeliveryStatusInput): DeliveryStatusView | null {
  if (status === 'BOUNCED') return { label: 'Bounced', icon: 'error', className: DANGER };
  if (status === 'FAILED') return { label: 'Failed', icon: 'report', className: DANGER };
  if (bouncedRecipientCount > 0)
    return { label: 'Partly bounced', icon: 'warning', className: WARNING };
  return null;
}

export function DeliveryStatusBadge(props: Readonly<DeliveryStatusInput>) {
  const view = deliveryStatusOf(props);
  if (!view) return null;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium',
        view.className
      )}
    >
      <span className="material-symbols-outlined text-sm" aria-hidden="true">
        {view.icon}
      </span>
      {view.label}
    </span>
  );
}
