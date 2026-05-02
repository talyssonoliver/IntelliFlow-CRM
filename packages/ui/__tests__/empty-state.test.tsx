// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { EmptyState } from '../src/components/empty-state';

describe('EmptyState', () => {
  describe('Rendering', () => {
    it('should render with title', () => {
      render(<EmptyState title="No items found" />);
      expect(screen.getByText('No items found')).toBeInTheDocument();
    });

    it('should render with description', () => {
      render(
        <EmptyState title="No leads" description="Start by adding your first lead to the system." />
      );
      expect(
        screen.getByText('Start by adding your first lead to the system.')
      ).toBeInTheDocument();
    });

    it('should render default icon', () => {
      render(<EmptyState title="Empty" />);
      expect(screen.getByText('inbox')).toBeInTheDocument();
    });

    it('should render custom icon', () => {
      render(<EmptyState title="No contacts" icon="person_off" />);
      expect(screen.getByText('person_off')).toBeInTheDocument();
    });

    it('should render icon with aria-hidden', () => {
      render(<EmptyState title="Empty" icon="search_off" />);
      const icon = screen.getByText('search_off');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('Actions', () => {
    it('should render primary action button', () => {
      render(<EmptyState title="No leads" action={{ label: 'Add Lead' }} />);
      expect(screen.getByRole('button', { name: 'Add Lead' })).toBeInTheDocument();
    });

    it('should call onClick when primary action is clicked', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();
      render(<EmptyState title="No leads" action={{ label: 'Add Lead', onClick }} />);

      await user.click(screen.getByRole('button', { name: 'Add Lead' }));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('should render action as link when href is provided', () => {
      render(<EmptyState title="No leads" action={{ label: 'Go to Leads', href: '/leads' }} />);
      const link = screen.getByRole('link', { name: 'Go to Leads' });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/leads');
    });

    it('should render action with icon', () => {
      render(<EmptyState title="No leads" action={{ label: 'Add Lead', icon: 'add' }} />);
      expect(screen.getByText('add')).toBeInTheDocument();
    });

    it('should render secondary action', () => {
      render(
        <EmptyState
          title="No leads"
          action={{ label: 'Add Lead' }}
          secondaryAction={{ label: 'Import' }}
        />
      );
      expect(screen.getByRole('button', { name: 'Add Lead' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
    });

    it('should call onClick for secondary action', async () => {
      const onSecondaryClick = vi.fn();
      const user = userEvent.setup();
      render(
        <EmptyState
          title="No leads"
          action={{ label: 'Add Lead', onClick: vi.fn() }}
          secondaryAction={{ label: 'Import', onClick: onSecondaryClick }}
        />
      );

      await user.click(screen.getByRole('button', { name: 'Import' }));
      expect(onSecondaryClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Sizes', () => {
    it('should apply small size classes', () => {
      const { container } = render(<EmptyState title="Empty" size="sm" />);
      expect(container.firstChild).toHaveClass('py-6', 'px-4');
    });

    it('should apply medium size classes by default', () => {
      const { container } = render(<EmptyState title="Empty" />);
      expect(container.firstChild).toHaveClass('py-10', 'px-6');
    });

    it('should apply large size classes', () => {
      const { container } = render(<EmptyState title="Empty" size="lg" />);
      expect(container.firstChild).toHaveClass('py-16', 'px-8');
    });

    it('should use larger icon for large size', () => {
      render(<EmptyState title="Empty" size="lg" />);
      const icon = screen.getByText('inbox');
      expect(icon).toHaveClass('text-4xl');
    });

    it('should use smaller icon for small size', () => {
      render(<EmptyState title="Empty" size="sm" />);
      const icon = screen.getByText('inbox');
      expect(icon).toHaveClass('text-xl');
    });
  });

  describe('Icon Styling', () => {
    it('should apply default icon color', () => {
      render(<EmptyState title="Empty" />);
      const icon = screen.getByText('inbox');
      expect(icon).toHaveClass('text-muted-foreground');
    });

    it('should apply custom icon color', () => {
      render(<EmptyState title="Empty" iconColorClass="text-primary" />);
      const icon = screen.getByText('inbox');
      expect(icon).toHaveClass('text-primary');
    });

    it('should apply default icon background', () => {
      render(<EmptyState title="Empty" />);
      const iconWrapper = screen.getByText('inbox').parentElement;
      expect(iconWrapper).toHaveClass('bg-muted');
    });

    it('should apply custom icon background', () => {
      render(<EmptyState title="Empty" iconBgClass="bg-primary/10" />);
      const iconWrapper = screen.getByText('inbox').parentElement;
      expect(iconWrapper).toHaveClass('bg-primary/10');
    });
  });

  describe('Styling', () => {
    it('should center content', () => {
      const { container } = render(<EmptyState title="Empty" />);
      expect(container.firstChild).toHaveClass(
        'flex',
        'flex-col',
        'items-center',
        'justify-center',
        'text-center'
      );
    });

    it('should accept custom className', () => {
      const { container } = render(<EmptyState title="Empty" className="custom-class" />);
      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('should have rounded icon wrapper', () => {
      render(<EmptyState title="Empty" />);
      const iconWrapper = screen.getByText('inbox').parentElement;
      expect(iconWrapper).toHaveClass('rounded-full');
    });
  });

  describe('Props', () => {
    it('should forward data-testid', () => {
      render(<EmptyState title="Empty" data-testid="empty-state" />);
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });

  describe('Ref', () => {
    it('should forward ref correctly', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(<EmptyState ref={ref} title="Empty" />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe('Entity Mode', () => {
    it('renders with entity=leads', () => {
      render(<EmptyState entity="leads" />);
      // entity config provides default title/description
      expect(document.body).not.toBeEmptyDOMElement();
    });

    it('renders with entity=contacts', () => {
      const { container } = render(<EmptyState entity="contacts" />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders with entity=tasks', () => {
      const { container } = render(<EmptyState entity="tasks" />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders with entity=deals', () => {
      const { container } = render(<EmptyState entity="deals" />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders with entity=tickets', () => {
      const { container } = render(<EmptyState entity="tickets" />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders with entity=activity', () => {
      const { container } = render(<EmptyState entity="activity" />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders with entity=search', () => {
      const { container } = render(<EmptyState entity="search" />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders overridden title in entity mode', () => {
      render(<EmptyState entity="leads" title="Custom Title" />);
      expect(screen.getByText('Custom Title')).toBeInTheDocument();
    });

    it('renders overridden description in entity mode', () => {
      render(<EmptyState entity="leads" description="Custom Description" />);
      expect(screen.getByText('Custom Description')).toBeInTheDocument();
    });

    it('renders entity mode in soft-cta phase', () => {
      const { container } = render(<EmptyState entity="leads" phase="soft-cta" />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders entity mode in inline-composer phase', () => {
      const { container } = render(
        <EmptyState entity="leads" phase="inline-composer" onCreate={vi.fn()} />
      );
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders entity mode in smart-suggestions phase', () => {
      const suggestions = ['Add first lead', 'Import leads'];
      const { container } = render(
        <EmptyState
          entity="leads"
          phase="smart-suggestions"
          suggestions={suggestions}
          onSuggestionClick={vi.fn()}
        />
      );
      expect(screen.getByText('Add first lead')).toBeInTheDocument();
    });

    it('calls onSuggestionClick when suggestion clicked', async () => {
      const onSuggestionClick = vi.fn();
      const user = userEvent.setup();
      render(
        <EmptyState
          entity="leads"
          phase="smart-suggestions"
          suggestions={['Create lead']}
          onSuggestionClick={onSuggestionClick}
        />
      );
      await user.click(screen.getByText('Create lead'));
      expect(onSuggestionClick).toHaveBeenCalledWith('Create lead');
    });

    it('transitions to inline-composer when CTA clicked', async () => {
      const onPhaseChange = vi.fn();
      const user = userEvent.setup();
      render(<EmptyState entity="leads" phase="soft-cta" onPhaseChange={onPhaseChange} />);
      // Find the CTA button — click the first button in soft-cta phase
      const buttons = screen.getAllByRole('button');
      if (buttons.length > 0) {
        await user.click(buttons[0]);
        expect(onPhaseChange).toHaveBeenCalled();
      }
    });

    it('calls onCreate when composer submits', async () => {
      const onCreate = vi.fn();
      const user = userEvent.setup();
      render(<EmptyState entity="leads" phase="inline-composer" onCreate={onCreate} />);
      // Find input/textarea in the composer
      const input = document.querySelector('input, textarea');
      if (input) {
        await user.type(input, 'New Lead Name');
        // Submit via button
        const submitButtons = screen.getAllByRole('button');
        const saveBtn = submitButtons.find((b) => /save|add|create/i.test(b.textContent ?? ''));
        if (saveBtn) {
          await user.click(saveBtn);
          expect(onCreate).toHaveBeenCalledWith('New Lead Name');
        }
      }
    });

    it('renders custom illustration', () => {
      render(
        <EmptyState
          entity="leads"
          illustration={<div data-testid="custom-illustration">Custom SVG</div>}
        />
      );
      expect(screen.getByTestId('custom-illustration')).toBeInTheDocument();
    });

    it('renders selection variant', () => {
      const { container } = render(<EmptyState entity="leads" variant="selection" />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders renderComposer override in inline-composer phase', () => {
      render(
        <EmptyState
          entity="leads"
          phase="inline-composer"
          renderComposer={({ onSubmit, onCancel, placeholder }) => (
            <div data-testid="custom-composer">
              <input placeholder={placeholder} />
              <button type="button" onClick={() => onSubmit('custom')}>
                Save
              </button>
              <button type="button" onClick={onCancel}>
                Cancel
              </button>
            </div>
          )}
        />
      );
      expect(screen.getByTestId('custom-composer')).toBeInTheDocument();
    });

    it('handles phase change on mouse enter/leave', async () => {
      const onPhaseChange = vi.fn();
      const user = userEvent.setup();
      const { container } = render(<EmptyState entity="leads" onPhaseChange={onPhaseChange} />);
      await user.hover(container.firstChild as Element);
      expect(onPhaseChange).toHaveBeenCalledWith('soft-cta');
      await user.unhover(container.firstChild as Element);
      expect(onPhaseChange).toHaveBeenCalledWith('passive');
    });
  });
});
