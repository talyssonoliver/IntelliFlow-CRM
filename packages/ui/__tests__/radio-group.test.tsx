// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { RadioGroup, RadioGroupItem } from '../src/components/radio-group';
import { Label } from '../src/components/label';

describe('RadioGroup', () => {
  describe('Rendering', () => {
    it('should render radio group', () => {
      render(
        <RadioGroup>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="option1" id="option1" />
            <Label htmlFor="option1">Option 1</Label>
          </div>
        </RadioGroup>
      );
      expect(screen.getByRole('radio')).toBeInTheDocument();
    });

    it('should render multiple radio items', () => {
      render(
        <RadioGroup>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="option1" id="option1" />
            <Label htmlFor="option1">Option 1</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="option2" id="option2" />
            <Label htmlFor="option2">Option 2</Label>
          </div>
        </RadioGroup>
      );
      expect(screen.getAllByRole('radio')).toHaveLength(2);
    });

    it('should not have any checked by default', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value="option1" id="option1" />
        </RadioGroup>
      );
      expect(screen.getByRole('radio')).not.toBeChecked();
    });
  });

  describe('Default Value', () => {
    it('should check item with defaultValue', () => {
      render(
        <RadioGroup defaultValue="option2">
          <RadioGroupItem value="option1" id="option1" />
          <RadioGroupItem value="option2" id="option2" />
        </RadioGroup>
      );
      const radios = screen.getAllByRole('radio');
      expect(radios[0]).not.toBeChecked();
      expect(radios[1]).toBeChecked();
    });
  });

  describe('Interaction', () => {
    it('should select radio when clicked', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(
        <RadioGroup onValueChange={onValueChange}>
          <RadioGroupItem value="option1" id="option1" />
          <RadioGroupItem value="option2" id="option2" />
        </RadioGroup>
      );

      await user.click(screen.getAllByRole('radio')[0]);
      expect(onValueChange).toHaveBeenCalledWith('option1');
    });

    it('should switch selection when another radio is clicked', async () => {
      const user = userEvent.setup();
      render(
        <RadioGroup defaultValue="option1">
          <RadioGroupItem value="option1" id="option1" />
          <RadioGroupItem value="option2" id="option2" />
        </RadioGroup>
      );

      const radios = screen.getAllByRole('radio');
      expect(radios[0]).toBeChecked();

      await user.click(radios[1]);
      expect(radios[0]).not.toBeChecked();
      expect(radios[1]).toBeChecked();
    });
  });

  describe('Disabled State', () => {
    it('should disable entire group when disabled prop is true', () => {
      render(
        <RadioGroup disabled>
          <RadioGroupItem value="option1" id="option1" />
          <RadioGroupItem value="option2" id="option2" />
        </RadioGroup>
      );
      screen.getAllByRole('radio').forEach((radio) => {
        expect(radio).toBeDisabled();
      });
    });

    it('should disable individual radio item', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value="option1" id="option1" />
          <RadioGroupItem value="option2" id="option2" disabled />
        </RadioGroup>
      );
      const radios = screen.getAllByRole('radio');
      expect(radios[0]).not.toBeDisabled();
      expect(radios[1]).toBeDisabled();
    });

    it('should not select disabled radio when clicked', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      render(
        <RadioGroup onValueChange={onValueChange}>
          <RadioGroupItem value="option1" id="option1" disabled />
        </RadioGroup>
      );

      await user.click(screen.getByRole('radio'));
      expect(onValueChange).not.toHaveBeenCalled();
    });
  });

  describe('Styling', () => {
    it('should apply custom className to RadioGroup', () => {
      render(
        <RadioGroup className="custom-group" data-testid="radio-group">
          <RadioGroupItem value="option1" id="option1" />
        </RadioGroup>
      );
      expect(screen.getByTestId('radio-group')).toHaveClass('custom-group');
    });

    it('should apply custom className to RadioGroupItem', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value="option1" id="option1" className="custom-radio" />
        </RadioGroup>
      );
      expect(screen.getByRole('radio')).toHaveClass('custom-radio');
    });

    it('should have base radio styles', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value="option1" id="option1" />
        </RadioGroup>
      );
      const radio = screen.getByRole('radio');
      expect(radio).toHaveClass('h-4', 'w-4', 'rounded-full', 'border', 'border-primary');
    });

    it('should have focus styles', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value="option1" id="option1" />
        </RadioGroup>
      );
      const radio = screen.getByRole('radio');
      expect(radio).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-ring');
    });
  });

  describe('Accessibility', () => {
    it('should have radiogroup role on container', () => {
      render(
        <RadioGroup data-testid="radio-group">
          <RadioGroupItem value="option1" id="option1" />
        </RadioGroup>
      );
      expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    });

    it('should have radio role on items', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value="option1" id="option1" />
        </RadioGroup>
      );
      expect(screen.getByRole('radio')).toBeInTheDocument();
    });
  });

  describe('Ref Forwarding', () => {
    it('should forward ref to RadioGroup', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(
        <RadioGroup ref={ref}>
          <RadioGroupItem value="option1" id="option1" />
        </RadioGroup>
      );
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });

    it('should forward ref to RadioGroupItem', () => {
      const ref = React.createRef<HTMLButtonElement>();
      render(
        <RadioGroup>
          <RadioGroupItem ref={ref} value="option1" id="option1" />
        </RadioGroup>
      );
      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });
  });
});
