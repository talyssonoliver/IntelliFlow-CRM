import type { Metadata } from 'next';
import InsightsLayoutShell from './_layout-shell';

export const metadata: Metadata = {
  title: 'AI Insights',
};

export default function InsightsLayout({ children }: { readonly children: React.ReactNode }) {
  return <InsightsLayoutShell>{children}</InsightsLayoutShell>;
}
