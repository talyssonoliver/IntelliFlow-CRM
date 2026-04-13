'use client';

import { Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EMAIL_LABELS } from '@/components/sidebar/configs/EmailSidebarContent';
import { EntityHoverCard } from '@/components/shared';
import { useTimezoneContext } from '@/providers/TimezoneProvider';

interface EmailItemData {
  id: string;
  subject: string;
  textBody?: string;
  htmlBody?: string;
  from: { address: string; name?: string };
  receivedAt: string;
  isRead: boolean;
  labels?: string[];
  attachments: Array<{ filename: string; contentType: string; size: number; checksum: string }>;
}

interface EmailListItemProps {
  email: EmailItemData;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function formatRelativeTime(dateStr: string, formatDate: (input: Date | string) => string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d`;
  return formatDate(dateStr);
}

function getInitial(name?: string, email?: string): string {
  if (name && name.length > 0) return name[0].toUpperCase();
  if (email && email.length > 0) return email[0].toUpperCase();
  return '?';
}

function getPreview(email: Readonly<EmailItemData>): string {
  if (email.textBody) return email.textBody.slice(0, 80);
  if (email.htmlBody) return email.htmlBody.replaceAll(/<[^<>]*>/g, '').slice(0, 80);
  return '';
}

export function EmailListItem({ email, isSelected, onSelect }: Readonly<EmailListItemProps>) {
  const { formatDate } = useTimezoneContext();
  return (
    <EntityHoverCard
      email={email.from.address}
      displayName={email.from.name}
      side="right"
      align="start"
    >
      {}
      <li
        role="option"
        aria-selected={isSelected}
        tabIndex={-1}
        className={cn(
          'flex cursor-pointer gap-3 rounded-lg px-3 py-2.5 transition-colors list-none',
          'hover:bg-accent/50',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          isSelected && 'bg-primary/5 border-l-2 border-l-primary'
        )}
        onClick={() => onSelect(email.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(email.id);
          }
        }}
      >
        {/* Avatar */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
          {getInitial(email.from.name, email.from.address)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium">
              {email.from.name || email.from.address}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatRelativeTime(email.receivedAt, formatDate)}
            </span>
          </div>
          <div
            className={cn(
              'truncate text-sm',
              email.isRead ? 'text-muted-foreground' : 'font-semibold text-foreground'
            )}
          >
            {email.subject}
          </div>
          <div className="flex items-center gap-1">
            <span className="truncate text-xs text-muted-foreground">{getPreview(email)}</span>
            {email.labels && email.labels.length > 0 && (
              <span className="flex items-center gap-0.5 shrink-0">
                {email.labels.map((labelId) => {
                  const def = EMAIL_LABELS.find((l) => l.id === labelId);
                  return def ? (
                    <span
                      key={labelId}
                      className="h-2 w-2 rounded-full"
                      title={def.name}
                      style={{ backgroundColor: def.color }}
                    />
                  ) : null;
                })}
              </span>
            )}
            {email.attachments.length > 0 ? (
              <Paperclip
                data-testid="attachment-icon"
                className="h-3 w-3 shrink-0 text-muted-foreground"
              />
            ) : null}
          </div>
        </div>
      </li>
    </EntityHoverCard>
  );
}
