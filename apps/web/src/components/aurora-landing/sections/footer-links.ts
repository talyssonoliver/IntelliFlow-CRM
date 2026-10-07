/**
 * The header's and footer's links, shared by the landing page and every other
 * public page.
 * Each goes to a page that exists and is open to visitors, or, for `section`
 * links, to a section of the landing page. (The help centre is an in-app
 * module behind a plan gate, so it is not linked from here.)
 */
export interface FooterLink {
  label: string;
  href: string;
  /** A section of the landing page: `#id` on the landing page, `/#id` elsewhere. */
  section?: boolean;
  /** A stable hook for E2E specs that must find this one link. */
  testId?: string;
}

/** The header: the landing's two sections, then every page the old header linked to. */
export const NAV_LINKS: readonly FooterLink[] = [
  { label: 'Platform', href: '#platform', section: true },
  { label: 'AI agents', href: '#agents', section: true },
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Security', href: '/security' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

export const FOOTER_COLUMNS: ReadonlyArray<{ title: string; links: readonly FooterLink[] }> = [
  {
    title: 'Product',
    links: [
      { label: 'Platform', href: '#platform', section: true },
      { label: 'AI agents', href: '#agents', section: true },
      { label: 'Features', href: '/features' },
      // PG-126: the public product tour, replayed even after a visitor has seen it.
      // On the landing's footer by owner decision (2026-10-07).
      { label: 'Take the tour', href: '/features?tour=1', testId: 'tour-trigger-link' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Security', href: '/security' },
      { label: 'Status', href: '/status' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'Blog', href: '/blog' },
      { label: 'Careers', href: '/careers' },
      { label: 'Press', href: '/press' },
      { label: 'Partners', href: '/partners' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy policy', href: '/privacy' },
      { label: 'Terms of service', href: '/terms' },
      { label: 'Cookie policy', href: '/cookies' },
      { label: 'Data processing addendum', href: '/dpa' },
      { label: 'Acceptable use policy', href: '/aup' },
    ],
  },
];

/** The link's address from a page other than the landing page. */
export const hrefFromElsewhere = (link: FooterLink) => (link.section ? `/${link.href}` : link.href);
