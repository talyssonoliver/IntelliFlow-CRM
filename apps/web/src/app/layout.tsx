import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { ThemeProvider } from '@/components/theme-provider';
import { Navigation } from '@/components/navigation';
import { CookieConsentBanner, Toaster } from '@intelliflow/ui';

const inter = Inter({ subsets: ['latin'] });

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
      </head>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>
            <div className="relative min-h-screen bg-background">
              <Navigation />
              <main>{children}</main>
            </div>
            <Toaster />
            <CookieConsentBanner
              privacyPolicyUrl="/privacy"
              cookiePolicyUrl="/cookies"
            />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
