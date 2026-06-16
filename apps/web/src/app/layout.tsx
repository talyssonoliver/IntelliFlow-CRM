import type { Metadata, Viewport } from 'next';
import dynamic from 'next/dynamic';
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';
import { GoogleTagManager } from '@next/third-parties/google';
import './globals.css';
import { Providers } from './providers';
import { ThemeProvider } from '@/components/theme-provider';
import { Navigation } from '@/components/navigation';
import { RouteAccessGate } from '@/components/auth/RouteAccessGate';
import { VerifyEmailBanner } from '@/components/auth/VerifyEmailBanner';
import { Toaster } from '@intelliflow/ui';
import { getPrivacyPolicy } from '@/lib/legal/consent-tracker';

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
  themeColor: '#0f172a',
};

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const materialSymbols = localFont({
  src: '../../public/fonts/MaterialSymbolsOutlined.woff2',
  variable: '--font-material-symbols',
  display: 'swap',
  weight: '400',
});

export const metadata: Metadata = {
  title: {
    default: 'IntelliFlow CRM - AI-Powered Customer Relationship Management',
    template: '%s | IntelliFlow CRM',
  },
  description:
    'Transform your sales process with IntelliFlow CRM. AI-powered lead scoring, intelligent pipeline analytics, and automated workflows for modern sales teams.',
  keywords: [
    'CRM',
    'customer relationship management',
    'AI CRM',
    'lead scoring',
    'sales automation',
    'pipeline management',
    'sales analytics',
  ],
  authors: [{ name: 'IntelliFlow Team' }],
  creator: 'IntelliFlow',
  publisher: 'IntelliFlow',
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
    title: 'IntelliFlow CRM - AI-Powered Sales Intelligence',
    description:
      'Close more deals with AI-powered insights. Automated lead scoring, smart contact management, and real-time pipeline analytics.',
    url: 'https://intelliflow-crm.com',
    siteName: 'IntelliFlow CRM',
    locale: 'en_GB',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'IntelliFlow CRM - AI-Powered Sales Intelligence',
    description:
      'Close more deals with AI-powered insights. Automated lead scoring, smart contact management, and real-time pipeline analytics.',
    creator: '@intelliflowcrm',
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
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${materialSymbols.variable}`}>
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
