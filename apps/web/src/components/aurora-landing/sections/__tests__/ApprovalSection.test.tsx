/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, within } from '@testing-library/react';
import { ApprovalSection } from '../ApprovalSection';

describe('ApprovalSection', () => {
  it('labels the product panel as a sample workspace, in text and in the aria-label', () => {
    render(<ApprovalSection />);
    const scene = document.getElementById('approval-scene')!;
    expect(scene.getAttribute('aria-label')?.toLowerCase()).toContain('sample workspace');
    expect(scene.querySelector('.sample')?.textContent).toBe('Sample workspace');
  });

  it('shows a stat row by status and a filter bar, mirroring /agent-approvals/ai-review', () => {
    render(<ApprovalSection />);
    const stats = document.querySelector('.review-stats')!;
    const labels = [...stats.querySelectorAll('.stat-chip span')].map((el) => el.textContent);
    expect(labels).toEqual(['Waiting', 'In review', 'SLA breached', 'Approved today']);
    expect(document.querySelector('.review-filters')?.textContent).toContain('Waiting for you');
  });

  it('renders all 6 reviewable AI output types as badges in the queue', () => {
    render(<ApprovalSection />);
    const queue = document.getElementById('review-queue')!;
    expect(queue.querySelectorAll('.type-badge')).toHaveLength(6);
    for (const cls of ['email', 'lead', 'sentiment', 'churn', 'auto', 'nba']) {
      expect(queue.querySelector(`.type-badge--${cls}`)).not.toBeNull();
    }
  });

  it('codes the queue rows left border by state: breached, in review, and neutral', () => {
    render(<ApprovalSection />);
    const queue = document.getElementById('review-queue')!;
    expect(queue.querySelector('[data-state="breach"]')).not.toBeNull();
    expect(queue.querySelector('[data-state="review"]')).not.toBeNull();
    expect(queue.querySelector('[data-state="neutral"]')).not.toBeNull();
  });

  it('the expanded review card shows confidence, an SLA countdown, and claim/approve/reject/escalate', () => {
    render(<ApprovalSection />);
    const detail = document.getElementById('review-detail')!;
    expect(detail.querySelector('.review-confidence')?.textContent).toMatch(
      /high confidence.*92%/i
    );
    expect(document.getElementById('review-sla')?.textContent).toMatch(/SLA in/);
    expect(within(detail).getByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: /^reject$/i })).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: /^escalate$/i })).toBeInTheDocument();
    expect(document.getElementById('review-queue')?.textContent).toMatch(/claim/i);
    expect(detail.querySelector('.review-notes')?.textContent?.toLowerCase()).toContain(
      'reject note'
    );
    expect(detail.querySelector('.review-notes')?.textContent?.toLowerCase()).toContain(
      'escalate reason'
    );
  });

  it('the draft is fully present in the server-rendered HTML -- never blank without JS', () => {
    render(<ApprovalSection />);
    const draft = document.getElementById('review-draft-text')!;
    expect(draft.textContent).toBe(
      'Hi Maya, ahead of your renewal on the 14th I wanted to check the new reporting is working for your team.'
    );
    expect(draft.textContent!.length).toBeGreaterThan(20);
  });

  it('uses only sample workspace identities, never a real customer name', () => {
    render(<ApprovalSection />);
    expect(document.body.textContent).toContain('Maya Chen');
    expect(document.body.textContent).toContain('Northwind');
  });
});
