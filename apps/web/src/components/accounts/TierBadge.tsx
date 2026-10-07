'use client';

/**
 * Account tier display (PG-196) — resolves an account's revenue through the
 * tenant's tier configuration (`useAccountTiers`). Used by the accounts list
 * columns; one cached query serves every row.
 */
import { Badge } from '@intelliflow/ui';
import { useAccountTiers } from '@/hooks/useAccountTiers';

type Revenue = number | string | null | undefined;

/** Coloured dot for an account's tier, with the tier name for screen readers. */
export function TierDot({ revenue }: Readonly<{ revenue: Revenue }>) {
  const tier = useAccountTiers().resolveTier(revenue);
  return (
    <span className="inline-flex shrink-0" title={tier.label}>
      <span
        data-testid="tier-dot"
        className={`w-2 h-2 rounded-full ${tier.colors.dot}`}
        aria-hidden="true"
      />
      <span className="sr-only">{tier.label} tier</span>
    </span>
  );
}

/** Initials avatar tinted with the account's tier colour. */
export function TierAvatar({
  revenue,
  initials,
  className = 'size-9 rounded-lg text-xs',
}: Readonly<{ revenue: Revenue; initials: string; className?: string }>) {
  const tier = useAccountTiers().resolveTier(revenue);
  return (
    <div
      className={`${className} ${tier.colors.avatarBg} flex items-center justify-center font-semibold shrink-0`}
    >
      {initials}
    </div>
  );
}

/** Tier name badge. */
export function TierBadge({ revenue }: Readonly<{ revenue: Revenue }>) {
  const tier = useAccountTiers().resolveTier(revenue);
  return <Badge className={tier.colors.badge}>{tier.label}</Badge>;
}
