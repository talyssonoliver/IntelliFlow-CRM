import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  return (
    <div className="container mx-auto px-4 py-12">
      <PlaceholderPage
        taskId="PG-010"
        title="Blog Post"
        description="Individual blog article with rich content."
        group="public"
        sprint={14}
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Blog', href: '/blog' }, { label: 'Article' }]}
      />
    </div>
  );
}
