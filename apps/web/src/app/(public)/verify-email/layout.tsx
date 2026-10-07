import type { Metadata } from 'next';
import { OG_IMAGES } from '@/lib/og-images';

export const metadata: Metadata = {
  title: 'Verify Email',
  description:
    'Verify your email address to activate your Aurora account. Check your inbox for the verification link.',
  openGraph: {
    images: OG_IMAGES,
    title: 'Verify your Aurora email',
    description:
      'Complete your Aurora registration by verifying your email address. Secure account activation.',
    url: 'https://intelliflow-crm.com/verify-email',
    siteName: 'Aurora',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Verify your Aurora email',
    description:
      'Verify your email to activate your Aurora account. Secure, one-click activation link.',
  },
  alternates: {
    canonical: '/verify-email',
  },
};

export default function VerifyEmailLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
