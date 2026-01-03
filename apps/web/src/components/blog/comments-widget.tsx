'use client';

import * as React from 'react';
import { Button, Card } from '@intelliflow/ui';
import { cn } from '@intelliflow/ui';

interface Comment {
  id: string;
  author: {
    name: string;
    avatar?: string;
  };
  content: string;
  createdAt: string;
  likes: number;
  replies?: Comment[];
  isLiked?: boolean;
}

interface CommentsWidgetProps {
  postSlug: string;
  className?: string;
}

// Sample comments for demo (in production, fetch from API)
const sampleComments: Comment[] = [
  {
    id: '1',
    author: { name: 'Alex Thompson' },
    content: 'Great article! The section on human oversight really resonated with our team\'s approach to AI implementation.',
    createdAt: '2025-12-29T10:30:00Z',
    likes: 12,
    isLiked: false,
    replies: [
      {
        id: '1-1',
        author: { name: 'Sarah Chen' },
        content: 'Thanks Alex! We\'ve found that explicit approval workflows make a huge difference in building trust with the sales team.',
        createdAt: '2025-12-29T11:15:00Z',
        likes: 5,
      },
    ],
  },
  {
    id: '2',
    author: { name: 'Maria Garcia' },
    content: 'Would love to see a follow-up post on how to measure the ROI of AI-assisted lead scoring. We\'re currently evaluating IntelliFlow for our mid-market sales team.',
    createdAt: '2025-12-28T16:45:00Z',
    likes: 8,
  },
];

export function CommentsWidget({ postSlug: _postSlug, className }: CommentsWidgetProps) {
  const [comments, setComments] = React.useState<Comment[]>(sampleComments);
  const [newComment, setNewComment] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [replyingTo, setReplyingTo] = React.useState<string | null>(null);
  const [replyContent, setReplyContent] = React.useState('');

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setIsSubmitting(true);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));

    const comment: Comment = {
      id: `temp-${Date.now()}`,
      author: { name: 'You' },
      content: newComment.trim(),
      createdAt: new Date().toISOString(),
      likes: 0,
    };

    setComments(prev => [comment, ...prev]);
    setNewComment('');
    setIsSubmitting(false);
  };

  const handleSubmitReply = async (parentId: string) => {
    if (!replyContent.trim()) return;

    setIsSubmitting(true);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));

    const reply: Comment = {
      id: `temp-${Date.now()}`,
      author: { name: 'You' },
      content: replyContent.trim(),
      createdAt: new Date().toISOString(),
      likes: 0,
    };

    setComments(prev =>
      prev.map(c => {
        if (c.id === parentId) {
          return { ...c, replies: [...(c.replies || []), reply] };
        }
        return c;
      })
    );

    setReplyContent('');
    setReplyingTo(null);
    setIsSubmitting(false);
  };

  const handleLike = (commentId: string, isReply?: boolean, parentId?: string) => {
    setComments(prev =>
      prev.map(c => {
        if (isReply && parentId && c.id === parentId) {
          return {
            ...c,
            replies: c.replies?.map(r =>
              r.id === commentId
                ? { ...r, likes: r.isLiked ? r.likes - 1 : r.likes + 1, isLiked: !r.isLiked }
                : r
            ),
          };
        }
        if (c.id === commentId) {
          return { ...c, likes: c.isLiked ? c.likes - 1 : c.likes + 1, isLiked: !c.isLiked };
        }
        return c;
      })
    );
  };

  return (
    <section
      aria-labelledby="comments-heading"
      className={cn('mt-12 pt-8 border-t border-slate-200 dark:border-slate-700', className)}
    >
      <h2 id="comments-heading" className="text-xl font-bold text-slate-900 dark:text-white mb-6">
        Comments ({comments.reduce((acc, c) => acc + 1 + (c.replies?.length || 0), 0)})
      </h2>

      {/* New Comment Form */}
      <Card className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 mb-6">
        <form onSubmit={handleSubmitComment}>
          <label htmlFor="new-comment" className="sr-only">
            Write a comment
          </label>
          <textarea
            id="new-comment"
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="Share your thoughts..."
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white bg-white dark:bg-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent resize-none"
          />
          <div className="flex justify-between items-center mt-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Be respectful and constructive in your comments.
            </p>
            <Button
              type="submit"
              disabled={!newComment.trim() || isSubmitting}
              className="bg-[#137fec] hover:bg-[#0e6ac7] disabled:opacity-50"
            >
              {isSubmitting ? 'Posting...' : 'Post Comment'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Comments List */}
      <div className="space-y-6">
        {comments.map(comment => (
          <CommentCard
            key={comment.id}
            comment={comment}
            onLike={handleLike}
            onReply={id => setReplyingTo(id)}
            isReplying={replyingTo === comment.id}
            replyContent={replyContent}
            onReplyContentChange={setReplyContent}
            onSubmitReply={() => handleSubmitReply(comment.id)}
            onCancelReply={() => {
              setReplyingTo(null);
              setReplyContent('');
            }}
            isSubmitting={isSubmitting}
          />
        ))}
      </div>

      {comments.length === 0 && (
        <div className="text-center py-12">
          <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 mb-3" aria-hidden="true">
            chat_bubble_outline
          </span>
          <p className="text-slate-500 dark:text-slate-400">
            No comments yet. Be the first to share your thoughts!
          </p>
        </div>
      )}
    </section>
  );
}

