'use client';

import { useState } from 'react';
import { Icon } from '@/lib/icons';

interface RefreshButtonProps {
  onRefresh: () => Promise<void>;
  label?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  disabled?: boolean;
}

export default function RefreshButton({
  onRefresh,
  label = 'Refresh',
  variant = 'default',
  size = 'md',
  showLabel = true,
  disabled = false,
}: Readonly<RefreshButtonProps>) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (isRefreshing || disabled) return;

    setIsRefreshing(true);
    try {
      await onRefresh();
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  const variantClasses = {
    default: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400',
    outline: 'border border-blue-600 text-blue-600 hover:bg-blue-50 disabled:opacity-50',
    ghost: 'text-blue-600 hover:bg-blue-50 disabled:opacity-50',
  };

  return (
    <button
      onClick={handleRefresh}
      disabled={isRefreshing || disabled}
      className={`
        inline-flex items-center gap-1.5 rounded font-medium transition-colors
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        disabled:cursor-not-allowed
      `}
    >
      <Icon
        name="refresh"
        size={size === 'sm' ? 'xs' : size === 'lg' ? 'lg' : 'sm'}
        className={isRefreshing ? 'animate-spin' : ''}
      />
      {showLabel && <span>{isRefreshing ? 'Refreshing...' : label}</span>}
    </button>
  );
}
