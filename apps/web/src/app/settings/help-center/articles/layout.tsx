import type { ReactNode } from 'react';

export default function HelpArticleAdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <section aria-labelledby="help-articles-heading">{children}</section>;
}
