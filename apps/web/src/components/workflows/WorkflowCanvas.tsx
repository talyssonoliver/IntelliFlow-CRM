/**
 * WorkflowCanvas — IFC-031
 *
 * SSR-safe wrapper around ReactFlowComponent.
 * Uses next/dynamic with { ssr: false } to prevent server-side rendering
 * of @xyflow/react (which requires browser-only APIs).
 *
 * NF-007: SSR Safety — ReactFlow MUST use dynamic({ ssr: false }).
 * This file MUST NOT import from @xyflow/react directly.
 */

import dynamic from 'next/dynamic';
import type { ReactFlowComponentProps } from './ReactFlowComponent';

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

function CanvasLoading() {
  return (
    <output
      className="flex h-full items-center justify-center bg-muted/20"
      aria-label="Loading canvas"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading canvas…</p>
      </div>
    </output>
  );
}

// ---------------------------------------------------------------------------
// Dynamic import — SSR disabled (NF-007)
// ---------------------------------------------------------------------------

// Dynamic import — these callbacks are not unit-testable (SSR bypass + portal)
/* istanbul ignore next */
const _dynamicImportFn = () =>
  import('./ReactFlowComponent').then(
    /* istanbul ignore next */
    (mod) => ({ default: mod.ReactFlowComponent })
  );

/* istanbul ignore next */
const _loadingFn = () => <CanvasLoading />;

const ReactFlowComponent = dynamic(_dynamicImportFn, {
  ssr: false,
  loading: _loadingFn,
});

// ---------------------------------------------------------------------------
// WorkflowCanvas
// ---------------------------------------------------------------------------

export type WorkflowCanvasProps = ReactFlowComponentProps;

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  if (props.isLoading) {
    return <CanvasLoading />;
  }

  if (props.nodes !== undefined && props.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/20">
        <p className="text-sm text-muted-foreground">
          Drag nodes from the palette to start building
        </p>
      </div>
    );
  }

  return <ReactFlowComponent {...props} />;
}
