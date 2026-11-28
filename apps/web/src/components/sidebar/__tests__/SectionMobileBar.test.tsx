// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { render, screen } from '@testing-library/react';
import { SidebarProvider } from '../SidebarContext';
import { SectionMobileBar } from '../SectionMobileBar';

describe('SectionMobileBar (owner 21/11: "The side navigation isn\'t showing here")', () => {
  it('names the section and opens its menu with a 44px button, below lg only', () => {
    render(
      <SidebarProvider>
        <SectionMobileBar title="Leads" />
      </SidebarProvider>
    );
    const bar = screen.getByTestId('section-mobile-bar');
    expect(bar).toHaveClass('lg:hidden');
    expect(bar).toHaveTextContent('Leads');
    expect(screen.getByRole('button', { name: 'Open Leads menu' })).toHaveClass('size-11');
  });
});

/** Every layout file under app/ (layout.tsx and *-shell.tsx). */
function layoutFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : layoutFiles(full);
    return /(^layout|[-_]shell)\.tsx$/.test(name) ? [full] : [];
  });
}

describe('every section with a side rail can open it on a phone', () => {
  const appDir = join(__dirname, '..', '..', '..', 'app');
  const withRail = layoutFiles(appDir).filter((f) =>
    readFileSync(f, 'utf8').includes('<SidebarWithSuspense')
  );

  it('finds the section layouts', () => {
    expect(withRail.length).toBeGreaterThanOrEqual(27);
  });

  it.each(withRail.map((f) => [relative(appDir, f), f]))('%s renders SectionMobileBar', (_, f) => {
    const src = readFileSync(f, 'utf8');
    expect(src).toContain('<SectionMobileBar');
    // No hand-made copies of the bar.
    expect(src).not.toContain('<SidebarTrigger />');
  });
});