interface CommentCardProps {
  comment: Comment;
  onLike: (id: string, isReply?: boolean, parentId?: string) => void;
  onReply: (id: string) => void;
  isReplying: boolean;
  replyContent: string;
  onReplyContentChange: (content: string) => void;
  onSubmitReply: () => void;
  onCancelReply: () => void;
  isSubmitting: boolean;
}

function CommentCard({
  comment,
  onLike,
  onReply,
  isReplying,
  replyContent,
  onReplyContentChange,
  onSubmitReply,
  onCancelReply,
  isSubmitting,
}: CommentCardProps) {
  const formattedDate = new Date(comment.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <article className="space-y-4">
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
          {comment.author.avatar ? (
            <img
              src={comment.author.avatar}
              alt=""
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {comment.author.name
                .split(' ')
                .map(n => n[0])
                .join('')
                .slice(0, 2)}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-slate-900 dark:text-white">
              {comment.author.name}
            </span>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {formattedDate}
            </span>
          </div>
          <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
            {comment.content}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-4 mt-3">
            <button
              onClick={() => onLike(comment.id)}
              className={cn(
                'inline-flex items-center gap-1 text-sm transition-colors',
                comment.isLiked
                  ? 'text-[#137fec]'
                  : 'text-slate-500 dark:text-slate-400 hover:text-[#137fec]'
              )}
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                {comment.isLiked ? 'thumb_up' : 'thumb_up_off_alt'}
              </span>
              {comment.likes > 0 && <span>{comment.likes}</span>}
            </button>
            <button
              onClick={() => onReply(comment.id)}
              className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-[#137fec] transition-colors"
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                reply
              </span>
              Reply
            </button>
          </div>

          {/* Reply Form */}
          {isReplying && (
            <div className="mt-4 pl-4 border-l-2 border-slate-200 dark:border-slate-700">
              <label htmlFor={`reply-${comment.id}`} className="sr-only">
                Write a reply
              </label>
              <textarea
                id={`reply-${comment.id}`}
                value={replyContent}
                onChange={e => onReplyContentChange(e.target.value)}
                placeholder="Write a reply..."
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white bg-white dark:bg-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent resize-none text-sm"
              />
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  onClick={onSubmitReply}
                  disabled={!replyContent.trim() || isSubmitting}
                  className="bg-[#137fec] hover:bg-[#0e6ac7] text-xs"
                >
                  {isSubmitting ? 'Posting...' : 'Reply'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onCancelReply}
                  className="text-xs"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Replies */}
          {comment.replies && comment.replies.length > 0 && (
            <div className="mt-4 space-y-4 pl-4 border-l-2 border-slate-200 dark:border-slate-700">
              {comment.replies.map(reply => (
                <div key={reply.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      {reply.author.name
                        .split(' ')
                        .map(n => n[0])
                        .join('')
                        .slice(0, 2)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-slate-900 dark:text-white text-sm">
                        {reply.author.name}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(reply.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                      {reply.content}
                    </p>
                    <button
                      onClick={() => onLike(reply.id, true, comment.id)}
                      className={cn(
                        'inline-flex items-center gap-1 text-xs mt-2 transition-colors',
                        reply.isLiked
                          ? 'text-[#137fec]'
                          : 'text-slate-500 dark:text-slate-400 hover:text-[#137fec]'
                      )}
                    >
                      <span className="material-symbols-outlined text-sm" aria-hidden="true">
                        {reply.isLiked ? 'thumb_up' : 'thumb_up_off_alt'}
                      </span>
                      {reply.likes > 0 && <span>{reply.likes}</span>}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export default CommentsWidget;
