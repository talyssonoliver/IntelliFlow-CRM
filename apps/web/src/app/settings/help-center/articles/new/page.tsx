import type { Metadata } from 'next';
import { ArticleEditor } from '@/components/support/article-editor';

export const metadata: Metadata = {
  title: 'New Help Article — Admin',
  description: 'Create a new help center article for your tenant.',
  robots: { index: false, follow: false },
};

/**
 * New help article route (PG-181). The editor logic lives in the co-located
 * client component `ArticleEditor`; this is the thin route shell.
 */
export default function NewHelpArticlePage() {
  return <ArticleEditor mode="create" />;
}
