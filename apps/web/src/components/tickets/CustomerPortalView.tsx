'use client';

/**
 * CustomerPortalView — Simplified ticket view for customers (PG-137)
 *
 * Shows public information only. Filters out internal notes and admin actions.
 *
 * @implements AC-12 (CustomerPortalView filters out internal notes and admin actions)
 */

import { useState } from 'react';
import { Card } from '@intelliflow/ui';
import { SLAIndicator } from './SLAIndicator';
import { getStatusConfig } from '@/lib/tickets/ticket-utils';
import type { TicketDetailData, TicketActivity } from './types';

interface CustomerPortalViewProps {
  ticket: TicketDetailData;
  isLoading: boolean;
  onReply: (content: string, attachments?: File[]) => Promise<void>;
  customerName: string;
}

function isPublicActivity(activity: TicketActivity): boolean {
  return activity.type === 'customer_message' || activity.type === 'agent_reply';
}

export function CustomerPortalView({
  ticket,
  isLoading,
  onReply,
  customerName,
}: CustomerPortalViewProps) {
  const [replyContent, setReplyContent] = useState('');
  const [isSending, setIsSending] = useState(false);

  const statusConfig = getStatusConfig(ticket.status);
  const publicActivities = ticket.activities.filter(isPublicActivity);

  const handleSendReply = async () => {
    if (!replyContent.trim() || isSending) return;
    setIsSending(true);
    try {
      await onReply(replyContent.trim());
      setReplyContent('');
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="material-symbols-outlined text-4xl text-muted-foreground animate-spin">
          progress_activity
        </span>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-xl font-bold text-foreground">{ticket.subject}</h1>
          <span
            className={`px-2 py-0.5 rounded text-xs font-bold ${statusConfig?.bg} ${statusConfig?.text}`}
          >
            {statusConfig?.label}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Ticket #{ticket.ticketNumber} · Submitted by {customerName}
        </p>
      </div>

      {/* SLA Status */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Status</p>
            <p className="text-xs text-muted-foreground">
              Your request is being handled by our support team.
            </p>
          </div>
          <SLAIndicator
            slaStatus={ticket.slaStatus}
            slaTimeRemaining={ticket.slaTimeRemaining}
            showTimer={false}
          />
        </div>
      </Card>

      {/* Description */}
      <Card className="p-5">
        <h2 className="text-sm font-bold text-foreground mb-2">Description</h2>
        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
          {ticket.description}
        </p>
      </Card>

      {/* Public Activity Timeline */}
      <Card className="p-5">
        <h2 className="text-sm font-bold text-foreground mb-4">
          Conversation ({publicActivities.length})
        </h2>

        {publicActivities.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No messages yet.</p>
        ) : (
          <div className="space-y-4">
            {publicActivities.map((activity) => {
              const isCustomer = activity.type === 'customer_message';
              return (
                <div
                  key={activity.id}
                  className={`p-4 rounded-lg border ${
                    isCustomer
                      ? 'bg-background border-border'
                      : 'bg-blue-50 dark:bg-slate-800 border-blue-100 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          isCustomer
                            ? 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            : 'bg-[#137fec] text-white'
                        }`}
                      >
                        {activity.author.name.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {activity.author.name}
                      </span>
                      {!isCustomer && (
                        <span className="text-[10px] font-medium text-[#137fec] bg-[#137fec]/10 px-1.5 py-0.5 rounded">
                          Support
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{activity.timestamp}</span>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-line">
                    {activity.content}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Reply Composer (public only — no internal note toggle) */}
      <Card className="p-5">
        <h2 className="text-sm font-bold text-foreground mb-3">Reply</h2>
        <div className="space-y-3">
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            className="w-full p-3 rounded-lg border border-border bg-background text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
            placeholder="Type your reply..."
            aria-label="Reply message"
          />
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
              aria-label="Attach file"
            >
              <span className="material-symbols-outlined text-[20px]">attach_file</span>
            </button>
            <button
              type="button"
              onClick={handleSendReply}
              disabled={!replyContent.trim() || isSending}
              className="px-4 py-1.5 bg-[#137fec] text-white text-sm font-bold rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSending ? (
                <span className="material-symbols-outlined text-[16px] animate-spin">
                  progress_activity
                </span>
              ) : (
                <span className="material-symbols-outlined text-[16px]">send</span>
              )}
              Send
            </button>
          </div>
        </div>
      </Card>

      {/* Attachments (read-only) */}
      {ticket.attachments.length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-bold text-foreground mb-3">Attachments</h2>
          <div className="space-y-2">
            {ticket.attachments.map((file) => {
              const imageOrDefaultIcon = file.type === 'image' ? 'image' : 'description';
              const fileIcon = file.type === 'pdf' ? 'picture_as_pdf' : imageOrDefaultIcon;
              return (
                <div key={file.id} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <span className="material-symbols-outlined text-muted-foreground">
                    {fileIcon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{file.size}</p>
                  </div>
                  <button
                    className="p-1 text-muted-foreground hover:text-primary transition-colors"
                    aria-label={`Download ${file.name}`}
                  >
                    <span className="material-symbols-outlined text-[18px]">download</span>
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
