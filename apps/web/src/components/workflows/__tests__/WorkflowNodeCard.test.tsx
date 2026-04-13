/**
 * WorkflowNodeCard Component Tests — IFC-031
 *
 * Tests for the custom React Flow node component. Verifies per-type
 * styling, handle placement, and accessible labels.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock @xyflow/react Handle and Position
// ---------------------------------------------------------------------------

vi.mock('@xyflow/react', () => ({
  Handle: ({
    type,
    position,
  }: {
    type: string;
    position: string;
    className?: string;
  }) => <div data-testid={`handle-${type}-${position}`} />,
  Position: {
    Top: 'top',
    Bottom: 'bottom',
    Left: 'left',
    Right: 'right',
  },
  // NodeResizer is rendered when the node is selected; in tests it just
  // mounts a marker div so the size assertions can verify it exists.
  NodeResizer: ({ isVisible }: { isVisible?: boolean }) => (
    <div data-testid="node-resizer" data-visible={isVisible ? 'true' : 'false'} />
  ),
}));

vi.mock('@/lib/workflow-types', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return actual;
});

const { WorkflowNodeCard, workflowNodeTypes } = await import('../WorkflowNodeCard');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderNode(type: string, label = 'Test Node') {
  const props = {
    id: `node-${type}`,
    type,
    data: { label, config: {} },
    position: { x: 0, y: 0 },
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    selected: false,
    isConnectable: true,
    zIndex: 0,
    sourcePosition: undefined,
    targetPosition: undefined,
    dragHandle: undefined,
    parentId: undefined,
    width: undefined,
    height: undefined,
    deletable: undefined,
    selectable: undefined,
    connectable: undefined,
    focusable: undefined,
    measured: undefined,
  };
  return render(<WorkflowNodeCard {...(props as any)} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowNodeCard', () => {
  it.each([
    ['start', 'Start', '▶'],
    ['action', 'Action', '⚡'],
    ['decision', 'Decision', '⑂'],
    ['human', 'Human', '👤'],
    ['end', 'End', '■'],
  ] as const)('renders correct label and emoji for %s node type', (type, expectedLabel, expectedEmoji) => {
    renderNode(type);
    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    expect(screen.getByText(expectedEmoji)).toBeInTheDocument();
  });

  it.each([
    ['start', 'bg-green-100'],
    ['action', 'bg-blue-100'],
    ['decision', 'bg-yellow-100'],
    ['human', 'bg-purple-100'],
    ['end', 'bg-red-100'],
  ] as const)('renders correct color class for %s node type', (type, expectedColor) => {
    const { container } = renderNode(type);
    const card = container.querySelector('[role="figure"]');
    expect(card?.className).toContain(expectedColor);
  });

  it('start node has no incoming Handle (target), has outgoing Handle (source)', () => {
    renderNode('start');
    expect(screen.queryByTestId('handle-target-top')).not.toBeInTheDocument();
    expect(screen.getByTestId('handle-source-bottom')).toBeInTheDocument();
  });

  it('end node has incoming Handle (target), no outgoing Handle (source)', () => {
    renderNode('end');
    expect(screen.getByTestId('handle-target-top')).toBeInTheDocument();
    expect(screen.queryByTestId('handle-source-bottom')).not.toBeInTheDocument();
  });

  it.each(['action', 'decision', 'human'] as const)(
    '%s node has both incoming and outgoing handles',
    (type) => {
      renderNode(type);
      expect(screen.getByTestId('handle-target-top')).toBeInTheDocument();
      expect(screen.getByTestId('handle-source-bottom')).toBeInTheDocument();
    },
  );

  it('aria-label includes node type label and data label', () => {
    renderNode('action', 'Send Email');
    const card = screen.getByRole('figure');
    expect(card).toHaveAttribute('aria-label', 'Action node: Send Email');
  });

  it('renders truncated label text via CSS class', () => {
    renderNode('action', 'A very long workflow node label that should be truncated');
    const label = screen.getByText('A very long workflow node label that should be truncated');
    expect(label.className).toContain('truncate');
  });

  it('falls back to action styling when type is unknown/undefined', () => {
    // Render with undefined type — should default to 'action' config
    const props = {
      id: 'node-unknown',
      type: undefined,
      data: { label: 'Unknown', config: {} },
      position: { x: 0, y: 0 },
      positionAbsoluteX: 0,
      positionAbsoluteY: 0,
      dragging: false,
      selected: false,
      isConnectable: true,
      zIndex: 0,
      sourcePosition: undefined,
      targetPosition: undefined,
      dragHandle: undefined,
      parentId: undefined,
      width: undefined,
      height: undefined,
      deletable: undefined,
      selectable: undefined,
      connectable: undefined,
      focusable: undefined,
      measured: undefined,
    };
     
    const { container } = render(<WorkflowNodeCard {...(props as any)} />);
    const card = container.querySelector('[role="figure"]');
    // Should fall back to action styling
    expect(card?.className).toContain('bg-blue-100');
  });

  it('exports workflowNodeTypes map with all 5 types', () => {
    expect(workflowNodeTypes).toHaveProperty('start');
    expect(workflowNodeTypes).toHaveProperty('action');
    expect(workflowNodeTypes).toHaveProperty('decision');
    expect(workflowNodeTypes).toHaveProperty('human');
    expect(workflowNodeTypes).toHaveProperty('end');
  });
});
