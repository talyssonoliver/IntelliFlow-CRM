import type { Metadata, Viewport } from 'next';
import dynamic from 'next/dynamic';
import { Inter } from 'next/font/google';
import { GoogleTagManager } from '@next/third-parties/google';
import './globals.css';
import { Providers } from './providers';
import { ThemeProvider } from '@/components/theme-provider';
import { Navigation } from '@/components/navigation';
import { RouteAccessGate } from '@/components/auth/RouteAccessGate';
import { VerifyEmailBanner } from '@/components/auth/VerifyEmailBanner';
// Client-only lazy wrapper — keeps OnboardingWelcome's @stripe/* imports out of
// the universal layout compile graph (every route). See the wrapper's JSDoc.
import { OnboardingWelcome } from '@/components/onboarding/OnboardingWelcomeClient';
import { Toaster } from '@intelliflow/ui';
import { getPrivacyPolicy } from '@/lib/legal/consent-tracker';
import { FONTS_READY_SCRIPT, MATERIAL_SYMBOLS_FONT_URL } from '@/lib/fonts-ready';

// Lazy-load CookieConsentBanner — it ships with every page via the root
// layout but is only interacted with once per visitor. Defer to keep it out
// of the initial bundle (addresses Lighthouse #84 script-bundle audit).
// ssr: true is the default; we just want it chunked for the client.
const CookieConsentBanner = dynamic(
  () => import('@intelliflow/ui').then((mod) => ({ default: mod.CookieConsentBanner })),
  { ssr: true }
);

// Explicit viewport — fixes Lighthouse `meta-viewport` audit (was failing
// because the implicit Next.js default was being interpreted as restrictive).
// userScalable: true and maximumScale ≥ 5 satisfy WCAG 1.4.4 (Resize Text).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#11175B',
};

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

// Material Symbols is self-hosted through a hand-written @font-face in
// globals.css (family 'Material Symbols Outlined', font-display: block), preloaded
// below and gated by the fonts-ready script. See src/lib/fonts-ready.ts and
// apps/project-tracker/docs/metrics/_global/fix-material-icons.md.

export const metadata: Metadata = {
  title: {
    default: 'Aurora, the AI CRM that asks before it acts',
    template: '%s | Aurora',
  },
  description:
    'Aurora scores your leads, keeps your pipeline current and drafts the next follow-up. Every AI action waits for a person to say yes.',
  keywords: [
    'CRM',
    'customer relationship management',
    'AI CRM',
    'lead scoring',
    'sales automation',
    'pipeline management',
    'human approval',
  ],
  applicationName: 'Aurora',
  authors: [{ name: 'Aurora' }],
  creator: 'Aurora',
  publisher: 'Aurora',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL('https://intelliflow-crm.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Aurora, the AI CRM that asks before it acts',
    description:
      'Lead scoring, pipeline and follow-ups drafted by AI agents, with every action waiting for your yes.',
    url: 'https://intelliflow-crm.com',
    siteName: 'Aurora',
    locale: 'en_GB',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aurora, the AI CRM that asks before it acts',
    description:
      'Lead scoring, pipeline and follow-ups drafted by AI agents, with every action waiting for your yes.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookiePolicyVersion = getPrivacyPolicy().metadata.version;

  return (
    // Inter's variable goes on <html>, not <body>: globals.css's `@theme inline`
    // puts var(--font-inter) straight into Tailwind's base `html { font-family }`,
    // which is resolved on <html>. Defined only on <body>, it was unset there, so
    // the whole app fell back to the system font (DejaVu Sans on Linux).
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href={MATERIAL_SYMBOLS_FONT_URL}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* Allowed by the CSP via its sha256 hash (proxy.ts), not a nonce. */}
        <script dangerouslySetInnerHTML={{ __html: FONTS_READY_SCRIPT }} />
        {/* Without JS the gate never opens; show icons (font-display: block still applies). */}
        <noscript>
          <style>{'.material-symbols-outlined{visibility:inherit}'}</style>
        </noscript>
      </head>
      <body>
        {process.env.NEXT_PUBLIC_GTM_ID && (
          <GoogleTagManager gtmId={process.env.NEXT_PUBLIC_GTM_ID} />
        )}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>
            <div className="relative min-h-screen bg-background">
              <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium"
              >
                Skip to main content
              </a>
              <Navigation />
              <VerifyEmailBanner />
              <OnboardingWelcome />
              <RouteAccessGate>
                <div id="main-content">{children}</div>
              </RouteAccessGate>
            </div>
            <Toaster />
            <CookieConsentBanner
              privacyPolicyUrl="/privacy"
              cookiePolicyUrl="/cookies"
              policyVersion={cookiePolicyVersion}
            />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
