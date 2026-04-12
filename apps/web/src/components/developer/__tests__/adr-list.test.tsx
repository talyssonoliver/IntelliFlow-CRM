import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdrList } from '../adr-list';
import { developerSidebarConfig } from '../../sidebar/configs/developer';
import type { ADRMetadata } from '@/lib/adr/adr-service';

const mockAdrs: ADRMetadata[] = [
  {
    id: 'ADR-001',
    title: 'Modern AI-First Technology Stack',
    status: 'Accepted',
    date: '2025-12-20',
    deciders: 'CTO, Tech Lead',
    technicalStory: 'IFC-001',
    filePath: 'docs/planning/adr/ADR-001-modern-stack.md',
    relatedADRs: ['ADR-002'],
    sprint: '1',
  },
  {
    id: 'ADR-005',
    title: 'Encryption at Rest',
    status: 'Accepted',
    date: '2025-12-22',
    deciders: 'Security Lead',
    technicalStory: 'IFC-160',
    filePath: 'docs/planning/adr/ADR-005-encryption.md',
    relatedADRs: [],
    sprint: '2',
  },
  {
    id: 'ADR-010',
    title: 'LangChain Agent Framework',
    status: 'Proposed',
    date: '2026-01-05',
    deciders: 'AI Lead',
    technicalStory: 'AI-SETUP-001',
    filePath: 'docs/planning/adr/ADR-010-langchain.md',
    relatedADRs: ['ADR-001'],
    sprint: '3',
  },
  {
    id: 'ADR-015',
    title: 'CI/CD Pipeline Strategy',
    status: 'Accepted',
    date: '2026-01-10',
    deciders: 'DevOps Lead',
    technicalStory: 'ENV-001-AI',
    filePath: 'docs/planning/adr/ADR-015-cicd.md',
    relatedADRs: [],
    sprint: '4',
  },
  {
    id: 'ADR-020',
    title: 'Multi-Tenant Data Isolation',
    status: 'Accepted',
    date: '2026-01-15',
    deciders: 'Architect',
    technicalStory: 'IFC-085',
    filePath: 'docs/planning/adr/ADR-020-tenant-isolation.md',
    relatedADRs: ['ADR-005'],
    sprint: '5',
  },
  {
    id: 'ADR-030',
    title: 'Sprint Scoped Validation',
    status: 'Deprecated',
    date: '2026-02-01',
    deciders: 'Tech Lead',
    technicalStory: 'AUTOMATION-001',
    filePath: 'docs/planning/adr/ADR-030-sprint-validation.md',
    relatedADRs: [],
    sprint: '8',
  },
];

const mockStats = {
  total: 6,
  byStatus: { Accepted: 4, Proposed: 1, Deprecated: 1 },
};

