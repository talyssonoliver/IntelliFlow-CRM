import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function NewDocumentPage() {
  return (
    <PlaceholderPage taskId="PG-099" title="Upload Document" description="Upload and categorize a new document." group="dashboard" sprint={16}
      breadcrumbs={[{ label: 'Documents', href: '/documents' }, { label: 'Upload' }]} />
  );
}
