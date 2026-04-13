import type { Metadata } from 'next';
import { AppointmentsShell } from './appointments-shell';

export const metadata: Metadata = {
  title: 'Appointments',
};

export default function AppointmentsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppointmentsShell>{children}</AppointmentsShell>;
}
