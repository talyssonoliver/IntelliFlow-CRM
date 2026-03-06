import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/developer/adr-list', () => ({
  AdrList: (props: { adrs: unknown[]; stats: unknown }) => (
    <div
      data-testid="adr-list"
      data-adrs={JSON.stringify(props.adrs)}
      data-stats={JSON.stringify(props.stats)}
    >
      ADR List Mock
    </div>
  ),
}));

const mockAdrs = [
  {
    id: 'ADR-001',
    title: 'Test ADR',
    status: 'Accepted',
    date: '2025-12-20',
    deciders: 'CTO',
    technicalStory: 'IFC-001',
    filePath: 'docs/planning/adr/ADR-001.md',
    relatedADRs: [],
    sprint: '1',
  },
];
const mockStats = {
  total: 1,
  byStatus: { Accepted: 1 },
  bySprint: {},
  validationSummary: { total: 0, valid: 0, invalid: 0 },
};

vi.mock('@/lib/adr/adr-service', () => ({
  getAllADRs: vi.fn(() => mockAdrs),
  getADRStats: vi.fn(() => mockStats),
}));

// Import after mocks are set up
import ArchitecturePage, { metadata } from '../page';

describe('ArchitecturePage', () => {
  it('renders h1 heading "Architecture Documentation" (AC-001)', async () => {
    const Page = await ArchitecturePage();
    render(Page);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Architecture Documentation'
    );
  });

  it('renders descriptive subtitle paragraph (AC-001)', async () => {
    const Page = await ArchitecturePage();
    render(Page);
    const description = screen.getByText(/Architecture Decision Records/i);
    expect(description).toBeInTheDocument();
    expect(description.tagName).toBe('P');
  });

  it('renders AdrList component via data-testid mock (AC-002)', async () => {
    const Page = await ArchitecturePage();
    render(Page);
    expect(screen.getByTestId('adr-list')).toBeInTheDocument();
  });

  it('exports metadata.title as "Architecture | IntelliFlow CRM" (AC-001)', () => {
    expect(metadata.title).toBe('Architecture | IntelliFlow CRM');
  });

  it('exports metadata.description containing "Architecture Decision Records" (AC-001)', () => {
    expect(metadata.description).toMatch(/Architecture Decision Records/i);
  });

  it('layout wrapper has "flex flex-col gap-6" classes (NF-004)', async () => {
    const Page = await ArchitecturePage();
    const { container } = render(Page);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain('flex');
    expect(wrapper?.className).toContain('flex-col');
    expect(wrapper?.className).toContain('gap-6');
  });

  it('content constrained within "max-w-5xl" container (NF-004)', async () => {
    const Page = await ArchitecturePage();
    const { container } = render(Page);
    const inner = container.querySelector('.max-w-5xl');
    expect(inner).toBeInTheDocument();
  });

  it('passes adrs and stats props to AdrList (AC-002)', async () => {
    const Page = await ArchitecturePage();
    render(Page);
    const adrList = screen.getByTestId('adr-list');
    const passedAdrs = JSON.parse(adrList.getAttribute('data-adrs') || '[]');
    const passedStats = JSON.parse(adrList.getAttribute('data-stats') || '{}');
    expect(passedAdrs).toEqual(mockAdrs);
    expect(passedStats).toEqual(mockStats);
  });
});
