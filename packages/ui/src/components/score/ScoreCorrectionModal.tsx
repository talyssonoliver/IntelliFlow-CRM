'use client';

/**
 * ScoreCorrectionModal Component - IFC-024: Human-in-the-Loop Feedback
 *
 * A modal dialog for users to submit score corrections with reasons.
 * Features:
 * - Score slider to adjust the value (0-100)
 * - Category selection for why the score was incorrect
 * - Optional free-text reason field
 * - Visual indication of correction magnitude
 */

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../dialog';
import { Button } from '../button';
import { Label } from '../label';
import { Slider } from '../slider';
import { Textarea } from '../textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../select';
import { cn } from '../../lib/utils';
import { FEEDBACK_CATEGORIES } from '@intelliflow/domain';
import type { FeedbackCategory } from '@intelliflow/domain';

/**
 * Category labels for display
 */
const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  SCORE_TOO_HIGH: 'Score was too high',
  SCORE_TOO_LOW: 'Score was too low',
  WRONG_FACTORS: 'Incorrect factor weighting',
  MISSING_CONTEXT: 'AI lacked relevant information',
  DATA_QUALITY: 'Input data was poor',
  OTHER: 'Other reason',
};

/**
 * Correction data submitted by the user
 */
export interface ScoreCorrectionData {
  correctedScore: number;
  category: FeedbackCategory;
  reason?: string;
}

export interface ScoreCorrectionModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when the modal is closed */
  onClose: () => void;
  /** The original AI-generated score */
  originalScore: number;
  /** Callback when the correction is submitted */
  onSubmit: (data: ScoreCorrectionData) => void;
  /** Whether submission is in progress */
  isSubmitting?: boolean;
}

/**
 * Get the severity color for the correction magnitude
 */
function getMagnitudeColor(magnitude: number): string {
  if (magnitude <= 10) return 'text-muted-foreground';
  if (magnitude <= 25) return 'text-yellow-600 dark:text-yellow-500';
  if (magnitude <= 50) return 'text-orange-600 dark:text-orange-500';
  return 'text-red-600 dark:text-red-500';
}

/**
 * Get the magnitude label
 */
function getMagnitudeLabel(magnitude: number): string {
  if (magnitude <= 10) return 'Minor';
  if (magnitude <= 25) return 'Moderate';
  if (magnitude <= 50) return 'Major';
  return 'Severe';
}

export function ScoreCorrectionModal({
  isOpen,
  onClose,
  originalScore,
  onSubmit,
  isSubmitting = false,
}: ScoreCorrectionModalProps) {
  const [correctedScore, setCorrectedScore] = React.useState(originalScore);
  const [category, setCategory] = React.useState<FeedbackCategory | ''>('');
  const [reason, setReason] = React.useState('');

  // Reset form when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setCorrectedScore(originalScore);
      setCategory('');
      setReason('');
    }
  }, [isOpen, originalScore]);

  const magnitude = Math.abs(correctedScore - originalScore);
  const direction = correctedScore > originalScore ? 'increase' : 'decrease';
  const isValid = category !== '' && magnitude > 0;

  const handleSubmit = () => {
    if (!isValid) return;
    // Type narrowing: after isValid check, category is guaranteed to be FeedbackCategory
    const validCategory = category as FeedbackCategory;

    onSubmit({
      correctedScore,
      category: validCategory,
      reason: reason.trim() || undefined,
    });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Correct AI Score</DialogTitle>
          <DialogDescription>
            Adjust the score and let us know why it was incorrect. This helps improve our AI.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Score Comparison */}
          <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Original</div>
              <div className="text-2xl font-bold">{originalScore}</div>
            </div>
            <div className="text-muted-foreground">
              <span className="material-symbols-outlined" aria-hidden="true">
                arrow_forward
              </span>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Corrected</div>
              <div className={cn('text-2xl font-bold', magnitude > 0 && 'text-primary')}>
                {correctedScore}
              </div>
            </div>
          </div>

          {/* Magnitude indicator */}
          {magnitude > 0 && (
            <div className="text-center">
              <span className={cn('text-sm font-medium', getMagnitudeColor(magnitude))}>
                {getMagnitudeLabel(magnitude)} {direction} ({direction === 'increase' ? '+' : '-'}
                {magnitude} points)
              </span>
            </div>
          )}

          {/* Score Slider */}
          <div className="space-y-3">
            <Label htmlFor="score-slider">What should the score be?</Label>
            <Slider
              id="score-slider"
              value={[correctedScore]}
              onValueChange={([value]) => setCorrectedScore(value)}
              min={0}
              max={100}
              step={1}
              className="py-2"
              aria-label="Corrected score"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>0 (Cold)</span>
              <span>50 (Warm)</span>
              <span>100 (Hot)</span>
            </div>
          </div>

          {/* Category Selection */}
          <div className="space-y-2">
            <Label htmlFor="category-select">Why was the score incorrect?</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as FeedbackCategory)}
            >
              <SelectTrigger id="category-select">
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {FEEDBACK_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Optional Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason-text">
              Additional details <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="reason-text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Provide more context about your correction..."
              rows={3}
              maxLength={1000}
            />
            {reason.length > 0 && (
              <div className="text-right text-xs text-muted-foreground">
                {reason.length}/1000
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit Correction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
