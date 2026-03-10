import type { Metadata } from 'next';
import { ModuleGate } from '@/components/ModuleGate';

export const metadata: Metadata = {
  title: 'Cases',
};

export default function CasesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <ModuleGate moduleId="LEGAL">{children}</ModuleGate>;
}
