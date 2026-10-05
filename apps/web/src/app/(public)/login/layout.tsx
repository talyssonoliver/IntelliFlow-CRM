import type { Metadata } from 'next';
import { OG_IMAGES } from '@/lib/og-images';

export const metadata: Metadata = {
  title: 'Log In',
  description:
    'Sign in to Aurora. Access your sales pipeline, AI-powered lead scores, and team dashboard. Supports Google, Microsoft, and enterprise SSO.',
  openGraph: {
    images: OG_IMAGES,
    title: 'Sign In to Aurora',
    description:
      'Access your Aurora account. AI-powered sales tools, pipeline management, and team collaboration.',
    url: 'https://intelliflow-crm.com/login',
    siteName: 'Aurora',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sign In to Aurora',
    description: 'Log in to your Aurora. Google SSO, Microsoft SSO, and enterprise SAML supported.',
  },
  alternates: {
    canonical: '/login',
  },
};

export default function LoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
