import * as React from 'react';
import { cn } from '../lib/utils';

function Skeleton({ className, ...props }: Readonly<React.HTMLAttributes<HTMLDivElement>>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

type SkeletonListProps = Readonly<
  Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & {
    count: number;
    itemClassName?: string;
    keyPrefix?: string;
  }
>;

function SkeletonList({
  count,
  itemClassName,
  keyPrefix = 'sk',
  className,
  ...props
}: SkeletonListProps) {
  const items = React.useMemo(
    () => Array.from({ length: count }, (_, i) => `${keyPrefix}-${i}`),
    [count, keyPrefix],
  );
  return (
    <div className={className} {...props}>
      {items.map((key) => (
        <Skeleton key={key} className={itemClassName} />
      ))}
    </div>
  );
}

export { Skeleton, SkeletonList };
