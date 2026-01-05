'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

// ============================================
// Avatar Color Palette
// ============================================

const AVATAR_COLORS = [
  'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-800 dark:text-indigo-200',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-200',
  'bg-rose-100 text-rose-700 dark:bg-rose-800 dark:text-rose-200',
  'bg-sky-100 text-sky-700 dark:bg-sky-800 dark:text-sky-200',
  'bg-violet-100 text-violet-700 dark:bg-violet-800 dark:text-violet-200',
  'bg-orange-100 text-orange-700 dark:bg-orange-800 dark:text-orange-200',
  'bg-teal-100 text-teal-700 dark:bg-teal-800 dark:text-teal-200',
  'bg-pink-100 text-pink-700 dark:bg-pink-800 dark:text-pink-200',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-800 dark:text-cyan-200',
] as const;

// ============================================
// Size Variants
// ============================================

const entityAvatarVariants = cva(
  'relative shrink-0 overflow-hidden flex items-center justify-center font-semibold',
  {
    variants: {
      size: {
        xs: 'h-6 w-6 text-[10px]',
        sm: 'h-8 w-8 text-xs',
        md: 'h-10 w-10 text-sm',
        lg: 'h-12 w-12 text-base',
        xl: 'h-16 w-16 text-lg',
      },
      shape: {
        circle: 'rounded-full',
        rounded: 'rounded-lg',
      },
    },
    defaultVariants: {
      size: 'md',
      shape: 'circle',
    },
  }
);

// ============================================
// Utility Functions
// ============================================

/**
 * Generate a consistent color based on a string (name/email)
 * Uses a simple hash function to ensure the same name always gets the same color
 */
function getColorFromString(str: string): string {
  const hash = str.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/**
 * Extract initials from a name string
 * Handles various formats: "John Doe", "john.doe@email.com", "JohnDoe", etc.
 */
function extractInitials(name: string, maxLength: number = 2): string {
  if (!name) return '?';

  // Clean the name
  const cleanName = name.trim();

  // If it looks like an email, extract the part before @
  const namePart = cleanName.includes('@') ? cleanName.split('@')[0] : cleanName;

  // Split by common separators
  const parts = namePart.split(/[\s._-]+/).filter(Boolean);

  if (parts.length === 0) return '?';

  if (parts.length === 1) {
    // Single word - check if it's camelCase or PascalCase
    const singleWord = parts[0];
    const uppercaseMatches = singleWord.match(/[A-Z]/g);

    // Check for camelCase (lowercase start with uppercase letters)
    if (uppercaseMatches && uppercaseMatches.length >= 1 && /^[a-z]/.test(singleWord)) {
      // camelCase: first letter + first uppercase letter
      const initials = [singleWord[0].toUpperCase(), uppercaseMatches[0]];
      return initials.slice(0, maxLength).join('');
    }

    // Check for PascalCase (multiple uppercase letters)
    if (uppercaseMatches && uppercaseMatches.length >= 2) {
      return uppercaseMatches.slice(0, maxLength).join('');
    }

    // Just take the first characters
    return singleWord.slice(0, maxLength).toUpperCase();
  }

  // Multiple words - take first letter of first N words
  return parts
    .slice(0, maxLength)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

// ============================================
// Component Props
// ============================================

export interface EntityAvatarProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof entityAvatarVariants> {
  /** Full name for initials extraction and color generation */
  name: string;
  /** Image URL (optional) - will show initials if not provided or if image fails to load */
  imageUrl?: string;
  /** Whether to use consistent color hashing (default: true) */
  colorHash?: boolean;
  /** Alt text for image (defaults to name) */
  alt?: string;
  /** Custom fallback content (overrides initials) */
  fallback?: React.ReactNode;
  /** Number of initials to show (default: 2) */
  maxInitials?: number;
}

// ============================================
// EntityAvatar Component
// ============================================

const EntityAvatar = React.forwardRef<HTMLDivElement, EntityAvatarProps>(
  (
    {
      name,
      imageUrl,
      colorHash = true,
      alt,
      fallback,
      size,
      shape,
      maxInitials = 2,
      className,
      ...props
    },
    ref
  ) => {
    const [imageError, setImageError] = React.useState(false);

    // Reset image error when URL changes
    React.useEffect(() => {
      setImageError(false);
    }, [imageUrl]);

    const initials = extractInitials(name, maxInitials);
    const colorClass = colorHash ? getColorFromString(name) : 'bg-muted text-muted-foreground';
    const showImage = imageUrl && !imageError;

    return (
      <div
        ref={ref}
        className={cn(
          entityAvatarVariants({ size, shape }),
          !showImage && colorClass,
          showImage && 'bg-muted',
          className
        )}
        role="img"
        aria-label={alt || `Avatar for ${name}`}
        {...props}
      >
        {showImage ? (
          <img
            src={imageUrl}
            alt={alt || name}
            className="h-full w-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : fallback ? (
          fallback
        ) : (
          <span aria-hidden="true">{initials}</span>
        )}
      </div>
    );
  }
);

EntityAvatar.displayName = 'EntityAvatar';

// ============================================
// Exports
// ============================================

export { EntityAvatar, entityAvatarVariants, extractInitials, getColorFromString, AVATAR_COLORS };