describe('AdrList', () => {
  it('renders all 6 category sections with h2 headings (AC-002)', () => {
    render(<AdrList adrs={mockAdrs} stats={mockStats} />);
    const h2s = screen.getAllByRole('heading', { level: 2 });
    const categoryHeadings = h2s.filter(
      (h) =>
        h.textContent?.includes('Architecture Patterns') ||
        h.textContent?.includes('Data & Security') ||
        h.textContent?.includes('AI & Automation') ||
        h.textContent?.includes('Platform & Infrastructure') ||
        h.textContent?.includes('Domain & Features') ||
        h.textContent?.includes('Process & Tooling')
    );
    expect(categoryHeadings.length).toBe(6);
  });

  it('each category has description text (AC-002)', () => {
    render(<AdrList adrs={mockAdrs} stats={mockStats} />);
    expect(screen.getByText(/Core architecture patterns/i)).toBeInTheDocument();
    expect(screen.getByText(/Data management/i)).toBeInTheDocument();
    expect(screen.getByText(/AI and machine learning/i)).toBeInTheDocument();
  });

  it('category icons have aria-hidden="true" (NF-003)', () => {
    render(<AdrList adrs={mockAdrs} stats={mockStats} />);
    const icons = document.querySelectorAll('.material-symbols-outlined');
    expect(icons.length).toBeGreaterThan(0);
    icons.forEach((icon) => {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('ADR cards display correct ID, title, status badge (AC-003)', () => {
    render(<AdrList adrs={mockAdrs} stats={mockStats} />);
    expect(screen.getByText('ADR-001')).toBeInTheDocument();
    expect(screen.getByText('Modern AI-First Technology Stack')).toBeInTheDocument();
    expect(screen.getByText('ADR-005')).toBeInTheDocument();
    expect(screen.getByText('Encryption at Rest')).toBeInTheDocument();
    // Status badges show text
    const acceptedBadges = screen.getAllByText('Accepted');
    expect(acceptedBadges.length).toBeGreaterThan(0);
    const proposedBadges = screen.getAllByText('Proposed');
    expect(proposedBadges.length).toBeGreaterThan(0);
  });

  it('search input filters ADR list by ID/title/status (AC-004)', async () => {
    render(<AdrList adrs={mockAdrs} stats={mockStats} />);
    const searchInput = screen.getByLabelText('Search architecture decision records');
    await userEvent.type(searchInput, 'encryption');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    expect(screen.getByText('Encryption at Rest')).toBeInTheDocument();
    expect(screen.queryByText('Modern AI-First Technology Stack')).not.toBeInTheDocument();
  });

  it('status filter filters by Accepted/Proposed/All (AC-005)', async () => {
    render(<AdrList adrs={mockAdrs} stats={mockStats} />);
    const statusFilter = screen.getByLabelText(/filter by status/i);
    await userEvent.selectOptions(statusFilter, 'Proposed');

    expect(screen.getByText('LangChain Agent Framework')).toBeInTheDocument();
    expect(screen.queryByText('Modern AI-First Technology Stack')).not.toBeInTheDocument();
  });

  it('aria-live="polite" region announces result count after filtering (AC-010)', async () => {
    render(<AdrList adrs={mockAdrs} stats={mockStats} />);
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();

    const searchInput = screen.getByLabelText('Search architecture decision records');
    await userEvent.type(searchInput, 'encryption');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    expect(liveRegion?.textContent).toMatch(/1.*result/i);
  });

  it('external links have target="_blank", rel="noopener noreferrer", sr-only text (NF-003)', () => {
    render(<AdrList adrs={mockAdrs} stats={mockStats} />);
    const externalLinks = document.querySelectorAll('a[target="_blank"]');
    expect(externalLinks.length).toBeGreaterThan(0);
    externalLinks.forEach((link) => {
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
    const srOnlyTexts = screen.getAllByText('(opens in new tab)');
    expect(srOnlyTexts.length).toBeGreaterThan(0);
    srOnlyTexts.forEach((el) => {
      expect(el.className).toContain('sr-only');
    });
  });

  it('focus-visible:ring-2 on active link cards (NF-003)', () => {
    render(<AdrList adrs={mockAdrs} stats={mockStats} />);
    const links = document.querySelectorAll('a');
    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => {
      expect(link.className).toContain('focus-visible:ring-2');
    });
  });

  it('section aria-labelledby attributes link to h2 ids (NF-003)', () => {
    render(<AdrList adrs={mockAdrs} stats={mockStats} />);
    const sections = document.querySelectorAll('section[aria-labelledby]');
    expect(sections.length).toBe(6);
    sections.forEach((section) => {
      const labelledBy = section.getAttribute('aria-labelledby');
      const h2 = section.querySelector(`#${labelledBy}`);
      expect(h2).toBeInTheDocument();
      expect(h2?.tagName).toBe('H2');
    });
  });

  it('responsive grid: md:grid-cols-2 classes present (NF-004)', () => {
    render(<AdrList adrs={mockAdrs} stats={mockStats} />);
    const grids = document.querySelectorAll('.grid.gap-4');
    expect(grids.length).toBeGreaterThan(0);
    grids.forEach((grid) => {
      expect(grid.className).toContain('md:grid-cols-2');
    });
  });

  it('total ADR card count matches data length (AC-002)', () => {
    render(<AdrList adrs={mockAdrs} stats={mockStats} />);
    // Each ADR should render a card with its ID
    mockAdrs.forEach((adr) => {
      expect(screen.getByText(adr.id)).toBeInTheDocument();
    });
  });

  it('DDD bounded context map section renders with 4 contexts (AC-006)', () => {
    render(<AdrList adrs={mockAdrs} stats={mockStats} />);
    expect(screen.getByText('CRM')).toBeInTheDocument();
    expect(screen.getByText('Intelligence')).toBeInTheDocument();
    expect(screen.getByText('Platform')).toBeInTheDocument();
    expect(screen.getByText('Shared Kernel')).toBeInTheDocument();
  });

  it('statistics summary displays total and status counts (AC-002)', () => {
    render(<AdrList adrs={mockAdrs} stats={mockStats} />);
    expect(screen.getByText(/6 total/i)).toBeInTheDocument();
    expect(screen.getByText(/4.*accepted/i)).toBeInTheDocument();
    expect(screen.getByText(/1.*proposed/i)).toBeInTheDocument();
  });

  it('developer sidebar config contains architecture entry at /docs/architecture (AC-007)', () => {
    const docSection = developerSidebarConfig.sections.find((s) => s.id === 'documentation');
    expect(docSection).toBeDefined();
    const archItem = docSection!.items.find((i) => i.id === 'architecture');
    expect(archItem).toBeDefined();
    expect(archItem!.href).toBe('/docs/architecture');
    expect(archItem!.icon).toBe('architecture');
    expect(archItem!.label).toBe('Architecture');
  });
});
