/**
 * DealQuickView Component (PG-135)
 *
 * Stub component for side panel quick view of a deal.
 * Full implementation deferred — this is a placeholder.
 *
 * @module DealQuickView
 * AC-27: 6 component files created
 */

import * as React from 'react';
import { Card } from '@intelliflow/ui';

interface DealQuickViewProps {
  readonly dealId: string | null;
  readonly onClose: () => void;
  readonly onNavigateToDetail: (dealId: string) => void;
}

export function DealQuickView({ dealId, onClose, onNavigateToDetail }: DealQuickViewProps) {
  if (!dealId) return null;

  return (
    <Card className="p-4 bg-card border-border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Quick View</h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close quick view"
        >
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Deal details will be shown here in a future update.
      </p>
      <button
        type="button"
        onClick={() => onNavigateToDetail(dealId)}
        className="w-full px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md hover:bg-primary/90 transition-colors"
      >
        View Details
      </button>
    </Card>
  );
}
