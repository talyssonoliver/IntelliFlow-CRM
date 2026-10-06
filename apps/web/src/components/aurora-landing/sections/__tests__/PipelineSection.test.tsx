/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PipelineSection } from '../PipelineSection';

describe('PipelineSection', () => {
  it('labels the product panel as a sample workspace, in text and in the aria-label', () => {
    render(<PipelineSection />);
    const scene = document.getElementById('board-scene')!;
    expect(scene.getAttribute('aria-label')?.toLowerCase()).toContain('sample workspace');
    expect(scene.querySelector('.sample')?.textContent).toBe('Sample workspace');
  });

  it('renders 7 stage columns, in the real pipeline order', () => {
    render(<PipelineSection />);
    const board = document.getElementById('board')!;
    const cols = [...board.querySelectorAll('.deal-col')];
    expect(cols).toHaveLength(7);
    expect(cols.map((c) => c.getAttribute('data-stage'))).toEqual([
      'new',
      'contacted',
      'qualified',
      'proposal',
      'negotiation',
      'won',
      'lost',
    ]);
    expect(cols.map((c) => c.querySelector('h4')?.childNodes[1]?.textContent)).toEqual([
      'New',
      'Contacted',
      'Qualified',
      'Proposal',
      'Negotiation',
      'Won',
      'Lost',
    ]);
  });

  it('each deal card shows account, deal name, value, close date, a probability bar and a drag handle', () => {
    render(<PipelineSection />);
    const mover = document.getElementById('deal-mover')!;
    expect(mover.querySelector('b')?.textContent).toBe('Contoso');
    expect(mover.querySelector('.deal-name')?.textContent).toBe('Renewal expansion');
    expect(mover.querySelector('.deal-meta')?.textContent).toBe('£41,000 · closes 14 Nov');
    expect(mover.querySelector('.prob i')).not.toBeNull();
    expect(mover.querySelector('.deal-handle')).not.toBeNull();
    expect(mover.querySelector('.who img')).toHaveAttribute(
      'src',
      '/brand/aurora/people/simone-king.webp'
    );
    expect(mover.querySelector('.tag')?.textContent).toContain('No reply in 9 days');
  });

  it('the Qualified column holds the stalled deal that the scene later moves to Proposal', () => {
    render(<PipelineSection />);
    const qualified = document.querySelector('[data-stage="qualified"]')!;
    expect(qualified.querySelector('#deal-mover')).not.toBeNull();
  });

  it('nods to lead scoring with hot/warm/cold tiers and factor bars', () => {
    render(<PipelineSection />);
    const panel = document.getElementById('lead-panel')!;
    const tiers = [...panel.querySelectorAll('.lead-tier')].map((el) => el.textContent);
    expect(tiers).toEqual(['Hot', 'Warm', 'Cold']);
    expect(panel.querySelectorAll('.lead-factor')).toHaveLength(3);
  });

  it('nods to the Forecast view alongside Board and List', () => {
    render(<PipelineSection />);
    const seg = document.querySelector('.seg')!;
    expect(seg.textContent).toContain('List');
    expect(seg.textContent).toContain('Board');
    expect(seg.textContent).toContain('Forecast');
    expect(document.querySelector('.deal-forecast-hint')?.textContent).toMatch(/forecast/i);
  });

  it('gives the mobile snap-scrolling board a visible scroll affordance', () => {
    render(<PipelineSection />);
    expect(document.querySelector('.board-scroll-hint')?.textContent).toMatch(/swipe/i);
  });

  it('uses only sample workspace identities, never a real customer name', () => {
    render(<PipelineSection />);
    for (const name of [
      'Northwind',
      'Fabrikam',
      'Contoso',
      'Adatum',
      'Tailspin',
      'Woodgrove',
      'Litware',
    ]) {
      expect(document.body.textContent).toContain(name);
    }
  });
});
