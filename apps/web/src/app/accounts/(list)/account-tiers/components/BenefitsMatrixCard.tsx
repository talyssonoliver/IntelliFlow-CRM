'use client';

import { Button, Checkbox, EmptyState, Input } from '@intelliflow/ui';
import type { BenefitRow, TierDraft } from '../tier-draft';

export interface BenefitsMatrixCardProps {
  readonly tiers: readonly TierDraft[];
  readonly benefits: readonly BenefitRow[];
  readonly errors: Readonly<Record<string, string[]>>;
  readonly readOnly: boolean;
  /** Last add/remove, read out by the polite live region. */
  readonly announcement: string;
  readonly onRename: (benefitId: string, name: string) => void;
  readonly onRemove: (benefitId: string) => void;
  readonly onToggle: (tierId: string, benefitId: string, checked: boolean) => void;
}

/** Benefits (rows) × tiers (columns); a ticked cell means the tier gets that benefit. */
export function BenefitsMatrixCard({
  tiers,
  benefits,
  errors,
  readOnly,
  announcement,
  onRename,
  onRemove,
  onToggle,
}: BenefitsMatrixCardProps) {
  return (
    <div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {benefits.length === 0 ? (
        <EmptyState entity="rules" phase="passive" size="sm" className="py-4 px-3 gap-2" />
      ) : (
        <section className="overflow-x-auto" tabIndex={0} aria-label="Benefits by tier, scrollable">
          <table className="w-full text-sm">
            <caption className="sr-only">Benefits each account tier receives</caption>
            <thead>
              <tr>
                <th scope="col" className="text-left font-medium text-muted-foreground pb-2 pr-2">
                  Benefit
                </th>
                {tiers.map((tier) => (
                  <th
                    key={tier.id}
                    scope="col"
                    className="px-2 pb-2 text-center font-medium text-muted-foreground whitespace-nowrap"
                  >
                    {tier.label.trim() || 'Untitled'}
                  </th>
                ))}
                <th scope="col" className="pb-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {benefits.map((benefit, index) => {
                const name = benefit.name.trim() || `Benefit ${index + 1}`;
                const rowErrors = errors[benefit.id] ?? [];
                return (
                  <tr key={benefit.id} className="border-t border-border">
                    <th scope="row" className="py-2 pr-2 text-left font-normal min-w-[160px]">
                      <Input
                        value={benefit.name}
                        maxLength={80}
                        placeholder="e.g. Dedicated CSM"
                        disabled={readOnly}
                        aria-label={`Benefit ${index + 1} name`}
                        aria-invalid={rowErrors.length > 0}
                        onChange={(e) => onRename(benefit.id, e.target.value)}
                      />
                      {rowErrors.map((message) => (
                        <p key={message} role="alert" className="mt-1 text-xs text-destructive">
                          {message}
                        </p>
                      ))}
                    </th>
                    {tiers.map((tier) => (
                      <td key={tier.id} className="px-2 py-2 text-center">
                        <Checkbox
                          checked={tier.benefitIds.includes(benefit.id)}
                          disabled={readOnly}
                          aria-label={`${name} for ${tier.label.trim() || 'Untitled'}`}
                          onCheckedChange={(checked) =>
                            onToggle(tier.id, benefit.id, checked === true)
                          }
                        />
                      </td>
                    ))}
                    <td className="py-2 pl-2 text-right">
                      {!readOnly && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove benefit ${name}`}
                          onClick={() => onRemove(benefit.id)}
                        >
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
