/**
 * Model Configuration Page - PG-199
 *
 * Server Component shell: streams the skeleton immediately, then hydrates
 * ModelConfigContent (client component) via Suspense. Same pattern as the
 * PG-198 approval-policies page.
 */

import { Suspense } from 'react';
import ModelConfigContent from './ModelConfigContent';
import { ModelConfigLoading } from './ModelConfigLoading';

export default function ModelConfigPage() {
  return (
    <Suspense fallback={<ModelConfigLoading />}>
      <ModelConfigContent />
    </Suspense>
  );
}
