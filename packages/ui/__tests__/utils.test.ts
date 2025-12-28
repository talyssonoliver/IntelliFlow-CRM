import { describe, it, expect } from 'vitest';
import { cn } from '../src/lib/utils';

describe('cn utility function', () => {
  describe('Basic functionality', () => {
    it('should merge single class name', () => {
      const result = cn('text-red-500');
      expect(result).toBe('text-red-500');
    });

    it('should merge multiple class names', () => {
      const result = cn('text-red-500', 'bg-blue-500', 'p-4');
      expect(result).toContain('text-red-500');
      expect(result).toContain('bg-blue-500');
      expect(result).toContain('p-4');
    });

    it('should handle empty input', () => {
      const result = cn();
      expect(result).toBe('');
    });

    it('should handle empty string', () => {
      const result = cn('');
      expect(result).toBe('');
    });
  });

  describe('Conditional classes', () => {
    it('should handle conditional classes with boolean true', () => {
      const result = cn('base-class', true && 'conditional-class');
      expect(result).toContain('base-class');
      expect(result).toContain('conditional-class');
    });

    it('should handle conditional classes with boolean false', () => {
      const result = cn('base-class', false && 'conditional-class');
      expect(result).toBe('base-class');
      expect(result).not.toContain('conditional-class');
    });

    it('should handle ternary operator', () => {
      const isActive = true;
      const result = cn('base', isActive ? 'active' : 'inactive');
      expect(result).toContain('base');
      expect(result).toContain('active');
      expect(result).not.toContain('inactive');
    });

    it('should handle multiple conditional classes', () => {
      const isActive = true;
      const isDisabled = false;
      const result = cn('base', isActive && 'active', isDisabled && 'disabled');
      expect(result).toContain('base');
      expect(result).toContain('active');
      expect(result).not.toContain('disabled');
    });
  });

  describe('Handling undefined and null', () => {
    it('should handle undefined values', () => {
      const result = cn('text-red-500', undefined, 'bg-blue-500');
      expect(result).toContain('text-red-500');
      expect(result).toContain('bg-blue-500');
    });

    it('should handle null values', () => {
      const result = cn('text-red-500', null, 'bg-blue-500');
      expect(result).toContain('text-red-500');
      expect(result).toContain('bg-blue-500');
    });

    it('should handle mixed undefined, null, and valid classes', () => {
      const result = cn('base', undefined, null, 'valid-class', false && 'not-included');
      expect(result).toContain('base');
      expect(result).toContain('valid-class');
    });

    it('should handle all undefined values', () => {
      const result = cn(undefined, undefined, undefined);
      expect(result).toBe('');
    });

    it('should handle all null values', () => {
      const result = cn(null, null, null);
      expect(result).toBe('');
    });
  });

  describe('Tailwind CSS class merging', () => {
    it('should merge conflicting Tailwind classes (last one wins)', () => {
      const result = cn('text-red-500', 'text-blue-500');
      // tailwind-merge should keep only the last text-color class
      expect(result).toBe('text-blue-500');
      expect(result).not.toContain('text-red-500');
    });

    it('should merge conflicting padding classes', () => {
      const result = cn('p-4', 'p-8');
      expect(result).toBe('p-8');
      expect(result).not.toContain('p-4');
    });

    it('should merge conflicting width classes', () => {
      const result = cn('w-full', 'w-1/2');
      expect(result).toBe('w-1/2');
      expect(result).not.toContain('w-full');
    });

    it('should not merge non-conflicting classes', () => {
      const result = cn('text-red-500', 'bg-blue-500');
      expect(result).toContain('text-red-500');
      expect(result).toContain('bg-blue-500');
    });

    it('should merge complex conflicting classes', () => {
      const result = cn('px-4 py-2', 'px-8');
      expect(result).toContain('px-8');
      expect(result).toContain('py-2');
      expect(result).not.toContain('px-4');
    });

    it('should handle responsive class conflicts', () => {
      const result = cn('md:text-sm', 'md:text-lg');
      expect(result).toBe('md:text-lg');
      expect(result).not.toContain('md:text-sm');
    });

    it('should preserve non-conflicting responsive classes', () => {
      const result = cn('md:text-lg', 'lg:text-xl');
      expect(result).toContain('md:text-lg');
      expect(result).toContain('lg:text-xl');
    });
  });

  describe('Array and object inputs', () => {
    it('should handle array of class names', () => {
      const result = cn(['text-red-500', 'bg-blue-500']);
      expect(result).toContain('text-red-500');
      expect(result).toContain('bg-blue-500');
    });

    it('should handle object with boolean values', () => {
      const result = cn({
        'text-red-500': true,
        'bg-blue-500': false,
        'p-4': true,
      });
      expect(result).toContain('text-red-500');
      expect(result).toContain('p-4');
      expect(result).not.toContain('bg-blue-500');
    });

    it('should handle mixed array and string inputs', () => {
      const result = cn('base-class', ['text-red-500', 'bg-blue-500']);
      expect(result).toContain('base-class');
      expect(result).toContain('text-red-500');
      expect(result).toContain('bg-blue-500');
    });

    it('should handle nested arrays', () => {
      const result = cn('base', ['text-red-500', ['bg-blue-500', 'p-4']]);
      expect(result).toContain('base');
      expect(result).toContain('text-red-500');
      expect(result).toContain('bg-blue-500');
      expect(result).toContain('p-4');
    });
  });

  describe('Real-world component usage', () => {
    it('should handle button variant classes', () => {
      const variant = 'primary';
      const result = cn(
        'base-button',
        variant === 'primary' && 'bg-blue-500 text-white',
        variant === 'secondary' && 'bg-gray-500 text-black'
      );
      expect(result).toContain('base-button');
      expect(result).toContain('bg-blue-500');
      expect(result).toContain('text-white');
      expect(result).not.toContain('bg-gray-500');
    });

    it('should handle input state classes', () => {
      const isError = true;
      const isDisabled = false;
      const result = cn(
        'input-base',
        isError && 'border-red-500',
        isDisabled && 'opacity-50 cursor-not-allowed'
      );
      expect(result).toContain('input-base');
      expect(result).toContain('border-red-500');
      expect(result).not.toContain('opacity-50');
      expect(result).not.toContain('cursor-not-allowed');
    });

    it('should handle className override pattern', () => {
      const baseClasses = 'text-sm p-4 bg-white';
      const customClasses = 'text-lg bg-black';
      const result = cn(baseClasses, customClasses);
      // Custom classes should override base classes
      expect(result).toContain('text-lg');
      expect(result).toContain('bg-black');
      expect(result).toContain('p-4'); // Non-conflicting class preserved
      expect(result).not.toContain('text-sm');
      expect(result).not.toContain('bg-white');
    });

    it('should handle complex component props', () => {
      const size = 'lg';
      const disabled = false;
      const className = 'custom-class';

      const result = cn(
        'base-component',
        size === 'sm' && 'h-8 px-2',
        size === 'md' && 'h-10 px-4',
        size === 'lg' && 'h-12 px-6',
        disabled && 'opacity-50 pointer-events-none',
        className
      );

      expect(result).toContain('base-component');
      expect(result).toContain('h-12');
      expect(result).toContain('px-6');
      expect(result).toContain('custom-class');
      expect(result).not.toContain('h-8');
      expect(result).not.toContain('h-10');
      expect(result).not.toContain('opacity-50');
    });
  });

  describe('Edge cases', () => {
    it('should handle very long class strings', () => {
      const longClasses = 'class1 class2 class3 class4 class5 class6 class7 class8 class9 class10';
      const result = cn(longClasses);
      expect(result).toContain('class1');
      expect(result).toContain('class10');
    });

    it('should handle special characters in class names', () => {
      const result = cn('text-[#ff0000]', 'w-[calc(100%-2rem)]');
      expect(result).toContain('text-[#ff0000]');
      expect(result).toContain('w-[calc(100%-2rem)]');
    });

    it('should handle important modifier', () => {
      const result = cn('text-red-500', '!text-blue-500');
      expect(result).toContain('!text-blue-500');
    });

    it('should handle hover and focus states', () => {
      const result = cn('hover:bg-blue-500', 'focus:ring-2', 'focus-visible:outline-none');
      expect(result).toContain('hover:bg-blue-500');
      expect(result).toContain('focus:ring-2');
      expect(result).toContain('focus-visible:outline-none');
    });

    it('should handle arbitrary values', () => {
      const result = cn('top-[117px]', 'bg-[#1da1f2]');
      expect(result).toContain('top-[117px]');
      expect(result).toContain('bg-[#1da1f2]');
    });
  });
});
