import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Verify Email',
  description:
    'Verify your email address to activate your IntelliFlow CRM account. Check your inbox for the verification link.',
  openGraph: {
    title: 'Verify Your Email — IntelliFlow CRM',
    description:
      'Complete your IntelliFlow CRM registration by verifying your email address. Secure account activation.',
    url: 'https://intelliflow-crm.com/verify-email',
    siteName: 'IntelliFlow CRM',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Verify Your Email — IntelliFlow CRM',
    description:
      'Verify your email to activate your IntelliFlow CRM account. Secure, one-click activation link.',
  },
  alternates: {
    canonical: '/verify-email',
  },
};

export default function VerifyEmailLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
