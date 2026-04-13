'use client';

import { useParams } from 'next/navigation';
import { CanvasScreen } from '@/components/workflows/CanvasScreen';

export default function EditWorkflowPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : null;

  // If somehow we're here without an id, fall back to "new" semantics so the
  // canvas still renders instead of crashing.
  return <CanvasScreen workflowId={id} />;
}
