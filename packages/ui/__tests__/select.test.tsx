// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from '../src/components/select';

describe('Select', () => {
  describe('Rendering', () => {
    it('should render select trigger', () => {
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('should display placeholder text', () => {
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Choose an option" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );
      expect(screen.getByText('Choose an option')).toBeInTheDocument();
    });

    it('should open dropdown when clicked', async () => {
      const user = userEvent.setup();
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="opt1">Option 1</SelectItem>
            <SelectItem value="opt2">Option 2</SelectItem>
          </SelectContent>
        </Select>
      );

      await user.click(screen.getByRole('combobox'));
      expect(screen.getByText('Option 1')).toBeInTheDocument();
      expect(screen.getByText('Option 2')).toBeInTheDocument();
    });
  });

  describe('Selection', () => {
    it('should select an option when clicked', async () => {
      const user = userEvent.setup();
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="opt1">Option 1</SelectItem>
            <SelectItem value="opt2">Option 2</SelectItem>
          </SelectContent>
        </Select>
      );

      await user.click(screen.getByRole('combobox'));
      await user.click(screen.getByText('Option 1'));
      expect(screen.getByRole('combobox')).toHaveTextContent('Option 1');
    });

    it('should support controlled value', () => {
      render(
        <Select value="opt2">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="opt1">Option 1</SelectItem>
            <SelectItem value="opt2">Option 2</SelectItem>
          </SelectContent>
        </Select>
      );
      expect(screen.getByRole('combobox')).toHaveTextContent('Option 2');
    });
  });

  describe('Grouped Items', () => {
    it('should render select groups with labels', async () => {
      const user = userEvent.setup();
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Fruits</SelectLabel>
              <SelectItem value="apple">Apple</SelectItem>
              <SelectItem value="banana">Banana</SelectItem>
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Vegetables</SelectLabel>
              <SelectItem value="carrot">Carrot</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      );

      await user.click(screen.getByRole('combobox'));
      expect(screen.getByText('Fruits')).toBeInTheDocument();
      expect(screen.getByText('Vegetables')).toBeInTheDocument();
    });
  });

  describe('Disabled State', () => {
    it('should be disabled when disabled prop is true', () => {
      render(
        <Select disabled>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Option</SelectItem>
          </SelectContent>
        </Select>
      );
      expect(screen.getByRole('combobox')).toBeDisabled();
    });

    it('should render disabled items', async () => {
      const user = userEvent.setup();
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="opt1">Option 1</SelectItem>
            <SelectItem value="opt2" disabled>
              Option 2 (Disabled)
            </SelectItem>
          </SelectContent>
        </Select>
      );

      await user.click(screen.getByRole('combobox'));
      const disabledItem = screen.getByText('Option 2 (Disabled)').closest('[data-disabled]');
      expect(disabledItem).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should apply custom className to trigger', () => {
      render(
        <Select>
          <SelectTrigger className="custom-class">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Option</SelectItem>
          </SelectContent>
        </Select>
      );
      expect(screen.getByRole('combobox')).toHaveClass('custom-class');
    });

    it('should have focus-visible styles', () => {
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Option</SelectItem>
          </SelectContent>
        </Select>
      );
      const trigger = screen.getByRole('combobox');
      expect(trigger).toHaveClass('focus:outline-none', 'focus:ring-2');
    });
  });
});
