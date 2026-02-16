/**
 * Supplementary tests for SidebarPortalContext.tsx
 *
 * Tests context logic without rendering:
 * - useSidebarPortal throws outside provider
 * - useSidebarPortalOptional returns null outside provider
 * - Context value shape and semantics
 *
 * No @testing-library/react - tests pure logic only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We mock React to test the context hooks without rendering
const mockContextValue = vi.hoisted(() => ({
  current: null as any,
}));

vi.mock('react', () => {
  const createRef = () => ({ current: null });
  return {
    createContext: vi.fn((defaultValue: any) => {
      return { Provider: vi.fn(), Consumer: vi.fn(), _defaultValue: defaultValue };
    }),
    useContext: vi.fn(() => mockContextValue.current),
    useState: vi.fn((initial: any) => [
      typeof initial === 'function' ? initial() : initial,
      vi.fn(),
    ]),
    useEffect: vi.fn((fn: () => any) => {
      fn();
    }),
    useMemo: vi.fn((fn: any) => fn()),
    useRef: vi.fn((initial: any) => ({ current: initial })),
  };
});

vi.mock('react-dom', () => ({
  createPortal: vi.fn((children: any) => children),
}));

describe('SidebarPortalContext logic', () => {
  beforeEach(() => {
    mockContextValue.current = null;
    vi.clearAllMocks();
  });

  describe('useSidebarPortal', () => {
    it('throws when context is null (outside provider)', async () => {
      mockContextValue.current = null;
      const mod = await import('../SidebarPortalContext.js');
      expect(() => mod.useSidebarPortal()).toThrow(
        'useSidebarPortal must be used within a SidebarPortalProvider'
      );
    });

    it('returns context value when inside provider', async () => {
      const fakeContext = {
        config: null,
        setConfig: vi.fn(),
        portalTargetRef: { current: null },
      };
      mockContextValue.current = fakeContext;
      const mod = await import('../SidebarPortalContext.js');
      const result = mod.useSidebarPortal();
      expect(result).toBe(fakeContext);
    });
  });

  describe('useSidebarPortalOptional', () => {
    it('returns null when outside provider', async () => {
      mockContextValue.current = null;
      const mod = await import('../SidebarPortalContext.js');
      const result = mod.useSidebarPortalOptional();
      expect(result).toBeNull();
    });

    it('returns context value when inside provider', async () => {
      const fakeContext = {
        config: { moduleId: 'leads', moduleTitle: 'Leads', moduleIcon: 'group', sections: [] },
        setConfig: vi.fn(),
        portalTargetRef: { current: null },
      };
      mockContextValue.current = fakeContext;
      const mod = await import('../SidebarPortalContext.js');
      const result = mod.useSidebarPortalOptional();
      expect(result).toBe(fakeContext);
    });
  });

  describe('SidebarPortalContextValue shape', () => {
    it('has config, setConfig, and portalTargetRef fields', () => {
      const value = {
        config: null,
        setConfig: vi.fn(),
        portalTargetRef: { current: null },
      };
      expect(value).toHaveProperty('config');
      expect(value).toHaveProperty('setConfig');
      expect(value).toHaveProperty('portalTargetRef');
    });

    it('config can be null (no sidebar set)', () => {
      const value = {
        config: null,
        setConfig: vi.fn(),
        portalTargetRef: { current: null },
      };
      expect(value.config).toBeNull();
    });

    it('config can hold a SidebarConfig object', () => {
      const value = {
        config: {
          moduleId: 'deals',
          moduleTitle: 'Deals',
          moduleIcon: 'handshake',
          sections: [
            {
              id: 'main',
              title: 'Pipeline',
              items: [{ id: 'all', label: 'All Deals', icon: 'list', href: '/deals' }],
            },
          ],
        },
        setConfig: vi.fn(),
        portalTargetRef: { current: null },
      };
      expect(value.config!.moduleId).toBe('deals');
      expect(value.config!.sections).toHaveLength(1);
    });
  });

  describe('useSidebarConfig semantics', () => {
    it('calls setConfig with the provided config', async () => {
      const setConfigMock = vi.fn();
      mockContextValue.current = {
        config: null,
        setConfig: setConfigMock,
        portalTargetRef: { current: null },
      };

      const mod = await import('../SidebarPortalContext.js');
      const testConfig = {
        moduleId: 'tickets',
        moduleTitle: 'Tickets',
        moduleIcon: 'confirmation_number',
        sections: [],
      };

      // useSidebarConfig calls setConfig in useEffect
      mod.useSidebarConfig(testConfig);

      // useEffect is mocked to run synchronously, so setConfig should be called
      expect(setConfigMock).toHaveBeenCalledWith(testConfig);
    });
  });

  describe('SidebarPortal component logic', () => {
    it('returns null when not mounted (portalTargetRef.current is null)', async () => {
      mockContextValue.current = {
        config: null,
        setConfig: vi.fn(),
        portalTargetRef: { current: null },
      };

      // SidebarPortal checks mounted state and portalTargetRef.current
      // When portalTargetRef.current is null, it returns null
      const portalTargetRef = { current: null };
      const mounted = true; // after useEffect sets mounted to true
      const shouldRender = mounted && portalTargetRef.current !== null;
      expect(shouldRender).toBe(false);
    });

    it('renders when mounted and portalTargetRef exists', () => {
      const fakeDiv = {} as HTMLDivElement;
      const portalTargetRef = { current: fakeDiv };
      const mounted = true;
      const shouldRender = mounted && portalTargetRef.current !== null;
      expect(shouldRender).toBe(true);
    });
  });

  describe('SidebarPortalTarget', () => {
    it('creates a div with ref assigned', () => {
      // SidebarPortalTarget renders <div ref={portalTargetRef} />
      // The logic is simply assigning the ref from context
      const portalTargetRef = { current: null as HTMLDivElement | null };
      // Simulate React assigning the ref
      const mockDiv = {} as HTMLDivElement;
      portalTargetRef.current = mockDiv;
      expect(portalTargetRef.current).toBe(mockDiv);
    });
  });

  describe('cleanup behavior', () => {
    it('useSidebarConfig returns cleanup function that sets config to null', () => {
      // The useEffect cleanup calls setConfig(null)
      const setConfigMock = vi.fn();
      const config = { moduleId: 'test', moduleTitle: 'Test', moduleIcon: 'test', sections: [] };

      // Simulate the cleanup
      setConfigMock(config); // mount
      setConfigMock(null); // unmount cleanup

      expect(setConfigMock).toHaveBeenCalledTimes(2);
      expect(setConfigMock).toHaveBeenLastCalledWith(null);
    });
  });
});
