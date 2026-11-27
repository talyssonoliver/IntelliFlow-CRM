/**
 * Bring a section of the page into view after the next paint (owner 23/11 on the lead page: "No
 * ops button, why?"). A button that switches a tab can sit far below the tabs on a phone (the
 * sidebar stacks under the content), so switching the tab alone can change nothing on screen.
 * Call this after setting the tab: it waits a frame so the tab has rendered, then scrolls.
 */
export function scrollToSection(id: string): void {
  requestAnimationFrame(() => {
    const section = document.getElementById(id);
    // Not every environment has scrollIntoView (e.g. jsdom); the tab has switched either way.
    if (typeof section?.scrollIntoView === 'function') {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}
