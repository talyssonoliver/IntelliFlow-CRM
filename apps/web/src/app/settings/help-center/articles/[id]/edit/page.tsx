import type { Metadata } from 'next';
import { ArticleEditor } from '@/components/support/article-editor';

export const metadata: Metadata = {
  title: 'Edit Help Article — Admin',
  description: 'Edit a help center article for your tenant.',
  robots: { index: false, follow: false },
};

/**
 * Edit help article route (PG-181). The editor logic lives in the co-located
 * client component `ArticleEditor`; this is the thin route shell. The route
 * param is the article id, loaded via `helpArticle.getById`.
 */
export default async function EditHelpArticlePage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <ArticleEditor mode="edit" articleId={id} />;
}
