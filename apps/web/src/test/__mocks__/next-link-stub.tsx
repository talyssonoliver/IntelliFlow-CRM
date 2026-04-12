import React from 'react';

// Stub for next/link — renders a plain <a> tag for test environments
const Link = ({
  children,
  href,
  ...props
}: Readonly<{
  children: React.ReactNode;
  href: string;
  [key: string]: unknown;
}>) => (
  <a href={href} {...props}>
    {children}
  </a>
);

export default Link;
