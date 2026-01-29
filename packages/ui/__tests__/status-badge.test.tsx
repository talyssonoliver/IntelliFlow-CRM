// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  StatusBadge,
  LEAD_STATUS_CONFIG,
  DOCUMENT_STATUS_CONFIG,
  TICKET_STATUS_CONFIG,
  DEAL_STATUS_CONFIG,
  TASK_STATUS_CONFIG,
} from '../src/components/status-badge';

describe('StatusBadge', () => {
  describe('Rendering', () => {
    it('should render a status badge', () => {
      render(<StatusBadge status="NEW" type="lead" />);
      expect(screen.getByText('New')).toBeInTheDocument();
    });

    it('should render with custom label', () => {
      render(<StatusBadge status="NEW" label="Custom Label" />);
      expect(screen.getByText('Custom Label')).toBeInTheDocument();
    });

    it('should format unknown status by replacing underscores', () => {
      render(<StatusBadge status="UNKNOWN_STATUS" />);
      expect(screen.getByText('UNKNOWN STATUS')).toBeInTheDocument();
    });
  });

  describe('Lead Status Configurations', () => {
    it.each(Object.entries(LEAD_STATUS_CONFIG))(
      'should render lead status %s correctly',
      (status, config) => {
        render(<StatusBadge status={status} type="lead" />);
        expect(screen.getByText(config.label)).toBeInTheDocument();
      }
    );

    it('should show icon for CONTACTED status', () => {
      render(<StatusBadge status="CONTACTED" type="lead" showIcon />);
      expect(screen.getByText('mail')).toBeInTheDocument();
    });

    it('should show icon for QUALIFIED status', () => {
      render(<StatusBadge status="QUALIFIED" type="lead" showIcon />);
      expect(screen.getByText('verified')).toBeInTheDocument();
    });

    it('should show icon for CONVERTED status', () => {
      render(<StatusBadge status="CONVERTED" type="lead" showIcon />);
      expect(screen.getByText('check_circle')).toBeInTheDocument();
    });
  });

  describe('Document Status Configurations', () => {
    it.each(Object.entries(DOCUMENT_STATUS_CONFIG))(
      'should render document status %s correctly',
      (status, config) => {
        render(<StatusBadge status={status} type="document" />);
        expect(screen.getByText(config.label)).toBeInTheDocument();
      }
    );

    it('should show icon for DRAFT status', () => {
      render(<StatusBadge status="DRAFT" type="document" showIcon />);
      expect(screen.getByText('edit_note')).toBeInTheDocument();
    });

    it('should show icon for SIGNED status', () => {
      render(<StatusBadge status="SIGNED" type="document" showIcon />);
      expect(screen.getByText('verified')).toBeInTheDocument();
    });
  });

  describe('Ticket Status Configurations', () => {
    it.each(Object.entries(TICKET_STATUS_CONFIG))(
      'should render ticket status %s correctly',
      (status, config) => {
        render(<StatusBadge status={status} type="ticket" />);
        expect(screen.getByText(config.label)).toBeInTheDocument();
      }
    );

    it('should show icon for OPEN status', () => {
      render(<StatusBadge status="OPEN" type="ticket" showIcon />);
      expect(screen.getByText('radio_button_unchecked')).toBeInTheDocument();
    });

    it('should show icon for RESOLVED status', () => {
      render(<StatusBadge status="RESOLVED" type="ticket" showIcon />);
      expect(screen.getByText('check_circle')).toBeInTheDocument();
    });
  });

  describe('Deal Status Configurations', () => {
    it.each(Object.entries(DEAL_STATUS_CONFIG))(
      'should render deal status %s correctly',
      (status, config) => {
        render(<StatusBadge status={status} type="deal" />);
        expect(screen.getByText(config.label)).toBeInTheDocument();
      }
    );

    it('should show icon for CLOSED_WON status', () => {
      render(<StatusBadge status="CLOSED_WON" type="deal" showIcon />);
      expect(screen.getByText('emoji_events')).toBeInTheDocument();
    });
  });

  describe('Task Status Configurations', () => {
    it.each(Object.entries(TASK_STATUS_CONFIG))(
      'should render task status %s correctly',
      (status, config) => {
        render(<StatusBadge status={status} type="task" />);
        expect(screen.getByText(config.label)).toBeInTheDocument();
      }
    );

    it('should show icon for COMPLETED status', () => {
      render(<StatusBadge status="COMPLETED" type="task" showIcon />);
      expect(screen.getByText('check_circle')).toBeInTheDocument();
    });

    it('should show icon for BLOCKED status', () => {
      render(<StatusBadge status="BLOCKED" type="task" showIcon />);
      expect(screen.getByText('block')).toBeInTheDocument();
    });
  });

  describe('Icon Display', () => {
    it('should show icon when showIcon is true', () => {
      render(<StatusBadge status="CONVERTED" type="lead" showIcon />);
      expect(screen.getByText('check_circle')).toBeInTheDocument();
    });

    it('should hide icon when showIcon is false', () => {
      render(<StatusBadge status="CONVERTED" type="lead" showIcon={false} />);
      expect(screen.queryByText('check_circle')).not.toBeInTheDocument();
    });

    it('should have aria-hidden on icon', () => {
      render(<StatusBadge status="CONVERTED" type="lead" showIcon />);
      const icon = screen.getByText('check_circle');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    it('should have material-symbols-outlined class on icon', () => {
      render(<StatusBadge status="CONVERTED" type="lead" showIcon />);
      const icon = screen.getByText('check_circle');
      expect(icon).toHaveClass('material-symbols-outlined');
    });
  });

  describe('Custom Configuration', () => {
    const customConfig = {
      CUSTOM_STATUS: { label: 'Custom Status', icon: 'star', variant: 'success' as const },
      ANOTHER: { label: 'Another One', variant: 'warning' as const },
    };

    it('should use custom config over type config', () => {
      render(<StatusBadge status="CUSTOM_STATUS" config={customConfig} />);
      expect(screen.getByText('Custom Status')).toBeInTheDocument();
    });

    it('should show custom icon from custom config', () => {
      render(<StatusBadge status="CUSTOM_STATUS" config={customConfig} showIcon />);
      expect(screen.getByText('star')).toBeInTheDocument();
    });

    it('should not show icon if custom config has no icon', () => {
      render(<StatusBadge status="ANOTHER" config={customConfig} showIcon />);
      expect(screen.queryByText('star')).not.toBeInTheDocument();
    });
  });

  describe('Variants', () => {
    it('should apply default variant styling', () => {
      render(<StatusBadge status="NEGOTIATING" type="lead" />);
      const badge = screen.getByText('Negotiating').closest('span');
      expect(badge).toHaveClass('bg-primary/10', 'text-primary');
    });

    it('should apply muted variant styling', () => {
      render(<StatusBadge status="NEW" type="lead" />);
      const badge = screen.getByText('New').closest('span');
      expect(badge).toHaveClass('bg-muted', 'text-muted-foreground');
    });

    it('should apply success variant styling', () => {
      render(<StatusBadge status="CONVERTED" type="lead" />);
      const badge = screen.getByText('Converted').closest('span');
      expect(badge).toHaveClass('bg-green-100', 'text-green-700');
    });

    it('should apply warning variant styling', () => {
      render(<StatusBadge status="CONTACTED" type="lead" />);
      const badge = screen.getByText('Contacted').closest('span');
      expect(badge).toHaveClass('bg-amber-100', 'text-amber-700');
    });

    it('should apply destructive variant styling', () => {
      render(<StatusBadge status="UNQUALIFIED" type="lead" />);
      const badge = screen.getByText('Unqualified').closest('span');
      expect(badge).toHaveClass('bg-red-100', 'text-red-700');
    });

    it('should apply info variant styling', () => {
      render(<StatusBadge status="QUALIFIED" type="lead" />);
      const badge = screen.getByText('Qualified').closest('span');
      expect(badge).toHaveClass('bg-blue-100', 'text-blue-700');
    });

    it('should allow variant override via prop', () => {
      render(<StatusBadge status="NEW" type="lead" variant="success" />);
      const badge = screen.getByText('New').closest('span');
      expect(badge).toHaveClass('bg-green-100', 'text-green-700');
    });
  });

  describe('Sizes', () => {
    it('should apply small size styling', () => {
      render(<StatusBadge status="NEW" type="lead" size="sm" />);
      const badge = screen.getByText('New').closest('span');
      expect(badge).toHaveClass('px-2', 'py-0.5', 'text-[10px]');
    });

    it('should apply medium size styling by default', () => {
      render(<StatusBadge status="NEW" type="lead" />);
      const badge = screen.getByText('New').closest('span');
      expect(badge).toHaveClass('px-2.5', 'py-1', 'text-xs');
    });

    it('should apply large size styling', () => {
      render(<StatusBadge status="NEW" type="lead" size="lg" />);
      const badge = screen.getByText('New').closest('span');
      expect(badge).toHaveClass('px-3', 'py-1.5', 'text-sm');
    });
  });

  describe('Styling', () => {
    it('should have base badge styles', () => {
      render(<StatusBadge status="NEW" type="lead" />);
      const badge = screen.getByText('New').closest('span');
      expect(badge).toHaveClass(
        'inline-flex',
        'items-center',
        'rounded-full',
        'font-medium'
      );
    });

    it('should accept custom className', () => {
      render(<StatusBadge status="NEW" type="lead" className="custom-class" />);
      const badge = screen.getByText('New').closest('span');
      expect(badge).toHaveClass('custom-class');
    });

    it('should merge custom className with default styles', () => {
      render(<StatusBadge status="NEW" type="lead" className="my-4" />);
      const badge = screen.getByText('New').closest('span');
      expect(badge).toHaveClass('my-4');
      expect(badge).toHaveClass('inline-flex'); // Base class preserved
    });
  });

  describe('Props', () => {
    it('should forward data-testid', () => {
      render(<StatusBadge status="NEW" type="lead" data-testid="test-badge" />);
      expect(screen.getByTestId('test-badge')).toBeInTheDocument();
    });

    it('should forward id', () => {
      render(<StatusBadge status="NEW" type="lead" id="status-badge" />);
      const badge = screen.getByText('New').closest('span');
      expect(badge).toHaveAttribute('id', 'status-badge');
    });
  });

  describe('Fallback Behavior', () => {
    it('should use muted variant for unknown status', () => {
      render(<StatusBadge status="UNKNOWN" type="lead" />);
      const badge = screen.getByText('UNKNOWN').closest('span');
      expect(badge).toHaveClass('bg-muted', 'text-muted-foreground');
    });

    it('should display raw status if not in config', () => {
      render(<StatusBadge status="COMPLETELY_NEW_STATUS" type="lead" />);
      expect(screen.getByText('COMPLETELY NEW STATUS')).toBeInTheDocument();
    });

    it('should work with custom type when no config', () => {
      render(<StatusBadge status="CUSTOM" type="custom" />);
      expect(screen.getByText('CUSTOM')).toBeInTheDocument();
    });
  });
});
