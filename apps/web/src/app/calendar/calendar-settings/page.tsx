import { Suspense } from 'react';
import CalendarSettingsContent from './CalendarSettingsContent';

export default function CalendarSettingsPage() {
  return (
    <Suspense fallback={null}>
      <CalendarSettingsContent />
    </Suspense>
  );
}
