'use client';

/**
 * Version Comparison View Component
 *
 * PG-128: AI Chain Versioning Admin UI
 *
 * Side-by-side comparison of two chain versions.
 * Features:
 * - Version selection via dropdowns
 * - Side-by-side display of version details
 * - Differences table highlighting changed fields
 * - Prompt text comparison
 * - Loading state
 *
 * Acceptance Criteria: AC11 (version comparison shows diff)
 */

import { useState, useCallback } from 'react';
import { Card, Button, Badge, Skeleton, Label, EmptyState } from '@intelliflow/ui';
import type { ChainVersionSummary } from '@intelliflow/validators';
import type { VersionComparison } from '../hooks/useChainVersions';

interface VersionComparisonViewProps {
  versions: ChainVersionSummary[];
  onCompare: (idA: string, idB: string) => Promise<VersionComparison>;
  isLoading: boolean;
}

export function VersionComparisonView({
  versions,
  onCompare,
  isLoading,
}: Readonly<VersionComparisonViewProps>) {
  const [selectedA, setSelectedA] = useState('');
  const [selectedB, setSelectedB] = useState('');
  const [comparison, setComparison] = useState<VersionComparison | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCompare = selectedA && selectedB && selectedA !== selectedB && !isComparing;

  const handleCompare = useCallback(async () => {
    if (!canCompare) return;

    try {
      setError(null);
      setIsComparing(true);
      const result = await onCompare(selectedA, selectedB);
      setComparison(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comparison failed');
      setComparison(null);
    } finally {
      setIsComparing(false);
    }
  }, [selectedA, selectedB, canCompare, onCompare]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Loading versions...</p>
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Version Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="compare-version-a">Version A</Label>
          <select
            id="compare-version-a"
            role="combobox"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            value={selectedA}
            onChange={(e) => {
              setSelectedA(e.target.value);
              setComparison(null);
            }}
          >
            <option value="">Select version...</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.chainType} - {v.model} ({v.status}) - {v.id.slice(0, 8)}...
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="compare-version-b">Version B</Label>
          <select
            id="compare-version-b"
            role="combobox"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            value={selectedB}
            onChange={(e) => {
              setSelectedB(e.target.value);
              setComparison(null);
            }}
          >
            <option value="">Select version...</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.chainType} - {v.model} ({v.status}) - {v.id.slice(0, 8)}...
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Compare Button */}
      <div className="flex justify-center">
        <Button onClick={handleCompare} disabled={!canCompare} variant="default">
          {isComparing ? 'Comparing...' : 'Compare Versions'}
        </Button>
      </div>

      {/* Empty state */}
      {!comparison && !error && !isComparing && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">
            Select two versions above and click Compare to see the differences.
          </p>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card className="p-4 border-destructive">
          <p className="text-destructive text-sm">{error}</p>
        </Card>
      )}

      {/* Comparison Results */}
      {comparison && (
        <div className="space-y-6">
          {/* Side-by-side Version Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Version A */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-semibold">Version A</h3>
                <Badge variant="outline" className="text-xs">
                  {comparison.versionA.status}
                </Badge>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Model:</span>
                  <span className="font-medium">{comparison.versionA.model}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Chain Type:</span>
                  <span className="font-medium">{comparison.versionA.chainType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Temperature:</span>
                  <span className="font-medium">{comparison.versionA.temperature ?? 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Tokens:</span>
                  <span className="font-medium">{comparison.versionA.maxTokens ?? 'N/A'}</span>
                </div>
              </div>
              {comparison.versionA.prompt && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-1">Prompt:</p>
                  <pre className="text-xs bg-muted p-2 rounded whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                    {comparison.versionA.prompt}
                  </pre>
                </div>
              )}
            </Card>

            {/* Version B */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-semibold">Version B</h3>
                <Badge variant="outline" className="text-xs">
                  {comparison.versionB.status}
                </Badge>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Model:</span>
                  <span className="font-medium">{comparison.versionB.model}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Chain Type:</span>
                  <span className="font-medium">{comparison.versionB.chainType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Temperature:</span>
                  <span className="font-medium">{comparison.versionB.temperature ?? 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Tokens:</span>
                  <span className="font-medium">{comparison.versionB.maxTokens ?? 'N/A'}</span>
                </div>
              </div>
              {comparison.versionB.prompt && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-1">Prompt:</p>
                  <pre className="text-xs bg-muted p-2 rounded whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                    {comparison.versionB.prompt}
                  </pre>
                </div>
              )}
            </Card>
          </div>

          {/* Differences Table */}
          {comparison.differences.length > 0 && (
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Differences</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 text-muted-foreground font-medium">
                        Field
                      </th>
                      <th className="text-left py-2 pr-4 text-muted-foreground font-medium">
                        Version A
                      </th>
                      <th className="text-left py-2 text-muted-foreground font-medium">
                        Version B
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.differences.map((diff) => (
                      <tr key={diff.field} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{diff.field}</td>
                        <td className="py-2 pr-4 bg-red-50 dark:bg-red-950/20">
                          <span className="font-mono text-xs">
                            {typeof diff.valueA === 'string' && diff.valueA.length > 100
                              ? `${diff.valueA.slice(0, 100)}...`
                              : String(diff.valueA)}
                          </span>
                        </td>
                        <td className="py-2 bg-green-50 dark:bg-green-950/20">
                          <span className="font-mono text-xs">
                            {typeof diff.valueB === 'string' && diff.valueB.length > 100
                              ? `${diff.valueB.slice(0, 100)}...`
                              : String(diff.valueB)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {comparison.differences.length === 0 && (
            <Card className="p-4">
              <EmptyState entity="insights" phase="passive" />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
