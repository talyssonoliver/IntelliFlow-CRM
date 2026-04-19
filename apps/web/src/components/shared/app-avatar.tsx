'use client';

import * as React from 'react';
import { cn } from '@intelliflow/ui';
import { isAvatarImageSource, normalizeAvatarSource } from '@/lib/shared/avatar-utils';

export interface AppAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  src?: string | null;
  fallbackText?: string | null;
  alt?: string;
  maxInitials?: number;
  imageClassName?: string;
  fallbackClassName?: string;
}

function getInitials(name: string, maxInitials: number): string {
  const parts = name
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, maxInitials).toUpperCase() || '?';
  }

  return parts
    .slice(0, maxInitials)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function AppAvatar({
  name,
  src = null,
  fallbackText = null,
  alt,
  maxInitials = 2,
  className,
  imageClassName,
  fallbackClassName,
  ...props
}: Readonly<AppAvatarProps>) {
  const normalizedSrc = React.useMemo(() => normalizeAvatarSource(src), [src]);
  const initialImageSource = React.useMemo(() => {
    if (!normalizedSrc || !isAvatarImageSource(normalizedSrc)) {
      return null;
    }
    return normalizedSrc;
  }, [normalizedSrc]);

  const [hasImageError, setHasImageError] = React.useState(false);

  React.useEffect(() => {
    setHasImageError(false);
  }, [initialImageSource]);

  const imageSource = initialImageSource && !hasImageError ? initialImageSource : null;
  const showImage = Boolean(imageSource);

  const trimmedFallback = fallbackText?.trim() ?? '';
  const sourceFallback = normalizedSrc && !initialImageSource ? normalizedSrc : '';
  const initials = getInitials(name, maxInitials);
  const fallbackLabel = trimmedFallback || sourceFallback || initials;

  return (
    // eslint-disable-next-line jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-interactions -- complex avatar visualization requires span with role
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        showImage
          ? 'bg-transparent'
          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-200',
        !showImage && fallbackClassName,
        className
      )}
      role="img"
      aria-label={alt ?? `Avatar for ${name}`}
      {...props}
    >
      {showImage ? (
        <img
          src={imageSource ?? undefined}
          alt={alt ?? name}
          className={cn('h-full w-full object-cover', imageClassName)}
          onError={() => {
            setHasImageError(true);
          }}
        />
      ) : null}
      {showImage ? null : <span className="font-semibold">{fallbackLabel}</span>}
    </span>
  );
}
