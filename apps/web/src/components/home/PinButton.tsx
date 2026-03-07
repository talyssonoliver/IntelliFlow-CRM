'use client';

import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@intelliflow/ui';
import { useEntityPin } from '@/hooks/use-entity-pin';
import type { UseEntityPinOptions } from '@/hooks/use-entity-pin';

export interface PinButtonProps extends UseEntityPinOptions {
  className?: string;
}

export function PinButton({
  entityType,
  entityId,
  title,
  subtitle,
  icon,
  url,
  className,
}: Readonly<PinButtonProps>) {
  const { isPinned, isLoading, togglePin } = useEntityPin({
    entityType,
    entityId,
    title,
    subtitle,
    icon,
    url,
  });

  const label = isPinned ? 'Unpin from Home' : 'Pin to Home';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={cn(className)}
            aria-label={label}
            aria-pressed={isPinned}
            disabled={isLoading}
            onClick={() => togglePin()}
          >
            <span
              className={cn(
                'material-symbols-outlined text-[20px]',
                isPinned ? 'text-amber-500' : 'text-slate-400'
              )}
              aria-hidden="true"
              style={
                isPinned
                  ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }
                  : undefined
              }
            >
              push_pin
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
