import { Card, Skeleton } from '@intelliflow/ui';

export interface TypeSettingsLoadingProps {
  /** Screen-reader status text, e.g. "Loading case types". */
  label: string;
  /** Visually hidden page heading, for pages whose loaded state owns the h1. */
  heading?: string;
  /** Prefix for the skeleton row keys. */
  keyPrefix: string;
}

const ROW_COUNT = 4;
const DEFAULT_COUNT = 3;

/**
 * Skeleton mirroring the type-settings bento grid (case types PG-204, contact
 * types PG-205), so there is no layout shift when the data lands.
 */
export function TypeSettingsLoading({
  label,
  heading,
  keyPrefix,
}: Readonly<TypeSettingsLoadingProps>) {
  const rowKeys = Array.from({ length: ROW_COUNT }, (_, i) => `${keyPrefix}-row-${i}`);
  const defaultKeys = Array.from({ length: DEFAULT_COUNT }, (_, i) => `${keyPrefix}-default-${i}`);
  return (
    <div className="w-full" aria-busy="true">
      {heading && <h1 className="sr-only">{heading}</h1>}
      <output className="sr-only">{label}</output>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <Card className="lg:col-span-8 p-4 sm:p-5 space-y-3">
          <Skeleton className="h-9 w-56" />
          {rowKeys.map((key) => (
            <Skeleton key={key} className="h-14 w-full" />
          ))}
        </Card>
        <Card className="lg:col-span-4 p-4 sm:p-5 space-y-3">
          <Skeleton className="h-9 w-40" />
          {defaultKeys.map((key) => (
            <Skeleton key={key} className="h-6 w-full" />
          ))}
        </Card>
      </div>
    </div>
  );
}
