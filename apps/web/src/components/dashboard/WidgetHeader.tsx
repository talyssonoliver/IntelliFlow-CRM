import * as React from 'react';

interface WidgetHeaderProps {
  title: string;
  /** Material Symbols name shown before the title. */
  icon?: string;
  /** Controls on the right: links, filters, add buttons. */
  actions?: React.ReactNode;
  /** Title text style; defaults to the dashboard card title. */
  titleClassName?: string;
  /** Spacing and borders of the header row. */
  className?: string;
}

/**
 * The one dashboard widget header (owner 21/11: reuse components so cards do not drift). The title
 * never breaks across lines; when a column is too narrow for title and actions side by side (the
 * right column at 1024-1280px), the actions move under the title as one group, aligned right.
 */
export function WidgetHeader({
  title,
  icon,
  actions,
  titleClassName = 'text-lg font-semibold text-foreground',
  className = 'mb-4 sm:mb-6',
}: Readonly<WidgetHeaderProps>) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-1 ${className}`}
      data-testid="widget-header"
    >
      <h3 className={`flex items-center gap-2 whitespace-nowrap ${titleClassName}`}>
        {icon && (
          <span className="material-symbols-outlined text-muted-foreground" aria-hidden="true">
            {icon}
          </span>
        )}
        {title}
      </h3>
      {actions && (
        <div className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap">{actions}</div>
      )}
    </div>
  );
}
