'use client';

import * as React from 'react';

/**
 * The phone menu: a native <details> sheet that also closes when the visitor
 * taps anywhere outside it, presses Escape, or follows one of its links.
 */
export function NavSheet({ children }: Readonly<{ children: React.ReactNode }>) {
  const ref = React.useRef<HTMLDetailsElement>(null);

  React.useEffect(() => {
    const sheet = ref.current;
    if (!sheet) return;
    const close = () => sheet.removeAttribute('open');
    const onPointer = (e: PointerEvent) => {
      if (sheet.open && !sheet.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sheet.open) {
        close();
        sheet.querySelector('summary')?.focus();
      }
    };
    const onLink = (e: MouseEvent) => {
      if ((e.target as Element).closest('a')) close();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    sheet.addEventListener('click', onLink);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      sheet.removeEventListener('click', onLink);
    };
  }, []);

  return (
    <details className="nav-menu nav-sheet" ref={ref}>
      <summary aria-label="Menu" className="nav-sheet-toggle">
        <span className="material-symbols-outlined nav-sheet-icon" aria-hidden="true">
          menu
        </span>
      </summary>
      <nav aria-label="Mobile" className="nav-sheet-links">
        {children}
      </nav>
    </details>
  );
}
