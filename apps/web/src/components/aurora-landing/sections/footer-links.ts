/**
 * The footer's links, shared by the landing page and every other public page.
 * Each goes to a page that exists and is open to visitors, or, for `section`
 * links, to a section of the landing page.
 */
export interface FooterLink {
  label: string;
  href: string;
  /** A section of the landing page: `#id` on the landing page, `/#id` elsewhere. */
  section?: boolean;
}

export const FOOTER_COLUMNS: ReadonlyArray<{ title: string; links: readonly FooterLink[] }> = [
  {
    title: 'Product',
    links: [
      { label: 'Platform', href: '#platform', section: true },
      { label: 'AI agents', href: '#agents', section: true },
      { label: 'Features', href: '/features' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Security', href: '/security' },
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
    title: 'Resources',
    links: [
      { label: 'Help centre', href: '/help-center' },
      { label: 'Status', href: '/status' },
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
