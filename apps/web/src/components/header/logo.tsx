'use client';

import Link from 'next/link';

interface LogoProps {
  collapsed?: boolean;
  href?: string;
}

/**
 * The Aurora brand in the app header: the wave mark, plus the wordmark when
 * there is room. The same two assets as the public site's header. The wordmark
 * is navy, so dark mode turns it white rather than leaving it invisible.
 */
export function Logo({ collapsed = false, href = '/dashboard' }: Readonly<LogoProps>) {
  return (
    <Link href={href} className="flex items-center gap-2" aria-label="Aurora home">
      <img
        src="/brand/aurora/aurora-wave.webp"
        alt=""
        width={42}
        height={16}
        className="h-4 w-auto flex-shrink-0"
      />
      {!collapsed && (
        <img
          src="/brand/aurora/aurora-wordmark.webp"
          alt="Aurora"
          width={83}
          height={18}
          className="hidden h-[18px] w-auto sm:inline dark:brightness-0 dark:invert"
        />
      )}
    </Link>
  );
}
