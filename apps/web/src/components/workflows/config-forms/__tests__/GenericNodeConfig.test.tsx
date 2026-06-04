/**
 * GenericNodeConfig Tests — IFC-031
 *
 * Fallback config form for custom / unregistered node types. Exercises:
 *  - empty/absent actionParams renders the informational placeholder row
 *  - params are rendered as labelled editable fields
 *  - editing a field calls update() with the merged actionParams patch
 *  - non-string param values are coerced to strings for display
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GenericNodeConfig } from '../GenericNodeConfig';

describe('GenericNodeConfig', () => {
  describe('empty / absent actionParams', () => {
    it('renders informational message when actionParams is absent', () => {
      const update = vi.fn();
      render(<GenericNodeConfig config={{}} update={update} />);
      expect(screen.getByText(/this node has no configurable parameters/i)).toBeInTheDocument();
    });

    it('renders informational message when actionParams is an empty object', () => {
      const update = vi.fn();
      render(<GenericNodeConfig config={{ actionParams: {} }} update={update} />);
      expect(screen.getByText(/this node has no configurable parameters/i)).toBeInTheDocument();
    });

    it('does NOT call update when actionParams is empty', () => {
      const update = vi.fn();
      render(<GenericNodeConfig config={{}} update={update} />);
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('rendering params as editable fields', () => {
    it('renders a label for each param key', () => {
      const update = vi.fn();
      render(
        <GenericNodeConfig
          config={{ actionParams: { url: 'https://example.com', method: 'POST' } }}
          update={update}
        />
      );
      expect(screen.getByText('url')).toBeInTheDocument();
      expect(screen.getByText('method')).toBeInTheDocument();
    });

    it('renders an input with the param value', () => {
      const update = vi.fn();
      render(
        <GenericNodeConfig
          config={{ actionParams: { endpoint: 'https://api.test/hook' } }}
          update={update}
        />
      );
      // Input is stubbed as a div — query by its placeholder which equals the key
      const input = screen.getByPlaceholderText('endpoint');
      expect(input).toBeInTheDocument();
    });

    it('renders one field per param key', () => {
      const update = vi.fn();
      render(
        <GenericNodeConfig
          config={{ actionParams: { alpha: 'a', beta: 'b', gamma: 'c' } }}
          update={update}
        />
      );
      expect(screen.getByPlaceholderText('alpha')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('beta')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('gamma')).toBeInTheDocument();
    });

    it('coerces numeric param values to string for display', () => {
      const update = vi.fn();
      render(<GenericNodeConfig config={{ actionParams: { retries: 3 } }} update={update} />);
      // value="3" should be set on the input element
      const input = screen.getByPlaceholderText('retries');
      expect((input as HTMLElement).getAttribute('value')).toBe('3');
    });

    it('coerces null-ish param values to empty string', () => {
      const update = vi.fn();
      render(<GenericNodeConfig config={{ actionParams: { optional: null } }} update={update} />);
      const input = screen.getByPlaceholderText('optional');
      expect((input as HTMLElement).getAttribute('value')).toBe('');
    });
  });

  describe('editing a field calls update with merged actionParams', () => {
    it('calls update with patched actionParams when a field changes', () => {
      const update = vi.fn();
      render(<GenericNodeConfig config={{ actionParams: { url: 'old-url' } }} update={update} />);
      const input = screen.getByPlaceholderText('url');
      fireEvent.change(input, { target: { value: 'new-url' } });
      expect(update).toHaveBeenCalledWith({ actionParams: { url: 'new-url' } });
    });

    it('preserves other params when one field is edited', () => {
      const update = vi.fn();
      render(
        <GenericNodeConfig
          config={{ actionParams: { host: 'localhost', port: '8080' } }}
          update={update}
        />
      );
      const hostInput = screen.getByPlaceholderText('host');
      fireEvent.change(hostInput, { target: { value: '10.0.0.1' } });
      expect(update).toHaveBeenCalledWith({
        actionParams: { host: '10.0.0.1', port: '8080' },
      });
    });

    it('calls update once per change event', () => {
      const update = vi.fn();
      render(<GenericNodeConfig config={{ actionParams: { key: 'value' } }} update={update} />);
      const input = screen.getByPlaceholderText('key');
      fireEvent.change(input, { target: { value: 'a' } });
      fireEvent.change(input, { target: { value: 'ab' } });
      expect(update).toHaveBeenCalledTimes(2);
    });

    it('emits empty string when field is cleared', () => {
      const update = vi.fn();
      render(<GenericNodeConfig config={{ actionParams: { token: 'abc123' } }} update={update} />);
      const input = screen.getByPlaceholderText('token');
      fireEvent.change(input, { target: { value: '' } });
      expect(update).toHaveBeenCalledWith({ actionParams: { token: '' } });
    });
  });

  describe('does not render informational message when params exist', () => {
    it('does NOT show no-params message when actionParams is non-empty', () => {
      const update = vi.fn();
      render(<GenericNodeConfig config={{ actionParams: { key: 'val' } }} update={update} />);
      expect(
        screen.queryByText(/this node has no configurable parameters/i)
      ).not.toBeInTheDocument();
    });
  });
});
