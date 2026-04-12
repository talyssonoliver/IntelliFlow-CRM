/**
 * WorkflowCanvas Component Tests — IFC-031
 *
 * Tests for the SSR-safe canvas wrapper. next/dynamic is mocked so the
 * inner ReactFlowComponent renders synchronously in tests.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock next/dynamic to bypass lazy loading in tests
// ---------------------------------------------------------------------------

const { MockReactFlowComponent } = vi.hoisted(() => {
  const MockReactFlowComponent = vi.fn(
    ({
      nodes,
      onNodeClick,
    }: {
      nodes: Array<{ id: string; type: string; data: unknown }>;
      edges: unknown[];
      onNodeClick?: (id: string) => void;
    }) => (
      <div data-testid="react-flow-mock">
        {nodes.map((n) => (
          <button
            key={n.id}
            data-testid={`node-${n.id}`}
            onClick={() => onNodeClick?.(n.id)}
          >
            {n.id}
          </button>
        ))}
      </div>
    ),
  );
  return { MockReactFlowComponent };
});

vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => MockReactFlowComponent,
}));

import { WorkflowCanvas } from '../WorkflowCanvas';

const sampleNodes = [
  { id: 'n1', type: 'start', data: { label: 'Start', config: {} }, position: { x: 0, y: 0 } },
  { id: 'n2', type: 'end', data: { label: 'End', config: {} }, position: { x: 200, y: 0 } },
];
const sampleEdges = [{ id: 'e1', source: 'n1', target: 'n2' }];

describe('WorkflowCanvas', () => {
  it('renders loading spinner when isLoading prop is true', () => {
    render(
      <WorkflowCanvas
        nodes={[]}
        edges={[]}
        isLoading={true}
        onNodeClick={vi.fn()}
        onNodesChange={vi.fn()}
        onEdgesChange={vi.fn()}
        onConnect={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders empty state placeholder when nodes array is empty', () => {
    render(
      <WorkflowCanvas
        nodes={[]}
        edges={[]}
        isLoading={false}
        onNodeClick={vi.fn()}
        onNodesChange={vi.fn()}
        onEdgesChange={vi.fn()}
        onConnect={vi.fn()}
      />,
    );
    expect(screen.getByText(/drag.*node/i)).toBeInTheDocument();
  });

  it('calls onNodeClick(nodeId) when a rendered node is clicked', () => {
    const onNodeClick = vi.fn();
    render(
      <WorkflowCanvas
        nodes={sampleNodes}
        edges={sampleEdges}
        isLoading={false}
        onNodeClick={onNodeClick}
        onNodesChange={vi.fn()}
        onEdgesChange={vi.fn()}
        onConnect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('node-n1'));
    expect(onNodeClick).toHaveBeenCalledWith('n1');
  });

  it('shows canvas wrapper when nodes and edges are provided', () => {
    render(
      <WorkflowCanvas
        nodes={sampleNodes}
        edges={sampleEdges}
        isLoading={false}
        onNodeClick={vi.fn()}
        onNodesChange={vi.fn()}
        onEdgesChange={vi.fn()}
        onConnect={vi.fn()}
      />,
    );
    expect(screen.getByTestId('react-flow-mock')).toBeInTheDocument();
  });
});
