/**
 * Utility for conditionally joining class names.
 * Lightweight alternative to clsx/classnames.
 */
export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(' ');
}
