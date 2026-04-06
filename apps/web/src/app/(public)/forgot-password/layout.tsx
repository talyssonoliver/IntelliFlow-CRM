import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Forgot Password',
  description:
    'Reset your IntelliFlow CRM password. Enter your email to receive a secure password reset link valid for one hour.',
  openGraph: {
    title: 'Reset Your IntelliFlow CRM Password',
    description:
      'Forgot your password? Request a secure reset link to regain access to your IntelliFlow CRM account.',
    url: 'https://intelliflow-crm.com/forgot-password',
    siteName: 'IntelliFlow CRM',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Reset Your IntelliFlow CRM Password',
    description:
      'Request a secure password reset link for your IntelliFlow CRM account. Link valid for one hour.',
  },
  alternates: {
    canonical: '/forgot-password',
  },
};

export default function ForgotPasswordLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
