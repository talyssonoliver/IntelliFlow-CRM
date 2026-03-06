import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Log In',
  description:
    'Sign in to IntelliFlow CRM. Access your sales pipeline, AI-powered lead scores, and team dashboard. Supports Google, Microsoft, and enterprise SSO.',
  openGraph: {
    title: 'Sign In to IntelliFlow CRM',
    description:
      'Access your IntelliFlow CRM account. AI-powered sales tools, pipeline management, and team collaboration.',
    url: 'https://intelliflow-crm.com/login',
    siteName: 'IntelliFlow CRM',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sign In to IntelliFlow CRM',
    description:
      'Log in to your IntelliFlow CRM. Google SSO, Microsoft SSO, and enterprise SAML supported.',
  },
  alternates: {
    canonical: '/login',
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
