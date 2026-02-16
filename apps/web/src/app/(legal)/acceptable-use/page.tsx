import { PlaceholderPage } from '@/components/shared/placeholder-page';

export default function AcceptableUsePage() {
  return (
    <PlaceholderPage
      taskId="PG-053"
      title="Acceptable Use Policy"
      description="Guidelines for acceptable use of the IntelliFlow platform."
      group="legal"
      sprint={22}
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Acceptable Use' }]}
    />
  );
}
