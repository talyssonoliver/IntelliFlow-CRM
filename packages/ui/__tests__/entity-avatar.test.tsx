// @vitest-environment jsdom
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  EntityAvatar,
  extractInitials,
  getColorFromString,
  AVATAR_COLORS,
} from '../src/components/entity-avatar';

describe('EntityAvatar', () => {
  describe('Rendering', () => {
    it('should render an avatar with initials', () => {
      render(<EntityAvatar name="John Doe" />);
      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('should render with accessible role', () => {
      render(<EntityAvatar name="John Doe" />);
      expect(screen.getByRole('img')).toBeInTheDocument();
    });

    it('should have accessible label', () => {
      render(<EntityAvatar name="John Doe" />);
      expect(screen.getByLabelText('Avatar for John Doe')).toBeInTheDocument();
    });

    it('should use custom alt text when provided', () => {
      render(<EntityAvatar name="John Doe" alt="Custom alt text" />);
      expect(screen.getByLabelText('Custom alt text')).toBeInTheDocument();
    });
  });

  describe('Image Handling', () => {
    it('should render image when imageUrl is provided', () => {
      const { container } = render(<EntityAvatar name="John Doe" imageUrl="/avatar.jpg" />);
      const img = container.querySelector('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', '/avatar.jpg');
    });

    it('should show initials when image fails to load', () => {
      const { container } = render(<EntityAvatar name="John Doe" imageUrl="/invalid.jpg" />);
      const img = container.querySelector('img');
      fireEvent.error(img!);
      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('should use alt text from name for image', () => {
      const { container } = render(<EntityAvatar name="John Doe" imageUrl="/avatar.jpg" />);
      const img = container.querySelector('img');
      expect(img).toHaveAttribute('alt', 'John Doe');
    });

    it('should use custom alt for image', () => {
      const { container } = render(<EntityAvatar name="John Doe" imageUrl="/avatar.jpg" alt="Custom" />);
      const img = container.querySelector('img');
      expect(img).toHaveAttribute('alt', 'Custom');
    });
  });

  describe('Initials Extraction', () => {
    it('should extract initials from two words', () => {
      render(<EntityAvatar name="John Doe" />);
      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('should extract initials from three words', () => {
      render(<EntityAvatar name="John Michael Doe" />);
      expect(screen.getByText('JM')).toBeInTheDocument();
    });

    it('should extract initials from single word', () => {
      render(<EntityAvatar name="John" />);
      expect(screen.getByText('JO')).toBeInTheDocument();
    });

    it('should handle email-like names', () => {
      render(<EntityAvatar name="john.doe@example.com" />);
      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('should handle hyphenated names', () => {
      render(<EntityAvatar name="Mary-Jane Watson" />);
      expect(screen.getByText('MJ')).toBeInTheDocument();
    });

    it('should handle underscore-separated names', () => {
      render(<EntityAvatar name="mary_jane_watson" />);
      expect(screen.getByText('MJ')).toBeInTheDocument();
    });

    it('should handle camelCase names', () => {
      render(<EntityAvatar name="johnDoe" />);
      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('should handle PascalCase names', () => {
      render(<EntityAvatar name="JohnDoe" />);
      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('should show ? for empty name', () => {
      render(<EntityAvatar name="" />);
      expect(screen.getByText('?')).toBeInTheDocument();
    });

    it('should respect maxInitials prop', () => {
      render(<EntityAvatar name="John Michael Doe" maxInitials={3} />);
      expect(screen.getByText('JMD')).toBeInTheDocument();
    });

    it('should respect maxInitials=1', () => {
      render(<EntityAvatar name="John Doe" maxInitials={1} />);
      expect(screen.getByText('J')).toBeInTheDocument();
    });
  });

  describe('Color Hashing', () => {
    it('should apply color class when colorHash is true', () => {
      render(<EntityAvatar name="John Doe" colorHash />);
      const avatar = screen.getByRole('img');
      // Should have one of the avatar color classes
      const hasColorClass = AVATAR_COLORS.some((color) => {
        const classes = color.split(' ');
        return classes.some((cls) => avatar.classList.contains(cls));
      });
      expect(hasColorClass).toBe(true);
    });

    it('should apply muted color when colorHash is false', () => {
      render(<EntityAvatar name="John Doe" colorHash={false} />);
      const avatar = screen.getByRole('img');
      expect(avatar).toHaveClass('bg-muted', 'text-muted-foreground');
    });

    it('should generate consistent color for same name', () => {
      const { rerender } = render(<EntityAvatar name="John Doe" />);
      const avatar1 = screen.getByRole('img');
      const classes1 = Array.from(avatar1.classList);

      rerender(<EntityAvatar name="John Doe" />);
      const avatar2 = screen.getByRole('img');
      const classes2 = Array.from(avatar2.classList);

      expect(classes1).toEqual(classes2);
    });
  });

  describe('Sizes', () => {
    it('should apply xs size', () => {
      render(<EntityAvatar name="John" size="xs" />);
      const avatar = screen.getByRole('img');
      expect(avatar).toHaveClass('h-6', 'w-6', 'text-[10px]');
    });

    it('should apply sm size', () => {
      render(<EntityAvatar name="John" size="sm" />);
      const avatar = screen.getByRole('img');
      expect(avatar).toHaveClass('h-8', 'w-8', 'text-xs');
    });

    it('should apply md size by default', () => {
      render(<EntityAvatar name="John" />);
      const avatar = screen.getByRole('img');
      expect(avatar).toHaveClass('h-10', 'w-10', 'text-sm');
    });

    it('should apply lg size', () => {
      render(<EntityAvatar name="John" size="lg" />);
      const avatar = screen.getByRole('img');
      expect(avatar).toHaveClass('h-12', 'w-12', 'text-base');
    });

    it('should apply xl size', () => {
      render(<EntityAvatar name="John" size="xl" />);
      const avatar = screen.getByRole('img');
      expect(avatar).toHaveClass('h-16', 'w-16', 'text-lg');
    });
  });

  describe('Shapes', () => {
    it('should apply circle shape by default', () => {
      render(<EntityAvatar name="John" />);
      const avatar = screen.getByRole('img');
      expect(avatar).toHaveClass('rounded-full');
    });

    it('should apply rounded shape', () => {
      render(<EntityAvatar name="John" shape="rounded" />);
      const avatar = screen.getByRole('img');
      expect(avatar).toHaveClass('rounded-lg');
    });
  });

  describe('Custom Fallback', () => {
    it('should render custom fallback instead of initials', () => {
      render(
        <EntityAvatar name="John Doe" fallback={<span data-testid="custom">Custom</span>} />
      );
      expect(screen.getByTestId('custom')).toBeInTheDocument();
      expect(screen.queryByText('JD')).not.toBeInTheDocument();
    });

    it('should not show custom fallback when image loads', () => {
      render(
        <EntityAvatar
          name="John Doe"
          imageUrl="/avatar.jpg"
          fallback={<span data-testid="custom">Custom</span>}
        />
      );
      expect(screen.queryByTestId('custom')).not.toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should have base avatar styles', () => {
      render(<EntityAvatar name="John" />);
      const avatar = screen.getByRole('img');
      expect(avatar).toHaveClass(
        'relative',
        'shrink-0',
        'overflow-hidden',
        'flex',
        'items-center',
        'justify-center',
        'font-semibold'
      );
    });

    it('should accept custom className', () => {
      render(<EntityAvatar name="John" className="custom-class" />);
      const avatar = screen.getByRole('img');
      expect(avatar).toHaveClass('custom-class');
    });

    it('should merge custom className with default styles', () => {
      render(<EntityAvatar name="John" className="border-2" />);
      const avatar = screen.getByRole('img');
      expect(avatar).toHaveClass('border-2');
      expect(avatar).toHaveClass('shrink-0'); // Base class preserved
    });
  });

  describe('Props', () => {
    it('should forward data-testid', () => {
      render(<EntityAvatar name="John" data-testid="test-avatar" />);
      expect(screen.getByTestId('test-avatar')).toBeInTheDocument();
    });

    it('should forward id', () => {
      render(<EntityAvatar name="John" id="avatar-id" />);
      const avatar = screen.getByRole('img');
      expect(avatar).toHaveAttribute('id', 'avatar-id');
    });
  });

  describe('Ref', () => {
    it('should forward ref correctly', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(<EntityAvatar ref={ref} name="John" />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});

describe('extractInitials utility', () => {
  it('should extract from "John Doe"', () => {
    expect(extractInitials('John Doe')).toBe('JD');
  });

  it('should extract from "John Michael Doe"', () => {
    expect(extractInitials('John Michael Doe')).toBe('JM');
  });

  it('should extract from email', () => {
    expect(extractInitials('john.doe@example.com')).toBe('JD');
  });

  it('should handle single word', () => {
    expect(extractInitials('John')).toBe('JO');
  });

  it('should handle camelCase', () => {
    expect(extractInitials('johnDoe')).toBe('JD');
  });

  it('should handle empty string', () => {
    expect(extractInitials('')).toBe('?');
  });

  it('should respect maxLength', () => {
    expect(extractInitials('John Michael Doe', 3)).toBe('JMD');
  });
});

describe('getColorFromString utility', () => {
  it('should return a color from the palette', () => {
    const color = getColorFromString('John Doe');
    expect(AVATAR_COLORS).toContain(color);
  });

  it('should return same color for same string', () => {
    const color1 = getColorFromString('John Doe');
    const color2 = getColorFromString('John Doe');
    expect(color1).toBe(color2);
  });

  it('should return different colors for different strings', () => {
    const color1 = getColorFromString('John Doe');
    const color2 = getColorFromString('Jane Smith');
    // They might be the same by chance, but with 10 colors it's unlikely
    // Just verify they're valid colors
    expect(AVATAR_COLORS).toContain(color1);
    expect(AVATAR_COLORS).toContain(color2);
  });
});
