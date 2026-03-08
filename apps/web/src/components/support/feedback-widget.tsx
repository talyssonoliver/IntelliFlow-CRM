'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@intelliflow/ui';

export type FeedbackValue = 'helpful' | 'not_helpful';

export interface FeedbackWidgetProps {
  articleId: string;
  onFeedback?: (value: FeedbackValue) => void;
}

export function FeedbackWidget({ articleId: _articleId, onFeedback }: Readonly<FeedbackWidgetProps>) {
  const [submitted, setSubmitted] = useState(false);
  const confirmationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (submitted && confirmationRef.current) {
      confirmationRef.current.focus();
    }
  }, [submitted]);

  function handleFeedback(value: FeedbackValue) {
    if (submitted) return;
    setSubmitted(true);
    onFeedback?.(value);
  }

  return (
    <div className="border-t border-border pt-6 mt-8">
      <div aria-live="polite">
        {submitted ? (
          <div
            ref={confirmationRef}
            tabIndex={-1}
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <span className="material-symbols-outlined text-success text-base" aria-hidden="true">
              check_circle
            </span>
            Thank you for your feedback!
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-foreground">Was this helpful?</span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Yes, this article was helpful"
                aria-pressed="false"
                onClick={() => handleFeedback('helpful')}
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  thumb_up
                </span>
                Yes
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="No, this article was not helpful"
                aria-pressed="false"
                onClick={() => handleFeedback('not_helpful')}
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  thumb_down
                </span>
                No
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
