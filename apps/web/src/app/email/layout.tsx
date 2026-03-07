import type { Metadata } from 'next';
import EmailLayoutShell from './_layout-shell';

export const metadata: Metadata = {
  title: 'Email',
};

export default function EmailLayout({ children }: Readonly<{ readonly children: React.ReactNode }>) {
  return <EmailLayoutShell>{children}</EmailLayoutShell>;
}
