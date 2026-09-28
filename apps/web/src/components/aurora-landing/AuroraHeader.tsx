'use client';

import * as React from 'react';
import Link from 'next/link';
import { AuroraLogo } from './AuroraLogo';

const navLinks = [
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

const primaryButton =
  'inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#1570C8] to-[#6D3FE8] font-bold text-white shadow-[0_10px_24px_-10px_rgba(76,63,232,0.7)] transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D3FE8] focus-visible:ring-offset-2';

export function AuroraHeader() {
  const [open, setOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[#E4E6F2] bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-4 sm:px-6 lg:h-[84px]">
        <Link
          href="/preview/aurora"
          aria-label="Aurora home"
          className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D3FE8]"
        >
          <AuroraLogo />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-9 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-base font-medium text-[#0C1238] transition-colors hover:text-[#3438C4]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/login"
            className="inline-flex h-11 items-center px-4 text-base font-semibold text-[#0C1238] hover:text-[#3438C4]"
          >
            Log in
          </Link>
          <Link href="/signup" className={`${primaryButton} h-12 px-6 text-base`}>
            Get started
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-[#0C1238] hover:bg-[#EEF0FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D3FE8] md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="aurora-mobile-menu"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="material-symbols-outlined text-[26px]" aria-hidden="true">
            {open ? 'close' : 'menu'}
          </span>
        </button>
      </div>

      {open && (
        <nav
          id="aurora-mobile-menu"
          aria-label="Mobile"
          className="border-t border-[#E4E6F2] bg-white px-4 pb-6 pt-2 md:hidden"
        >
          <ul className="flex flex-col">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center rounded-lg px-3 text-base font-medium text-[#0C1238] hover:bg-[#EEF0FA]"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-3 border-t border-[#E4E6F2] pt-4">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="inline-flex h-12 items-center justify-center rounded-full border border-[#D6D8F2] text-base font-semibold text-[#0C1238]"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              onClick={() => setOpen(false)}
              className={`${primaryButton} h-12 text-base`}
            >
              Get started
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
