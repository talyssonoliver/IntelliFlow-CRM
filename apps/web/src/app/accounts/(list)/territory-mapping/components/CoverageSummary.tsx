'use client';

/**
 * Coverage card (PG-197, AC-008): whether Auto-assign owner is on (the toggle
 * itself lives in Account Settings), counts, and a read-only "Test an
 * address" form backed by `accountTerritories.preview`.
 */
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button, Input, Label } from '@intelliflow/ui';
import type { TerritoryStrategy } from '@intelliflow/domain';
import { CountrySelect } from '@/components/shared/country-select';
import { STRATEGY_LABELS } from './TerritoryDialog';

export interface TerritoryPreviewResult {
  territoryId: string | null;
  territoryName: string | null;
  strategy: TerritoryStrategy | null;
  matchedBy: 'rule' | 'default' | 'none';
}

export interface CoverageSummaryProps {
  autoAssignOwner: boolean;
  territoryCount: number;
  ruleCount: number;
  memberCount: number;
  onPreview: (input: {
    country?: string;
    region?: string;
    postalCode?: string;
  }) => Promise<TerritoryPreviewResult>;
}

export function describePreview(result: TerritoryPreviewResult): string {
  if (result.matchedBy === 'none' || !result.territoryName || !result.strategy) {
    return 'No territory — the creator keeps the account.';
  }
  const how = result.matchedBy === 'rule' ? 'matched by a rule' : 'the default territory';
  return `${result.territoryName} (${how}) — ${STRATEGY_LABELS[result.strategy].label}.`;
}

export function CoverageSummary({
  autoAssignOwner,
  territoryCount,
  ruleCount,
  memberCount,
  onPreview,
}: Readonly<CoverageSummaryProps>) {
  const [country, setCountry] = useState<string | null>(null);
  const [region, setRegion] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const test = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsTesting(true);
    try {
      const preview = await onPreview({
        country: country ?? undefined,
        region: region.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
      });
      setResult(describePreview(preview));
    } catch {
      setResult('Could not test this address. Try again.');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div
        className={`rounded-lg border p-3 text-sm ${
          autoAssignOwner
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100'
            : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
        }`}
      >
        <p className="font-medium">Auto-assign owner is {autoAssignOwner ? 'on' : 'off'}.</p>
        <p className="mt-1">
          {autoAssignOwner
            ? 'New accounts without an owner are assigned by these territories.'
            : 'Territories are saved but not used until auto-assign is turned on.'}{' '}
          <Link href="/accounts/account-settings" className="underline font-medium">
            Change in Account Settings
          </Link>
        </p>
      </div>

      <dl className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-muted/50 p-3">
          <dt className="text-xs text-muted-foreground">Territories</dt>
          <dd className="text-lg font-semibold text-foreground">{territoryCount}</dd>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <dt className="text-xs text-muted-foreground">Rules</dt>
          <dd className="text-lg font-semibold text-foreground">{ruleCount}</dd>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <dt className="text-xs text-muted-foreground">Members</dt>
          <dd className="text-lg font-semibold text-foreground">{memberCount}</dd>
        </div>
      </dl>

      <form onSubmit={test} className="space-y-3" aria-labelledby="territory-test-heading">
        <h3 id="territory-test-heading" className="text-sm font-semibold text-foreground">
          Test an address
        </h3>
        <div className="space-y-1.5">
          <Label htmlFor="preview-country">Country</Label>
          <CountrySelect id="preview-country" value={country} onChange={setCountry} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="preview-region">Region</Label>
            <Input
              id="preview-region"
              value={region}
              maxLength={100}
              onChange={(e) => setRegion(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="preview-postal">Postal code</Label>
            <Input
              id="preview-postal"
              value={postalCode}
              maxLength={20}
              onChange={(e) => setPostalCode(e.target.value)}
            />
          </div>
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={isTesting}>
          {isTesting ? 'Testing…' : 'Test Address'}
        </Button>
        <output aria-live="polite" className="block text-sm text-foreground min-h-5">
          {result}
        </output>
      </form>
    </div>
  );
}
