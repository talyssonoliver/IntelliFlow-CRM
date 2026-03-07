'use client';

import { Icon } from '@/lib/icons';

const FEATURE_MATRIX_HTML_PATH = '/feature-matrix.html';

export default function FeatureMatrixPanel() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Feature Matrix</h3>
          <p className="mt-1 text-sm text-gray-600">
            Source-of-truth inventory for feature status, task coverage, and requirement
            traceability.
          </p>
        </div>
        <a
          href={FEATURE_MATRIX_HTML_PATH}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
        >
          <Icon name="open_in_new" size="base" />
          Open full page
        </a>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <iframe
          title="IntelliFlow feature matrix"
          src={FEATURE_MATRIX_HTML_PATH}
          className="h-[78vh] w-full bg-white"
        />
      </div>

      <p className="text-xs text-gray-500">
        Generated from{' '}<code>apps/project-tracker/docs/metrics/_global/Sprint_plan.csv</code>{' '}via{' '}
        <code>tools/scripts/generate-feature-matrix.ps1</code>.
      </p>
    </div>
  );
}
