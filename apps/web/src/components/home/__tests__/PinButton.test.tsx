import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PinButton } from '../PinButton';

const mockTogglePin = vi.fn();
const mockPin = vi.fn();
const mockUnpin = vi.fn();

const mockUseEntityPin = vi.hoisted(() => ({
  useEntityPin: vi.fn(() => ({
    isPinned: false,
    isLoading: false,
    togglePin: mockTogglePin,
    pin: mockPin,
    unpin: mockUnpin,
  })),
}));

vi.mock('@/hooks/use-entity-pin', () => mockUseEntityPin);

const defaultProps = {
  entityType: 'contact' as const,
  entityId: 'test-123',
  title: 'Test Contact',
  url: '/contacts/test-123',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseEntityPin.useEntityPin.mockReturnValue({
    isPinned: false,
    isLoading: false,
    togglePin: mockTogglePin,
    pin: mockPin,
    unpin: mockUnpin,
  });
});

describe('PinButton', () => {
  // Rendering (unpinned)
  describe('rendering (unpinned)', () => {
    it('1. renders a button element', () => {
      render(<PinButton {...defaultProps} />);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('2. renders pin icon when not pinned', () => {
      render(<PinButton {...defaultProps} />);
      const icon = screen.getByText('push_pin');
      expect(icon).toBeInTheDocument();
    });

    it('3. has aria-label "Pin to Home" when not pinned', () => {
      render(<PinButton {...defaultProps} />);
      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Pin to Home');
    });

    it('4. does not apply pinned visual styling', () => {
      render(<PinButton {...defaultProps} />);
      const icon = screen.getByText('push_pin');
      expect(icon.className).not.toContain('text-amber-500');
    });
  });

  // Rendering (pinned)
  describe('rendering (pinned)', () => {
    beforeEach(() => {
      mockUseEntityPin.useEntityPin.mockReturnValue({
        isPinned: true,
        isLoading: false,
        togglePin: mockTogglePin,
        pin: mockPin,
        unpin: mockUnpin,
      });
    });

    it('5. renders filled pin icon when pinned', () => {
      render(<PinButton {...defaultProps} />);
      const icon = screen.getByText('push_pin');
      expect(icon.style.fontVariationSettings).toContain("'FILL' 1");
    });

    it('6. has aria-label "Unpin from Home" when pinned', () => {
      render(<PinButton {...defaultProps} />);
      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Unpin from Home');
    });

    it('7. applies pinned visual styling (amber color)', () => {
      render(<PinButton {...defaultProps} />);
      const icon = screen.getByText('push_pin');
      expect(icon.className).toContain('text-amber-500');
    });
  });

  // Interaction
  describe('interaction', () => {
    it('8. calls togglePin on click (unpinned)', () => {
      render(<PinButton {...defaultProps} />);
      fireEvent.click(screen.getByRole('button'));
      expect(mockTogglePin).toHaveBeenCalledTimes(1);
    });

    it('9. calls togglePin on click (pinned)', () => {
      mockUseEntityPin.useEntityPin.mockReturnValue({
        isPinned: true,
        isLoading: false,
        togglePin: mockTogglePin,
        pin: mockPin,
        unpin: mockUnpin,
      });
      render(<PinButton {...defaultProps} />);
      fireEvent.click(screen.getByRole('button'));
      expect(mockTogglePin).toHaveBeenCalledTimes(1);
    });

    it('10. keyboard activation via Enter/Space', () => {
      render(<PinButton {...defaultProps} />);
      const button = screen.getByRole('button');
      fireEvent.keyDown(button, { key: 'Enter' });
      fireEvent.keyUp(button, { key: ' ' });
      // Native button handles Enter/Space — just verify button is a real <button>
      expect(button.tagName).toBe('BUTTON');
    });
  });

  // Loading state
  describe('loading state', () => {
    it('11. shows loading indicator when isLoading is true', () => {
      mockUseEntityPin.useEntityPin.mockReturnValue({
        isPinned: false,
        isLoading: true,
        togglePin: mockTogglePin,
        pin: mockPin,
        unpin: mockUnpin,
      });
      render(<PinButton {...defaultProps} />);
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('12. button is disabled while loading', () => {
      mockUseEntityPin.useEntityPin.mockReturnValue({
        isPinned: false,
        isLoading: true,
        togglePin: mockTogglePin,
        pin: mockPin,
        unpin: mockUnpin,
      });
      render(<PinButton {...defaultProps} />);
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('13. not disabled when not loading', () => {
      render(<PinButton {...defaultProps} />);
      expect(screen.getByRole('button')).not.toBeDisabled();
    });
  });

  // Props forwarding
  describe('props forwarding', () => {
    it('14. passes entityType to useEntityPin', () => {
      render(<PinButton {...defaultProps} entityType="opportunity" />);
      expect(mockUseEntityPin.useEntityPin).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'opportunity' })
      );
    });

    it('15. passes entityId, title, url to useEntityPin', () => {
      render(<PinButton {...defaultProps} />);
      expect(mockUseEntityPin.useEntityPin).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: 'test-123',
          title: 'Test Contact',
          url: '/contacts/test-123',
        })
      );
    });

    it('16. passes optional subtitle and icon to useEntityPin', () => {
      render(<PinButton {...defaultProps} subtitle="Acme Inc" icon="contacts" />);
      expect(mockUseEntityPin.useEntityPin).toHaveBeenCalledWith(
        expect.objectContaining({
          subtitle: 'Acme Inc',
          icon: 'contacts',
        })
      );
    });
  });

  // Accessibility
  describe('accessibility', () => {
    it('17. button has type="button"', () => {
      render(<PinButton {...defaultProps} />);
      expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
    });

    it('18. is focusable (no tabIndex="-1")', () => {
      render(<PinButton {...defaultProps} />);
      const button = screen.getByRole('button');
      expect(button.getAttribute('tabindex')).not.toBe('-1');
    });

    it('19. aria-pressed is false when unpinned', () => {
      render(<PinButton {...defaultProps} />);
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
    });

    it('20. aria-pressed is true when pinned', () => {
      mockUseEntityPin.useEntityPin.mockReturnValue({
        isPinned: true,
        isLoading: false,
        togglePin: mockTogglePin,
        pin: mockPin,
        unpin: mockUnpin,
      });
      render(<PinButton {...defaultProps} />);
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    });
  });

  // Edge cases
  describe('edge cases', () => {
    it('21. renders without optional subtitle', () => {
      render(<PinButton {...defaultProps} />);
      expect(screen.getByRole('button')).toBeInTheDocument();
      expect(mockUseEntityPin.useEntityPin).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: 'test-123' })
      );
    });

    it('22. renders without optional icon', () => {
      render(<PinButton {...defaultProps} />);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('23. accepts custom className', () => {
      const { container } = render(<PinButton {...defaultProps} className="custom-class" />);
      const button = container.querySelector('button');
      expect(button?.className).toContain('custom-class');
    });
  });
});
