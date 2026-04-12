import type { Metadata } from 'next';
import NotificationsLayoutShell from './_layout-shell';

export const metadata: Metadata = {
  title: 'Notifications',
};

export default function NotificationsLayout({
  children,
}: Readonly<{ readonly children: React.ReactNode }>) {
  return <NotificationsLayoutShell>{children}</NotificationsLayoutShell>;
}
