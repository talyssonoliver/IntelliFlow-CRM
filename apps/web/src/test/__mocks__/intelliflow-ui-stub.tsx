import React from 'react';

// Stub for @intelliflow/ui — renders simple divs for test environments
export const Card = ({
  children,
  id,
  className,
  ...props
}: Readonly<{
  children?: React.ReactNode;
  id?: string;
  className?: string;
  [key: string]: unknown;
}>) => (
  <div id={id} className={className} data-testid="card" {...props}>
    {children}
  </div>
);

export const Button = ({
  children,
  ...props
}: Readonly<{ children?: React.ReactNode; [key: string]: unknown }>) => (
  <button {...props}>{children}</button>
);

export const Badge = ({
  children,
  ...props
}: Readonly<{ children?: React.ReactNode; [key: string]: unknown }>) => (
  <span data-testid="badge" {...props}>
    {children}
  </span>
);

export default {};
