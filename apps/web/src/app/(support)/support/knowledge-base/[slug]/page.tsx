import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function KnowledgeBaseArticlePage({ params }: { params: { slug: string } }) {
  return (
    <PlaceholderPage
      taskId="PG-048"
      title="Knowledge Base Article"
      description="Help article with step-by-step instructions."
      group="support"
      sprint={20}
      breadcrumbs={[{ label: 'Support', href: '/support/help-center' }, { label: 'Article' }]}
    />
  );
}
