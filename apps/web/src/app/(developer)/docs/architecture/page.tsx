import type { Metadata } from 'next';
import { AdrList } from '@/components/developer/adr-list';
import { getAllADRs, getADRStats } from '@/lib/adr/adr-service';

export const metadata: Metadata = {
  title: 'Architecture | IntelliFlow CRM',
  description:
    'Architecture Decision Records (ADRs) for IntelliFlow CRM — browse decisions on system design, data management, AI integration, and platform infrastructure',
};

export default async function ArchitecturePage() {
  const adrs = getAllADRs();
  const stats = getADRStats();

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-5xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Architecture Documentation</h1>
          <p className="text-muted-foreground mt-1">
            Browse Architecture Decision Records (ADRs) documenting key technical decisions
          </p>
        </div>
        <AdrList adrs={adrs} stats={stats} />
      </div>
    </div>
  );
}
