'use client';

import Link from 'next/link';

interface FooterLink {
  label: string;
  href: string;
}

interface FooterSection {
  title: string;
  links: FooterLink[];
}

const footerSections: FooterSection[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '/features' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Security', href: '/security' },
      { label: 'Integrations', href: '/integrations' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'Partners', href: '/partners' },
      { label: 'Press', href: '/press' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Documentation', href: '/docs' },
      { label: 'API Reference', href: '/api-docs' },
      { label: 'Support', href: '/support' },
      { label: 'Status', href: 'https://status.intelliflow.ai' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Cookie Policy', href: '/cookies' },
      { label: 'GDPR', href: '/gdpr' },
    ],
  },
];

const socialLinks = [
  { label: 'Twitter', href: 'https://twitter.com/intelliflow', icon: 'X' },
  { label: 'LinkedIn', href: 'https://linkedin.com/company/intelliflow', icon: 'LinkedIn' },
  { label: 'GitHub', href: 'https://github.com/intelliflow', icon: 'GitHub' },
];

export function PublicFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-card">
      <div className="container px-4 lg:px-6 py-12">
        {/* Main Footer Content */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-8">
          {/* Brand Column */}
          <div className="col-span-2 md:col-span-4 lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded bg-[#137fec] flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-white text-xl">
                  grid_view
                </span>
              </div>
              <span className="text-lg font-bold text-foreground">
                IntelliFlow CRM
              </span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              AI-powered CRM with modern automation and governance-grade validation
            </p>
            {/* Social Links */}
            <div className="flex items-center gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-600 dark:text-slate-400 hover:text-[#137fec] dark:hover:text-[#137fec] transition-colors"
                  aria-label={social.label}
                >
                  <span className="text-sm font-medium">{social.icon}</span>
                </a>
              ))}
            </div>
          </div>

          {/* Link Columns */}
          {footerSections.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold text-foreground mb-4">
                {section.title}
              </h3>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] dark:hover:text-[#137fec] transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-border">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              © {currentYear} IntelliFlow CRM. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <Link
                href="/privacy"
                className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] dark:hover:text-[#137fec] transition-colors"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] dark:hover:text-[#137fec] transition-colors"
              >
                Terms
              </Link>
              <Link
                href="/cookies"
                className="text-sm text-slate-600 dark:text-slate-400 hover:text-[#137fec] dark:hover:text-[#137fec] transition-colors"
              >
                Cookies
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
