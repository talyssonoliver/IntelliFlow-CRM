// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { SearchInput } from '../src/components/search-input';

describe('SearchInput', () => {
  describe('Rendering', () => {
    it('should render a search input element', () => {
      render(<SearchInput />);
      const input = screen.getByRole('searchbox');
      expect(input).toBeInTheDocument();
    });

    it('should render with placeholder', () => {
      render(<SearchInput placeholder="Search leads..." />);
      const input = screen.getByPlaceholderText('Search leads...');
      expect(input).toBeInTheDocument();
    });

    it('should render with value', () => {
      render(<SearchInput value="test query" onChange={() => {}} />);
      const input = screen.getByRole('searchbox') as HTMLInputElement;
      expect(input.value).toBe('test query');
    });

    it('should have search role wrapper', () => {
      render(<SearchInput />);
      const wrapper = screen.getByRole('search');
      expect(wrapper).toBeInTheDocument();
    });
  });

  describe('Search Icon', () => {
    it('should render default search icon', () => {
      render(<SearchInput />);
      const icon = screen.getByText('search');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveClass('material-symbols-outlined');
    });

    it('should render custom icon when specified', () => {
      render(<SearchInput icon="filter_list" />);
      const icon = screen.getByText('filter_list');
      expect(icon).toBeInTheDocument();
    });

    it('should have aria-hidden on icon', () => {
      render(<SearchInput />);
      const iconWrapper = screen.getByText('search').parentElement;
      expect(iconWrapper).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('Loading State', () => {
    it('should show loading spinner when isLoading is true', () => {
      render(<SearchInput isLoading />);
      const loadingIcon = screen.getByText('progress_activity');
      expect(loadingIcon).toBeInTheDocument();
    });

    it('should hide search icon when loading', () => {
      render(<SearchInput isLoading />);
      expect(screen.queryByText('search')).not.toBeInTheDocument();
    });

    it('should disable input when loading', () => {
      render(<SearchInput isLoading />);
      const input = screen.getByRole('searchbox');
      expect(input).toBeDisabled();
    });

    it('should have animation class on loading icon', () => {
      render(<SearchInput isLoading />);
      const iconWrapper = screen.getByText('progress_activity').parentElement;
      expect(iconWrapper).toHaveClass('animate-spin');
    });
  });

  describe('Clear Button', () => {
    it('should show clear button when input has value', () => {
      render(<SearchInput value="test" onChange={() => {}} showClear />);
      const clearButton = screen.getByLabelText('Clear search');
      expect(clearButton).toBeInTheDocument();
    });

    it('should not show clear button when input is empty', () => {
      render(<SearchInput value="" onChange={() => {}} showClear />);
      expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();
    });

    it('should not show clear button when showClear is false', () => {
      render(<SearchInput value="test" onChange={() => {}} showClear={false} />);
      expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();
    });

    it('should not show clear button when disabled', () => {
      render(<SearchInput value="test" onChange={() => {}} showClear disabled />);
      expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();
    });

    it('should not show clear button when loading', () => {
      render(<SearchInput value="test" onChange={() => {}} showClear isLoading />);
      expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();
    });

    it('should call onClear when clear button is clicked', async () => {
      const handleClear = vi.fn();
      const user = userEvent.setup();
      render(
        <SearchInput value="test" onChange={() => {}} showClear onClear={handleClear} />
      );

      const clearButton = screen.getByLabelText('Clear search');
      await user.click(clearButton);
      expect(handleClear).toHaveBeenCalledTimes(1);
    });

    it('should call onChange with empty value when clear is clicked without onClear', async () => {
      const handleChange = vi.fn();
      const user = userEvent.setup();
      render(<SearchInput value="test" onChange={handleChange} showClear />);

      const clearButton = screen.getByLabelText('Clear search');
      await user.click(clearButton);
      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({ value: '' }),
        })
      );
    });

    it('should render close icon in clear button', () => {
      render(<SearchInput value="test" onChange={() => {}} showClear />);
      const closeIcon = screen.getByText('close');
      expect(closeIcon).toBeInTheDocument();
    });
  });

  describe('States', () => {
    it('should be disabled when disabled prop is true', () => {
      render(<SearchInput disabled />);
      const input = screen.getByRole('searchbox');
      expect(input).toBeDisabled();
    });

    it('should not be disabled by default', () => {
      render(<SearchInput />);
      const input = screen.getByRole('searchbox');
      expect(input).not.toBeDisabled();
    });
  });

  describe('Styling', () => {
    it('should have base input styles', () => {
      render(<SearchInput />);
      const input = screen.getByRole('searchbox');
      expect(input).toHaveClass(
        'flex',
        'h-10',
        'w-full',
        'rounded-md',
        'border',
        'text-sm'
      );
    });

    it('should have left padding for icon', () => {
      render(<SearchInput />);
      const input = screen.getByRole('searchbox');
      expect(input).toHaveClass('pl-10');
    });

    it('should have right padding for clear button when value exists', () => {
      render(<SearchInput value="test" onChange={() => {}} showClear />);
      const input = screen.getByRole('searchbox');
      expect(input).toHaveClass('pr-10');
    });

    it('should have normal right padding when no clear button', () => {
      render(<SearchInput value="" onChange={() => {}} showClear />);
      const input = screen.getByRole('searchbox');
      expect(input).toHaveClass('pr-4');
    });

    it('should accept custom className', () => {
      render(<SearchInput className="custom-class" />);
      const input = screen.getByRole('searchbox');
      expect(input).toHaveClass('custom-class');
    });

    it('should accept custom containerClassName', () => {
      render(<SearchInput containerClassName="custom-container" />);
      const wrapper = screen.getByRole('search');
      expect(wrapper).toHaveClass('custom-container');
    });
  });

  describe('Props', () => {
    it('should forward standard input props', () => {
      render(
        <SearchInput
          name="search-field"
          id="search-input"
          maxLength={100}
          autoComplete="off"
          data-testid="test-search"
        />
      );
      const input = screen.getByTestId('test-search');
      expect(input).toHaveAttribute('name', 'search-field');
      expect(input).toHaveAttribute('id', 'search-input');
      expect(input).toHaveAttribute('maxlength', '100');
      expect(input).toHaveAttribute('autocomplete', 'off');
    });

    it('should handle onChange events', async () => {
      const handleChange = vi.fn();
      const user = userEvent.setup();
      render(<SearchInput onChange={handleChange} />);
      const input = screen.getByRole('searchbox');

      await user.type(input, 'test');
      expect(handleChange).toHaveBeenCalled();
    });

    it('should handle onFocus events', async () => {
      const handleFocus = vi.fn();
      const user = userEvent.setup();
      render(<SearchInput onFocus={handleFocus} />);
      const input = screen.getByRole('searchbox');

      await user.click(input);
      expect(handleFocus).toHaveBeenCalledTimes(1);
    });

    it('should handle onBlur events', async () => {
      const handleBlur = vi.fn();
      const user = userEvent.setup();
      render(<SearchInput onBlur={handleBlur} />);
      const input = screen.getByRole('searchbox');

      await user.click(input);
      await user.tab();
      expect(handleBlur).toHaveBeenCalledTimes(1);
    });
  });

  describe('Ref', () => {
    it('should forward ref correctly', () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<SearchInput ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLInputElement);
    });

    it('should allow ref to focus input', () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<SearchInput ref={ref} />);
      ref.current?.focus();
      expect(document.activeElement).toBe(ref.current);
    });
  });

  describe('Accessibility', () => {
    it('should be accessible with aria-label', () => {
      render(<SearchInput aria-label="Search contacts" />);
      const input = screen.getByLabelText('Search contacts');
      expect(input).toBeInTheDocument();
    });

    it('should have search role on wrapper', () => {
      render(<SearchInput />);
      const wrapper = screen.getByRole('search');
      expect(wrapper).toBeInTheDocument();
    });

    it('should have clear button with accessible label', () => {
      render(<SearchInput value="test" onChange={() => {}} showClear />);
      const clearButton = screen.getByLabelText('Clear search');
      expect(clearButton).toBeInTheDocument();
    });

    it('should support aria-describedby', () => {
      render(
        <>
          <SearchInput aria-describedby="search-help" />
          <span id="search-help">Search by name or email</span>
        </>
      );
      const input = screen.getByRole('searchbox');
      expect(input).toHaveAttribute('aria-describedby', 'search-help');
    });
  });
});
