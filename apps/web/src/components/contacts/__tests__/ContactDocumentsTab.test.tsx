// @vitest-environment jsdom
/**
 * ContactDocumentsTab tests (IFC-256)
 *
 * Component-level coverage for the Contact 360 Documents tab: real-data render
 * with a link to the document detail page, formatted size/date, and the empty
 * state.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { ContactDocumentsTab } from '../ContactDocumentsTab';
import type { DocumentViewModel } from '../contact-tab-format';

const doc = (overrides: Partial<DocumentViewModel> = {}): DocumentViewModel => ({
  id: 'doc-1',
  name: 'Enterprise License Proposal',
  fileType: 'application/pdf',
  fileSize: 2_400_000,
  category: 'CONTRACT',
  createdAt: '2025-01-09T09:00:00.000Z',
  ...overrides,
});

describe('ContactDocumentsTab', () => {
  it('renders real documents with a formatted date + size and a link to the document', () => {
    render(<ContactDocumentsTab documents={[doc()]} timezone="UTC" />);

    const panel = screen.getByTestId('contact-documents-tab');
    expect(panel).toHaveTextContent('Enterprise License Proposal');
    expect(panel).toHaveTextContent('9 Jan 2025');
    expect(panel).toHaveTextContent('2.3 MB');

    // each row links to the document detail page, where the signed download lives
    const link = screen
      .getAllByRole('link')
      .find((l) => l.getAttribute('href') === '/documents/doc-1');
    expect(link).toBeDefined();
    expect(link).toHaveAttribute('aria-label', 'View Enterprise License Proposal');
    expect(screen.queryByTestId('contact-documents-empty')).not.toBeInTheDocument();
  });

  it('renders an empty state when there are no documents', () => {
    render(<ContactDocumentsTab documents={[]} timezone="UTC" />);
    expect(screen.getByTestId('contact-documents-empty')).toBeInTheDocument();
    expect(screen.queryByText('Enterprise License Proposal')).not.toBeInTheDocument();
  });
});
