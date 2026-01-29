// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { ModelInfo } from '../src/components/score/ModelInfo';

describe('ModelInfo', () => {
  describe('Rendering', () => {
    it('should render model version', () => {
      render(<ModelInfo modelVersion="lead-scorer-v2.1" />);
      expect(screen.getByText('lead-scorer-v2.1')).toBeInTheDocument();
    });

    it('should render with label', () => {
      render(<ModelInfo modelVersion="lead-scorer-v2.1" showLabel />);
      expect(screen.getByText(/model/i)).toBeInTheDocument();
      expect(screen.getByText('lead-scorer-v2.1')).toBeInTheDocument();
    });

    it('should render icon', () => {
      render(<ModelInfo modelVersion="lead-scorer-v2.1" showIcon />);
      expect(screen.getByText('smart_toy')).toBeInTheDocument();
    });

    it('should render timestamp when provided', () => {
      const timestamp = '2026-01-01T10:00:00.000Z';
      render(<ModelInfo modelVersion="lead-scorer-v2.1" scoredAt={timestamp} showTimestamp />);
      expect(screen.getByText(/scored/i)).toBeInTheDocument();
    });
  });

  describe('Size Variants', () => {
    it('should render small size', () => {
      render(<ModelInfo modelVersion="v2.1" size="sm" data-testid="model-info" />);
      const info = screen.getByTestId('model-info');
      expect(info).toHaveClass('text-xs');
    });

    it('should render medium size', () => {
      render(<ModelInfo modelVersion="v2.1" size="md" data-testid="model-info" />);
      const info = screen.getByTestId('model-info');
      expect(info).toHaveClass('text-sm');
    });

    it('should render large size', () => {
      render(<ModelInfo modelVersion="v2.1" size="lg" data-testid="model-info" />);
      const info = screen.getByTestId('model-info');
      expect(info).toHaveClass('text-base');
    });
  });

  describe('Timestamp Formatting', () => {
    it('should format timestamp as relative time', () => {
      const recentTimestamp = new Date(Date.now() - 1000 * 60 * 5).toISOString(); // 5 mins ago
      render(
        <ModelInfo
          modelVersion="v2.1"
          scoredAt={recentTimestamp}
          showTimestamp
          timestampFormat="relative"
        />
      );
      expect(screen.getByText(/ago/i)).toBeInTheDocument();
    });

    it('should format timestamp as absolute date', () => {
      const timestamp = '2026-01-01T10:00:00.000Z';
      render(
        <ModelInfo
          modelVersion="v2.1"
          scoredAt={timestamp}
          showTimestamp
          timestampFormat="absolute"
        />
      );
      // Should show date in some format
      expect(screen.getByText(/2026|Jan/i)).toBeInTheDocument();
    });
  });

  describe('Props', () => {
    it('should forward HTML attributes', () => {
      render(<ModelInfo modelVersion="v2.1" data-testid="test-model-info" />);
      expect(screen.getByTestId('test-model-info')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(
        <ModelInfo
          modelVersion="v2.1"
          className="custom-class"
          data-testid="model-info"
        />
      );
      expect(screen.getByTestId('model-info')).toHaveClass('custom-class');
    });
  });

  describe('Accessibility', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <ModelInfo
          modelVersion="lead-scorer-v2.1"
          showLabel
          showIcon
          scoredAt="2026-01-01T10:00:00.000Z"
          showTimestamp
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have descriptive aria-label', () => {
      render(<ModelInfo modelVersion="lead-scorer-v2.1" />);
      expect(screen.getByLabelText(/model.*lead-scorer-v2.1/i)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty model version', () => {
      render(<ModelInfo modelVersion="" data-testid="model-info" />);
      expect(screen.getByTestId('model-info')).toBeInTheDocument();
    });

    it('should handle very long model version', () => {
      const longVersion = 'lead-scorer-enterprise-production-v2.1.345.beta-20260101';
      render(<ModelInfo modelVersion={longVersion} />);
      expect(screen.getByText(longVersion)).toBeInTheDocument();
    });

    it('should handle invalid timestamp gracefully', () => {
      render(
        <ModelInfo
          modelVersion="v2.1"
          scoredAt="invalid-date"
          showTimestamp
        />
      );
      // Should not crash
      expect(screen.getByText('v2.1')).toBeInTheDocument();
    });
  });
});
