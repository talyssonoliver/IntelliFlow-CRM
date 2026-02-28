import type { Metadata } from 'next';
import CalendarLayoutShell from './_layout-shell';

export const metadata: Metadata = {
  title: 'Calendar',
};

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return <CalendarLayoutShell>{children}</CalendarLayoutShell>;
}
