import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * The list blocks inside the dashboard's Upcoming Tasks card ("Follow-ups due", "Waiting for
 * reply"), one look for both (owner 21/11: "on mobile the header and the data aren't polished").
 *
 * - One caption line on the card's own edge says what the block holds and what to do
 *   ("Nothing new due today · 111 overdue"); no second heading under the card title.
 * - Rows are compact, divided by hairlines, and end in a chevron, so each reads as one tap.
 */
export function CardListSection({
  label,
  caption,
  footer,
  testId,
  children,
}: Readonly<{
  /** The block's name, for screen readers ("Follow-ups due"); the card title is the visible header. */
  label: string;
  /** One plain line that names the block and its count ("Nothing new due today · 111 overdue"). */
  caption: ReactNode;
  footer?: ReactNode;
  testId: string;
  children: ReactNode;
}>) {
  // Owner 21/11: "two headers" - the card already has its title, so the block gets one plain
  // caption line instead of a second, bold uppercase heading with a count pill.
  return (
    <section aria-label={label} data-testid={testId}>
      <h4 className="sr-only">{label}</h4>
      <p className="text-sm text-muted-foreground">{caption}</p>
      {children}
      {footer}
    </section>
  );
}

/** A list of CardListRow, divided by hairlines. */
export function CardList({ label, children }: Readonly<{ label?: string; children: ReactNode }>) {
  return (
    <ul className="mt-1 divide-y divide-border" aria-label={label}>
      {children}
    </ul>
  );
}

/** Sub-heading inside a list block, e.g. "Today" / "Overdue". */
export function CardListGroup({
  title,
  children,
}: Readonly<{ title: string | null; children: ReactNode }>) {
  if (!title) return <>{children}</>;
  return (
    <div className="mt-2">
      <p className="text-[11px] font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

/** One tappable row: a primary line, optional secondary line, a status line, and a chevron. */
export function CardListRow({
  href,
  primary,
  secondary,
  status,
  statusClassName,
  leading,
}: Readonly<{
  href: string;
  primary: ReactNode;
  secondary?: ReactNode;
  status: ReactNode;
  statusClassName: string;
  /**
   * A control before the row's link, e.g. a task's "complete" checkbox. It sits outside the link,
   * so using it never opens the row (owner 23/11: tasks use the same row as follow-ups).
   */
  leading?: ReactNode;
}>) {
  const link = (
    <Link
      href={href}
      className="-mx-2 flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{primary}</span>
        {secondary ? (
          <span className="block truncate text-xs text-muted-foreground">{secondary}</span>
        ) : null}
        <span className={`mt-0.5 block text-xs ${statusClassName}`}>{status}</span>
      </span>
      <span
        className="material-symbols-outlined shrink-0 text-lg text-muted-foreground"
        aria-hidden="true"
      >
        chevron_right
      </span>
    </Link>
  );
  if (!leading) return <li className="flex">{link}</li>;
  return (
    <li className="flex items-center gap-1">
      {leading}
      {link}
    </li>
  );
}

/** The "see all" link under a list block. */
export function CardListMore({ href, children }: Readonly<{ href: string; children: ReactNode }>) {
  return (
    <Link href={href} className="mt-1 inline-block py-1 text-xs text-ds-primary hover:underline">
      {children}
    </Link>
  );
}
