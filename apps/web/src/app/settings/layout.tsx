import type { Metadata } from 'next';
import SettingsLayoutShell from './_layout-shell';

export const metadata: Metadata = {
  title: 'Settings',
};

export default function SettingsLayout({ children }: { readonly children: React.ReactNode }) {
  return <SettingsLayoutShell>{children}</SettingsLayoutShell>;
}
