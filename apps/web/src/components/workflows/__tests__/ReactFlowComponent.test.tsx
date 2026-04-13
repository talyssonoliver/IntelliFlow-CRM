/**
 * ReactFlowComponent Tests — IFC-031
 *
 * Tests for the inner browser-only canvas component. Mocks @xyflow/react,
 * @dnd-kit/core, and all hook dependencies to test hydration, save, and
 * edge remapping logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Shared spies
// ---------------------------------------------------------------------------

const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockUseWorkflowCanvas = vi.fn();
const mockWorkflowQuery = vi.fn();

// ---------------------------------------------------------------------------
// Mock @xyflow/react — render ReactFlow as a simple div
// ---------------------------------------------------------------------------

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({
    children,
    nodes,
    onNodeClick,
    onPaneClick,
  }: {
    children?: React.ReactNode;
    nodes?: Array<{ id: string; type?: string }>;
    edges?: unknown[];
    nodeTypes?: unknown;
    onNodesChange?: unknown;
    onEdgesChange?: unknown;
    onConnect?: unknown;
    onNodeClick?: (event: React.MouseEvent, node: { id: string }) => void;
    onPaneClick?: () => void;
    fitView?: boolean;
    className?: string;
  }) => (
    <div data-testid="react-flow">
      {nodes?.map((n) => (
        <button
          key={n.id}
          data-testid={`rf-node-${n.id}`}
          onClick={(e) => onNodeClick?.(e, n as never)}
        >
          {n.id}
        </button>
      ))}
      <button data-testid="pane" onClick={onPaneClick}>
        pane
      </button>
      {children}
    </div>
  ),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Background: () => <div data-testid="rf-background" />,
  Controls: () => <div data-testid="rf-controls" />,
  MiniMap: () => <div data-testid="rf-minimap" />,
  Panel: ({
    children,
  }: {
    children: React.ReactNode;
    position?: string;
  }) => <div data-testid="rf-panel">{children}</div>,
  useReactFlow: () => ({
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    fitView: vi.fn(),
    screenToFlowPosition: mockScreenToFlowPosition,
  }),
}));

// Hoisted so vi.mock() factory above can reference it without TDZ errors.
// Default implementation = identity transform; tests override per-case.
const { mockScreenToFlowPosition } = vi.hoisted(() => ({
  mockScreenToFlowPosition: vi.fn(
    ({ x, y }: { x: number; y: number }) => ({ x, y })
  ),
}));

// ---------------------------------------------------------------------------
// Mock @dnd-kit/core — capture onDragEnd for testing
// ---------------------------------------------------------------------------

let capturedOnDragEnd: ((event: unknown) => void) | undefined;

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragEnd?: (event: unknown) => void;
    sensors?: unknown;
  }) => {
    capturedOnDragEnd = onDragEnd;
    return <>{children}</>;
  },
  useDroppable: ({ id }: { id: string }) => ({
    setNodeRef: vi.fn(),
    isOver: false,
    node: { current: null },
    over: null,
    active: null,
    rect: { current: null },
    id,
  }),
  // Sensor primitives — exported as noop descriptors for test purposes.
  // Phase H added real PointerSensor + TouchSensor in the production
  // component; these mocks just need to exist so the module loads.
  PointerSensor: function PointerSensor() {},
  TouchSensor: function TouchSensor() {},
  useSensor: () => ({}),
  useSensors: () => [],
}));

// ---------------------------------------------------------------------------
// Mock API
// ---------------------------------------------------------------------------

vi.mock('@/lib/api', () => ({
  api: {
    workflow: {
      getById: {
        useQuery: (...args: unknown[]) => mockWorkflowQuery(...args),
      },
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock hooks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useWorkflowCanvas', () => ({
  useWorkflowCanvas: (...args: unknown[]) => mockUseWorkflowCanvas(...args),
}));

vi.mock('@/hooks/useWorkflowMutations', () => ({
  useWorkflowMutations: () => ({
    createMutation: { mutate: mockCreateMutate, isPending: false },
    updateMutation: { mutate: mockUpdateMutate, isPending: false },
  }),
}));

// ---------------------------------------------------------------------------
// Mock child components
// ---------------------------------------------------------------------------

vi.mock('../WorkflowNodeCard', () => ({
  workflowNodeTypes: {
    start: () => <div>start</div>,
    action: () => <div>action</div>,
    decision: () => <div>decision</div>,
    human: () => <div>human</div>,
    end: () => <div>end</div>,
  },
}));

vi.mock('../NodeConfigPanel', () => ({
  NodeConfigPanel: ({
    onSave,
    onClose,
  }: {
    nodeType: string;
    config: Record<string, unknown>;
    onSave: (config: Record<string, unknown>) => void;
    onClose: () => void;
    open: boolean;
  }) => (
    <div data-testid="node-config-panel">
      <button onClick={() => onSave({ actionType: 'send_notification' })} data-testid="config-save">
        Save Config
      </button>
      <button onClick={onClose} data-testid="config-close">
        Close
      </button>
    </div>
  ),
}));

vi.mock('../NodePalette', () => ({
  NodePalette: () => <div data-testid="node-palette" />,
}));

vi.mock('../WorkflowToolbar', () => ({
  WorkflowToolbar: ({
    onSave,
    isValid,
    isSaving,
  }: {
    onSave: () => void;
    isValid: boolean;
    isSaving: boolean;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
  }) => (
    <div data-testid="workflow-toolbar">
      <button
        onClick={onSave}
        disabled={!isValid || isSaving}
        data-testid="toolbar-save"
      >
        Save
      </button>
    </div>
  ),
}));

vi.mock('@intelliflow/ui', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
  toast: vi.fn(),
}));

vi.mock('@/lib/workflow-types', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return actual;
});

const { ReactFlowComponent } = await import('../ReactFlowComponent');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultCanvasReturn() {
  return {
    nodes: [
      { id: 'node-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start', config: {} } },
      { id: 'node-2', type: 'end', position: { x: 200, y: 0 }, data: { label: 'End', config: {} } },
    ],
    edges: [{ id: 'e1', source: 'node-1', target: 'node-2' }],
    onNodesChange: vi.fn(),
    onEdgesChange: vi.fn(),
    onConnect: vi.fn(),
    addNode: vi.fn(),
    removeNode: vi.fn(),
    updateNodeConfig: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    isValid: true,
    validationErrors: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReactFlowComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkflowQuery.mockReturnValue({ data: undefined, isLoading: false });
    mockUseWorkflowCanvas.mockReturnValue(defaultCanvasReturn());
  });

  it('hydrates nodes from envelope format { nodes, edges }', () => {
    mockWorkflowQuery.mockReturnValue({
      data: {
        steps: {
          nodes: [
            { id: 1, type: 'start', config: {}, position: { x: 10, y: 20 } },
            { id: 2, type: 'end', config: {}, position: { x: 300, y: 20 } },
          ],
          edges: [{ id: 'e1', source: 'node-1', target: 'node-2' }],
        },
      },
      isLoading: false,
    });

    render(<ReactFlowComponent workflowId="wf-1" />);

    // useWorkflowCanvas receives hydrated nodes
    const callArgs = mockUseWorkflowCanvas.mock.calls[0];
    const hydratedNodes = callArgs[0];
    expect(hydratedNodes).toHaveLength(2);
    expect(hydratedNodes[0].id).toBe('node-1');
    expect(hydratedNodes[0].position).toEqual({ x: 10, y: 20 });
  });

  it('hydrates nodes from legacy flat array (no edges)', () => {
    mockWorkflowQuery.mockReturnValue({
      data: {
        steps: [
          { id: 1, type: 'start', config: {} },
          { id: 2, type: 'action', config: {} },
        ],
      },
      isLoading: false,
    });

    render(<ReactFlowComponent workflowId="wf-1" />);

    const callArgs = mockUseWorkflowCanvas.mock.calls[0];
    const hydratedNodes = callArgs[0];
    const hydratedEdges = callArgs[1];
    expect(hydratedNodes).toHaveLength(2);
    // Legacy format gets fallback positions
    expect(hydratedNodes[1].position).toEqual({ x: 250, y: 200 });
    // No edges in legacy format
    expect(hydratedEdges).toEqual([]);
  });

  it('renders empty canvas with guidance when no steps exist', () => {
    mockWorkflowQuery.mockReturnValue({
      data: { steps: undefined },
      isLoading: false,
    });
    const canvas = defaultCanvasReturn();
    canvas.nodes = [];
    mockUseWorkflowCanvas.mockReturnValue(canvas);

    render(<ReactFlowComponent />);

    expect(screen.getByText(/drag.*node/i)).toBeInTheDocument();
  });

  it('save on new workflow calls createMutation with sequential IDs and remapped edges', async () => {
    const canvas = defaultCanvasReturn();
    canvas.nodes = [
      { id: 'node-1700000001', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start', config: {} } },
      { id: 'node-1700000002', type: 'end', position: { x: 200, y: 0 }, data: { label: 'End', config: {} } },
    ];
    canvas.edges = [{ id: 'e1', source: 'node-1700000001', target: 'node-1700000002' }];
    mockUseWorkflowCanvas.mockReturnValue(canvas);

    render(<ReactFlowComponent />);

    fireEvent.click(screen.getByTestId('toolbar-save'));

    await waitFor(() => {
      expect(mockCreateMutate).toHaveBeenCalledOnce();
      const payload = mockCreateMutate.mock.calls[0][0];
      // Steps have sequential IDs
      expect(payload.steps[0].id).toBe(1);
      expect(payload.steps[1].id).toBe(2);
      // Edges are remapped from canvas IDs to node-{stepId}
      expect(payload.edges[0].source).toBe('node-1');
      expect(payload.edges[0].target).toBe('node-2');
    });
  });

  it('save on existing workflow calls updateMutation with workflowId', async () => {
    mockWorkflowQuery.mockReturnValue({
      data: { steps: { nodes: [], edges: [] } },
      isLoading: false,
    });

    render(<ReactFlowComponent workflowId="wf-42" />);

    fireEvent.click(screen.getByTestId('toolbar-save'));

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledOnce();
      expect(mockUpdateMutate.mock.calls[0][0].id).toBe('wf-42');
    });
  });

  it('clicking a node opens NodeConfigPanel', () => {
    render(<ReactFlowComponent />);

    // Config panel should not be visible initially
    expect(screen.queryByTestId('node-config-panel')).not.toBeInTheDocument();

    // Click a node
    fireEvent.click(screen.getByTestId('rf-node-node-1'));

    // Config panel should now be visible
    expect(screen.getByTestId('node-config-panel')).toBeInTheDocument();
  });

  it('shows loading spinner when workflowId is set and query is loading', () => {
    mockWorkflowQuery.mockReturnValue({ data: undefined, isLoading: true });

    render(<ReactFlowComponent workflowId="wf-1" />);

    expect(screen.getByText(/loading workflow/i)).toBeInTheDocument();
    expect(screen.queryByTestId('react-flow')).not.toBeInTheDocument();
  });

  it('saving node config calls updateNodeConfig and closes panel', () => {
    const canvas = defaultCanvasReturn();
    mockUseWorkflowCanvas.mockReturnValue(canvas);

    render(<ReactFlowComponent />);

    // Click a node to open config panel
    fireEvent.click(screen.getByTestId('rf-node-node-1'));
    expect(screen.getByTestId('node-config-panel')).toBeInTheDocument();

    // Save config
    fireEvent.click(screen.getByTestId('config-save'));

    // updateNodeConfig should be called
    expect(canvas.updateNodeConfig).toHaveBeenCalledWith('node-1', { actionType: 'send_notification' });

    // Panel should close
    expect(screen.queryByTestId('node-config-panel')).not.toBeInTheDocument();
  });

  it('closing config panel deselects node', () => {
    render(<ReactFlowComponent />);

    // Open panel
    fireEvent.click(screen.getByTestId('rf-node-node-1'));
    expect(screen.getByTestId('node-config-panel')).toBeInTheDocument();

    // Close it
    fireEvent.click(screen.getByTestId('config-close'));

    expect(screen.queryByTestId('node-config-panel')).not.toBeInTheDocument();
  });

  it('clicking pane deselects node and closes config panel', () => {
    render(<ReactFlowComponent />);

    // Open panel
    fireEvent.click(screen.getByTestId('rf-node-node-1'));
    expect(screen.getByTestId('node-config-panel')).toBeInTheDocument();

    // Click pane (background)
    fireEvent.click(screen.getByTestId('pane'));

    expect(screen.queryByTestId('node-config-panel')).not.toBeInTheDocument();
  });

  it('uses externalNodes/externalEdges when provided', () => {
    const externalNodes = [
      { id: 'ext-1', type: 'start', position: { x: 0, y: 0 }, data: { label: 'External Start', config: {} } },
    ];
    const externalEdges = [{ id: 'ext-e1', source: 'ext-1', target: 'ext-2' }];

    render(
      <ReactFlowComponent
        nodes={externalNodes as never}
        edges={externalEdges as never}
      />,
    );

    // useWorkflowCanvas should receive the external nodes/edges
    const callArgs = mockUseWorkflowCanvas.mock.calls[0];
    expect(callArgs[0]).toBe(externalNodes);
    expect(callArgs[1]).toBe(externalEdges);
  });

  it('DnD drag end adds a node via canvas.addNode', () => {
    const canvas = defaultCanvasReturn();
    mockUseWorkflowCanvas.mockReturnValue(canvas);

    render(<ReactFlowComponent />);

    // Simulate a drag-end event with a valid nodeType
    act(() => {
      capturedOnDragEnd?.({
        active: { data: { current: { nodeType: 'action' } } },
        over: { id: 'canvas-drop-zone' },
        delta: { x: 0, y: 0 },
        activatorEvent: undefined,
      });
    });

    // canvas.addNode should be called with fallback position
    expect(canvas.addNode).toHaveBeenCalledWith('action', expect.objectContaining({ x: 250 }));
  });

  it('DnD drag end with activatorEvent calculates position from coordinates', () => {
    const canvas = defaultCanvasReturn();
    mockUseWorkflowCanvas.mockReturnValue(canvas);

    render(<ReactFlowComponent />);

    act(() => {
      capturedOnDragEnd?.({
        active: { data: { current: { nodeType: 'action' } } },
        over: { id: 'canvas-drop-zone' },
        delta: { x: 10, y: 20 },
        activatorEvent: { clientX: 100, clientY: 200 },
      });
    });

    expect(canvas.addNode).toHaveBeenCalledWith('action', expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
  });

  it('DnD drag end does nothing when over is null', () => {
    const canvas = defaultCanvasReturn();
    mockUseWorkflowCanvas.mockReturnValue(canvas);

    render(<ReactFlowComponent />);

    act(() => {
      capturedOnDragEnd?.({
        active: { data: { current: { nodeType: 'action' } } },
        over: null,
        delta: { x: 0, y: 0 },
        activatorEvent: undefined,
      });
    });

    expect(canvas.addNode).not.toHaveBeenCalled();
  });

  it('DnD drag end does nothing when nodeType is missing', () => {
    const canvas = defaultCanvasReturn();
    mockUseWorkflowCanvas.mockReturnValue(canvas);

    render(<ReactFlowComponent />);

    act(() => {
      capturedOnDragEnd?.({
        active: { data: { current: {} } },
        over: { id: 'canvas-drop-zone' },
        delta: { x: 0, y: 0 },
        activatorEvent: undefined,
      });
    });

    expect(canvas.addNode).not.toHaveBeenCalled();
  });

  it('calls externalOnSave when provided instead of mutations', async () => {
    const externalOnSave = vi.fn();
    render(<ReactFlowComponent onSave={externalOnSave} />);

    fireEvent.click(screen.getByTestId('toolbar-save'));

    await waitFor(() => {
      expect(externalOnSave).toHaveBeenCalledOnce();
      expect(mockCreateMutate).not.toHaveBeenCalled();
      expect(mockUpdateMutate).not.toHaveBeenCalled();
    });
  });

  it('WorkflowCanvas.tsx does NOT import from @xyflow/react (SSR invariant)', () => {
    const canvasSource = readFileSync(
      resolve(__dirname, '../WorkflowCanvas.tsx'),
      'utf-8',
    );
    // WorkflowCanvas must NOT have direct @xyflow/react imports
    expect(canvasSource).not.toMatch(/from ['"]@xyflow\/react['"]/);
  });

  // -------------------------------------------------------------------------
  // C.1 — DnD must use screenToFlowPosition so drops land at the pointer
  //       after the ReactFlow viewport has been panned/zoomed. Raw
  //       container coords produce a drop at the wrong canvas coordinate.
  // -------------------------------------------------------------------------

  it('drag-end invokes addNode with screenToFlowPosition output (identity transform)', () => {
    mockScreenToFlowPosition.mockImplementation(({ x, y }) => ({ x, y }));
    const canvas = defaultCanvasReturn();
    mockUseWorkflowCanvas.mockReturnValue(canvas);

    render(<ReactFlowComponent />);

    // Simulate a drop at screen coord (500, 300) with zero delta.
    act(() => {
      capturedOnDragEnd?.({
        active: { data: { current: { nodeType: 'action' } } },
        over: { id: 'canvas-drop-zone' },
        delta: { x: 0, y: 0 },
        activatorEvent: { clientX: 500, clientY: 300 },
      });
    });

    expect(mockScreenToFlowPosition).toHaveBeenCalledWith({ x: 500, y: 300 });
    expect(canvas.addNode).toHaveBeenCalledWith('action', { x: 500, y: 300 });
  });

  it('drag-end with pan/zoom maps screen coords through screenToFlowPosition', () => {
    // Mimic a ReactFlow viewport of translate(600, -69) scale(1.14).
    // Input screen (500, 300) → flow ((500-600)/1.14, (300+69)/1.14)
    mockScreenToFlowPosition.mockImplementation(({ x, y }) => ({
      x: (x - 600) / 1.14,
      y: (y + 69) / 1.14,
    }));
    const canvas = defaultCanvasReturn();
    mockUseWorkflowCanvas.mockReturnValue(canvas);

    render(<ReactFlowComponent />);

    act(() => {
      capturedOnDragEnd?.({
        active: { data: { current: { nodeType: 'start' } } },
        over: { id: 'canvas-drop-zone' },
        delta: { x: 0, y: 0 },
        activatorEvent: { clientX: 500, clientY: 300 },
      });
    });

    expect(mockScreenToFlowPosition).toHaveBeenCalledWith({ x: 500, y: 300 });
    const call = (canvas.addNode as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('start');
    expect(call[1].x).toBeCloseTo((500 - 600) / 1.14, 3);
    expect(call[1].y).toBeCloseTo((300 + 69) / 1.14, 3);
  });

  it('drag-end includes delta in the screen coord passed to screenToFlowPosition', () => {
    mockScreenToFlowPosition.mockImplementation(({ x, y }) => ({ x, y }));
    const canvas = defaultCanvasReturn();
    mockUseWorkflowCanvas.mockReturnValue(canvas);

    render(<ReactFlowComponent />);

    // Activator was at (100, 100); delta was (+40, +25); drop = (140, 125)
    act(() => {
      capturedOnDragEnd?.({
        active: { data: { current: { nodeType: 'decision' } } },
        over: { id: 'canvas-drop-zone' },
        delta: { x: 40, y: 25 },
        activatorEvent: { clientX: 100, clientY: 100 },
      });
    });

    expect(mockScreenToFlowPosition).toHaveBeenCalledWith({ x: 140, y: 125 });
  });
});
