import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockOpenAPISpec, mockEmptySpec } from '@/test/fixtures/openapi-data';

// Mock next-themes
const mockUseTheme = vi.fn().mockReturnValue({ resolvedTheme: 'light' });
vi.mock('next-themes', () => ({
  useTheme: () => mockUseTheme(),
}));

// Mock @scalar/api-reference-react
const MockApiReferenceReact = vi.fn(
  ({ configuration }: { configuration: Record<string, unknown> }) => (
    <div data-testid="scalar-reference" data-config={JSON.stringify(configuration)} />
  )
);
vi.mock('@scalar/api-reference-react', () => ({
  ApiReferenceReact: (props: { configuration: Record<string, unknown> }) =>
    MockApiReferenceReact(props),
}));

// Mock the CSS import
vi.mock('@scalar/api-reference-react/style.css', () => ({}));

import { ApiReferenceClient } from '../api-reference-client';

describe('ApiReferenceClient', () => {
  beforeEach(() => {
    mockUseTheme.mockReturnValue({ resolvedTheme: 'light' });
    MockApiReferenceReact.mockImplementation(
      ({ configuration }: { configuration: Record<string, unknown> }) => (
        <div data-testid="scalar-reference" data-config={JSON.stringify(configuration)} />
      )
    );
    vi.stubGlobal('fetch', vi.fn());
  });

  function mockFetchSuccess(data: unknown = mockOpenAPISpec) {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(data),
    });
  }

  function mockFetchError(message = 'Network error') {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error(message));
  }

  function mockFetchNotOk(status = 500, statusText = 'Internal Server Error') {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status,
      statusText,
    });
  }

  // --- Loading State (4 tests) ---

  describe('Loading State', () => {
    it('shows loading indicator on mount before fetch resolves', () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
      render(<ApiReferenceClient specUrl="/api/openapi" />);
      expect(screen.getByText('Loading API documentation...')).toBeInTheDocument();
    });

    it('has aria-busy="true" during loading', () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
      render(<ApiReferenceClient specUrl="/api/openapi" />);
      expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    });

    it('has role="status" on loading container', () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
      render(<ApiReferenceClient specUrl="/api/openapi" />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('shows sr-only loading message "Loading API reference"', () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
      render(<ApiReferenceClient specUrl="/api/openapi" />);
      const srOnly = screen.getByText(/loading api reference/i);
      expect(srOnly).toBeInTheDocument();
    });
  });

  // --- Success State (9 tests) ---

  describe('Success State', () => {
    it('fetches spec from provided specUrl prop', async () => {
      mockFetchSuccess();
      render(<ApiReferenceClient specUrl="/api/openapi" />);
      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          '/api/openapi',
          expect.objectContaining({ signal: expect.any(AbortSignal) })
        );
      });
    });

    it('renders Scalar component with spec data', async () => {
      mockFetchSuccess();
      render(<ApiReferenceClient specUrl="/api/openapi" />);
      await waitFor(() => {
        expect(screen.getByTestId('scalar-reference')).toBeInTheDocument();
      });
    });

    it('passes dark mode flag (isDark=true) when theme is "dark"', async () => {
      mockUseTheme.mockReturnValue({ resolvedTheme: 'dark' });
      mockFetchSuccess();
      render(<ApiReferenceClient specUrl="/api/openapi" />);
      await waitFor(() => {
        const scalar = screen.getByTestId('scalar-reference');
        const config = JSON.parse(scalar.getAttribute('data-config') || '{}');
        expect(config.darkMode).toBe(true);
      });
    });

    it('passes light mode flag (isDark=false) when theme is "light"', async () => {
      mockUseTheme.mockReturnValue({ resolvedTheme: 'light' });
      mockFetchSuccess();
      render(<ApiReferenceClient specUrl="/api/openapi" />);
      await waitFor(() => {
        const scalar = screen.getByTestId('scalar-reference');
        const config = JSON.parse(scalar.getAttribute('data-config') || '{}');
        expect(config.darkMode).toBe(false);
      });
    });

    it('shows sr-only success announcement "API documentation loaded successfully"', async () => {
      mockFetchSuccess();
      render(<ApiReferenceClient specUrl="/api/openapi" />);
      await waitFor(() => {
        expect(screen.getByText('API documentation loaded successfully')).toBeInTheDocument();
      });
    });

    it('configures Scalar with layout: "modern"', async () => {
      mockFetchSuccess();
      render(<ApiReferenceClient specUrl="/api/openapi" />);
      await waitFor(() => {
        const scalar = screen.getByTestId('scalar-reference');
        const config = JSON.parse(scalar.getAttribute('data-config') || '{}');
        expect(config.layout).toBe('modern');
      });
    });

    it('configures Scalar with showSidebar: true', async () => {
      mockFetchSuccess();
      render(<ApiReferenceClient specUrl="/api/openapi" />);
      await waitFor(() => {
        const scalar = screen.getByTestId('scalar-reference');
        const config = JSON.parse(scalar.getAttribute('data-config') || '{}');
        expect(config.showSidebar).toBe(true);
      });
    });

    it('configures Scalar with searchHotKey: "k"', async () => {
      mockFetchSuccess();
      render(<ApiReferenceClient specUrl="/api/openapi" />);
      await waitFor(() => {
        const scalar = screen.getByTestId('scalar-reference');
        const config = JSON.parse(scalar.getAttribute('data-config') || '{}');
        expect(config.searchHotKey).toBe('k');
      });
    });

    it('configures Scalar with defaultHttpClient: { targetKey: "javascript", clientKey: "fetch" }', async () => {
      mockFetchSuccess();
      render(<ApiReferenceClient specUrl="/api/openapi" />);
      await waitFor(() => {
        const scalar = screen.getByTestId('scalar-reference');
        const config = JSON.parse(scalar.getAttribute('data-config') || '{}');
        expect(config.defaultHttpClient).toEqual({
          targetKey: 'javascript',
          clientKey: 'fetch',
        });
      });
    });
  });

  // --- Error State (4 tests) ---

  describe('Error State', () => {
    it('shows error message when fetch fails (network error)', async () => {
      mockFetchError('Network error');
      render(<ApiReferenceClient specUrl="/api/openapi" />);
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });
    });

    it('shows error message when response is not OK (500)', async () => {
      mockFetchNotOk(500, 'Internal Server Error');
      render(<ApiReferenceClient specUrl="/api/openapi" />);
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('has role="alert" on error container', async () => {
      mockFetchError();
      render(<ApiReferenceClient specUrl="/api/openapi" />);
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('shows retry button that reloads page', async () => {
      mockFetchError();
      const reloadMock = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { reload: reloadMock },
        writable: true,
        configurable: true,
      });

      render(<ApiReferenceClient specUrl="/api/openapi" />);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /retry/i }));
      expect(reloadMock).toHaveBeenCalled();
    });
  });

  // --- Edge Cases (3 tests) ---

  describe('Edge Cases', () => {
    it('handles empty spec object gracefully', async () => {
      mockFetchSuccess(mockEmptySpec);
      render(<ApiReferenceClient specUrl="/api/openapi" />);
      await waitFor(() => {
        // Should render scalar even with empty spec
        expect(screen.getByTestId('scalar-reference')).toBeInTheDocument();
      });
    });

    it('ErrorBoundary catches Scalar render errors', async () => {
      MockApiReferenceReact.mockImplementation(() => {
        throw new Error('Scalar crash');
      });

      mockFetchSuccess();
      render(<ApiReferenceClient specUrl="/api/openapi" />);

      await waitFor(() => {
        expect(screen.getByText(/failed to render/i)).toBeInTheDocument();
      });
    });

    it('handles network timeout gracefully (AbortController timeout scenario)', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
        return Promise.reject(new Error('The operation timed out'));
      });

      render(<ApiReferenceClient specUrl="/api/openapi" />);
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText(/timed out/i)).toBeInTheDocument();
      });
    });
  });
});
