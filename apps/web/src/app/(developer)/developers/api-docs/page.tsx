import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function ApiDocsPage() {
  return (
    <PlaceholderPage
      taskId="PG-032"
      title="API Documentation"
      description="Interactive API reference with examples and code snippets."
      group="developer"
      sprint={22}
      breadcrumbs={[{ label: 'Developers', href: '/developers/api-docs' }, { label: 'API Docs' }]}
    />
  );
}
