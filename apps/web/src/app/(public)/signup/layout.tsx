import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Up',
  description:
    'Create your IntelliFlow CRM account. Start a 14-day free trial with AI-powered lead scoring, pipeline management, and team collaboration tools.',
  openGraph: {
    title: 'Sign Up for IntelliFlow CRM — Free 14-Day Trial',
    description:
      'Get started with AI-powered CRM. Lead scoring, deal tracking, workflow automation, and enterprise-grade security. No credit card required.',
    url: 'https://intelliflow-crm.com/signup',
    siteName: 'IntelliFlow CRM',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sign Up for IntelliFlow CRM — Free 14-Day Trial',
    description:
      'AI-powered CRM with lead scoring, pipeline management, and team collaboration. Start free for 14 days.',
  },
  alternates: {
    canonical: '/signup',
  },
};

export default function SignupLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
