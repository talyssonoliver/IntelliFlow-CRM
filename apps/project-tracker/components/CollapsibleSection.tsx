'use client';

import React, { useState, useEffect, ReactNode } from 'react';
import { Icon } from '@/lib/icons';

interface CollapsibleSectionProps {
  /** Unique identifier for localStorage persistence */
  storageKey: string;
  /** Section title displayed in header */
  title: string;
  /** Material Design icon name */
  icon?: string;
  /** Icon color class (e.g., 'text-blue-600') */
  iconColor?: string;
  /** Optional count badge in header */
  count?: number;
  /** Whether section is expanded by default */
  defaultExpanded?: boolean;
  /** Tailwind gradient class for header (e.g., 'from-blue-500 to-indigo-600') */
  gradient?: string;
  /** Additional header class names */
  headerClassName?: string;
  /** Children to render when expanded */
  children: ReactNode;
}

/**
 * Reusable collapsible section wrapper with localStorage persistence.
 *
 * Features:
 * - Click header to toggle expand/collapse
 * - Animated chevron icon rotation
 * - Persists collapsed state to localStorage
 * - Optional gradient header styling
 * - Count badge in header
 */
export function CollapsibleSection({
  storageKey,
  title,
  icon,
  iconColor = 'text-gray-600',
  count,
  defaultExpanded = true,
  gradient,
  headerClassName = '',
  children,
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load persisted state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(`dashboard_collapsed_${storageKey}`);
    if (stored !== null) {
      setIsExpanded(stored === 'false' ? false : true);
    }
    setIsHydrated(true);
  }, [storageKey]);

  // Persist state changes to localStorage
  const toggleExpanded = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    localStorage.setItem(`dashboard_collapsed_${storageKey}`, String(newState));
  };

  // Prevent flash of wrong state during hydration
  if (!isHydrated) {
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 animate-pulse bg-gray-100" />
      </div>
    );
  }

  const hasGradient = gradient && gradient.length > 0;

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Collapsible Header */}
      <button
        onClick={toggleExpanded}
        className={`w-full flex items-center justify-between p-4 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${
          hasGradient ? `bg-gradient-to-r ${gradient} text-white hover:opacity-90` : ''
        } ${headerClassName}`}
        aria-expanded={isExpanded}
        aria-controls={`section-${storageKey}`}
      >
        <div className="flex items-center gap-3">
          {/* Chevron Icon */}
          <Icon
            name={isExpanded ? 'expand_more' : 'chevron_right'}
            className={`w-5 h-5 transition-transform duration-200 ${
              hasGradient ? 'text-white' : 'text-gray-500'
            }`}
          />

          {/* Section Icon */}
          {icon && (
            <Icon
              name={icon}
              className={`w-5 h-5 ${hasGradient ? 'text-white' : iconColor}`}
            />
          )}

          {/* Title */}
          <h3 className={`text-lg font-semibold ${hasGradient ? 'text-white' : 'text-gray-900'}`}>
            {title}
          </h3>
        </div>

        {/* Count Badge */}
        {count !== undefined && (
          <span
            className={`px-2.5 py-0.5 rounded-full text-sm font-medium ${
              hasGradient
                ? 'bg-white/20 text-white'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            {count}
          </span>
        )}
      </button>

      {/* Collapsible Content */}
      <div
        id={`section-${storageKey}`}
        className={`transition-all duration-300 ease-in-out ${
          isExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export default CollapsibleSection;
