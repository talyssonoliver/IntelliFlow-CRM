'use client';

import React, { useState, useRef, useEffect } from 'react';
import { toast } from '@intelliflow/ui';

export interface ReactionGroup {
  emoji: string;
  count: number;
  users: string[];
}

export interface ActivityComment {
  id: string;
  text: string;
  user: string;
  timestamp: string;
}

export interface ActivityFeedItemActionsProps {
  activityId: string;
  activityTitle: string;
  /** Reply adds a comment to this activity (threaded conversation) */
  onReply: (activityId: string, text: string) => void;
  /** Add Note creates a standalone note on the entity (shows in Notes tab) */
  onSubmitNote: (content: string) => void;
  onToggleReaction: (activityId: string, emoji: string) => void;
  isSubmitting?: boolean;
  shareUrl: string;
  reactions?: ReactionGroup[];
  currentUserId?: string;
  /** Existing comments on this activity */
  comments?: ActivityComment[];
}

const EMOJI_OPTIONS = ['👍', '❤️', '🎉', '👏', '😮'];

export function ActivityFeedItemActions({
  activityId,
  activityTitle,
  onReply,
  onSubmitNote,
  onToggleReaction,
  isSubmitting,
  shareUrl,
  reactions = [],
  currentUserId,
  comments = [],
}: ActivityFeedItemActionsProps) {
  const [showInput, setShowInput] = useState(false);
  const [inputContent, setInputContent] = useState('');
  const [inputMode, setInputMode] = useState<'reply' | 'note'>('reply');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showInput && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [showInput]);

  // Close emoji picker on outside click
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handler = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmojiPicker]);

  const handleReplyClick = () => {
    setInputMode('reply');
    setInputContent('');
    setShowInput(true);
    setShowEmojiPicker(false);
  };

  const handleAddNoteClick = () => {
    setInputMode('note');
    setInputContent('');
    setShowInput(true);
    setShowEmojiPicker(false);
  };

  const handleSubmit = () => {
    const trimmed = inputContent.trim();
    if (!trimmed) return;
    if (inputMode === 'reply') {
      onReply(activityId, trimmed);
    } else {
      onSubmitNote(trimmed);
    }
    setInputContent('');
    setShowInput(false);
  };

  const handleCancel = () => {
    setShowInput(false);
    setInputContent('');
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: 'Link copied', description: 'Activity link copied to clipboard.' });
    } catch {
      toast({ title: 'Copy failed', description: 'Could not copy link.', variant: 'destructive' });
    }
  };

  const btnClass =
    'flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-500 hover:text-[#137fec] hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors';

  const formatTime = (ts: string) => {
    try {
      const date = new Date(ts);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      const diffDay = Math.floor(diffHr / 24);
      return `${diffDay}d ago`;
    } catch {
      return ts;
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
      {/* Reaction badges */}
      {reactions.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {reactions.map((r) => (
            <button
              key={r.emoji}
              onClick={() => onToggleReaction(activityId, r.emoji)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border transition-colors ${
                r.users.includes(currentUserId ?? '')
                  ? 'border-[#137fec] bg-[#137fec]/10 text-[#137fec]'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-[#137fec]'
              }`}
              title={r.users.join(', ')}
            >
              <span>{r.emoji}</span>
              <span>{r.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Threaded comments */}
      {comments.length > 0 && (
        <div className="mb-2 space-y-2">
          {comments.map((c) => (
            <div
              key={c.id}
              className="pl-3 border-l-2 border-slate-200 dark:border-slate-700"
            >
              <p className="text-sm text-slate-600 dark:text-slate-400">{c.text}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {c.user} &middot; {formatTime(c.timestamp)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        <button className={btnClass} onClick={handleReplyClick}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
          </svg>
          Reply
        </button>
        <div className="relative" ref={emojiRef}>
          <button
            className={btnClass}
            onClick={() => {
              setShowEmojiPicker((v) => !v);
              setShowInput(false);
            }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            React
          </button>
          {showEmojiPicker && (
            <div className="absolute bottom-full left-0 mb-1 flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-1.5 z-10">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onToggleReaction(activityId, emoji);
                    setShowEmojiPicker(false);
                  }}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-base transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className={btnClass} onClick={handleAddNoteClick}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 21q-.825 0-1.412-.587Q3 19.825 3 19V5q0-.825.588-1.413Q4.175 3 5 3h14q.825 0 1.413.587Q21 4.175 21 5v10l-6 6Zm0-2h9v-5h5V5H5v14Z" />
          </svg>
          Add Note
        </button>
        <button className={btnClass} onClick={handleShare}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
          </svg>
          Share
        </button>
      </div>

      {/* Inline textarea for Reply / Add Note */}
      {showInput && (
        <div className="mt-3">
          <textarea
            ref={textareaRef}
            value={inputContent}
            onChange={(e) => setInputContent(e.target.value)}
            placeholder={inputMode === 'reply' ? `Reply to "${activityTitle}"...` : 'Add a note...'}
            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec] resize-none"
            rows={3}
          />
          <div className="flex items-center gap-2 mt-2">
            <p className="text-xs text-slate-400 flex-1">
              {inputMode === 'reply'
                ? 'Reply appears as a comment on this activity'
                : 'Note is saved to the Notes tab'}
            </p>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!inputContent.trim() || isSubmitting}
              className="px-3 py-1.5 text-xs font-medium text-white bg-[#137fec] hover:bg-[#0f6dd0] rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving...' : inputMode === 'reply' ? 'Reply' : 'Save Note'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
