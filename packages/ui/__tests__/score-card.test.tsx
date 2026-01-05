// @vitest-environment jsdom
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { axe, toHaveNoViolations } from 'vitest-axe';
import { ScoreCard } from '../src/components/score/ScoreCard';

expect.extend(toHaveNoViolations);

describe('ScoreCard', () => {
  const defaultData = {
    score: 85,
    confidence: 0.9,
    factors: [
      { name: 'Email Domain Quality', impact: 20, reasoning: 'Corporate email' },
      { name: 'Company Size', impact: 15, reasoning: 'Enterprise company' },
      { name: 'Role Level', impact: 10, reasoning: 'Decision maker' },
      { name: 'Website Activity', impact: -5, reasoning: 'Low engagement' },
    ],
    modelVersion: 'lead-scorer-v2.1',
  };

  describe('Rendering', () => {
    it('should render score', () => {
      render(<ScoreCard data={defaultData} />);
      expect(screen.getByText('85')).toBeInTheDocument();
    });

    it('should render tier label', () => {
      render(<ScoreCard data={defaultData} />);
      expect(screen.getByText('Hot')).toBeInTheDocument();
    });

    it('should render confidence indicator when showConfidence is true', () => {
      render(<ScoreCard data={defaultData} showConfidence />);
      expect(screen.getByText('90%')).toBeInTheDocument();
    });

    it('should render model info when showModelInfo is true', () => {
      render(<ScoreCard data={defaultData} showModelInfo />);
      expect(screen.getByText('lead-scorer-v2.1')).toBeInTheDocument();
    });

    it('should render factor list', () => {
      render(<ScoreCard data={defaultData} />);
      expect(screen.getByText('Email Domain Quality')).toBeInTheDocument();
      expect(screen.getByText('Company Size')).toBeInTheDocument();
    });
  });

  describe('Score Tiers', () => {
    it('should show hot tier for score >= 80', () => {
      render(<ScoreCard data={{ ...defaultData, score: 85 }} />);
      expect(screen.getByText('Hot')).toBeInTheDocument();
    });

    it('should show warm tier for score 50-79', () => {
      render(<ScoreCard data={{ ...defaultData, score: 65 }} />);
      expect(screen.getByText('Warm')).toBeInTheDocument();
    });

    it('should show cold tier for score < 50', () => {
      render(<ScoreCard data={{ ...defaultData, score: 30 }} />);
      expect(screen.getByText('Cold')).toBeInTheDocument();
    });
  });

  describe('Impact Bars', () => {
    it('should show impact bars when showImpactBars is true', () => {
      render(<ScoreCard data={defaultData} showImpactBars />);
      expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);
    });

    it('should not show impact bars by default', () => {
      render(<ScoreCard data={defaultData} />);
      // Only confidence indicator has progressbar
      const progressbars = screen.queryAllByRole('progressbar');
      expect(progressbars.length).toBe(0);
    });
  });

  describe('Human Feedback', () => {
    it('should show feedback buttons when onFeedback is provided', () => {
      const handleFeedback = vi.fn();
      render(<ScoreCard data={defaultData} onFeedback={handleFeedback} />);
      expect(screen.getByRole('button', { name: /helpful/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /not helpful/i })).toBeInTheDocument();
    });

    it('should call onFeedback with positive when helpful clicked', () => {
      const handleFeedback = vi.fn();
      render(<ScoreCard data={defaultData} onFeedback={handleFeedback} />);
      fireEvent.click(screen.getByRole('button', { name: /helpful/i }));
      expect(handleFeedback).toHaveBeenCalledWith('positive');
    });

    it('should call onFeedback with negative when not helpful clicked', () => {
      const handleFeedback = vi.fn();
      render(<ScoreCard data={defaultData} onFeedback={handleFeedback} />);
      fireEvent.click(screen.getByRole('button', { name: /not helpful/i }));
      expect(handleFeedback).toHaveBeenCalledWith('negative');
    });

    it('should not show feedback buttons when onFeedback is not provided', () => {
      render(<ScoreCard data={defaultData} />);
      expect(screen.queryByRole('button', { name: /helpful/i })).not.toBeInTheDocument();
    });
  });

  describe('Size Variants', () => {
    it('should render small size', () => {
      render(<ScoreCard data={defaultData} size="sm" data-testid="card" />);
      const card = screen.getByTestId('card');
      expect(card).toHaveClass('p-3');
    });

    it('should render medium size', () => {
      render(<ScoreCard data={defaultData} size="md" data-testid="card" />);
      const card = screen.getByTestId('card');
      expect(card).toHaveClass('p-4');
    });

    it('should render large size', () => {
      render(<ScoreCard data={defaultData} size="lg" data-testid="card" />);
      const card = screen.getByTestId('card');
      expect(card).toHaveClass('p-6');
    });
  });

  describe('Props', () => {
    it('should forward HTML attributes', () => {
      render(<ScoreCard data={defaultData} data-testid="test-card" />);
      expect(screen.getByTestId('test-card')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(<ScoreCard data={defaultData} className="custom-class" data-testid="card" />);
      expect(screen.getByTestId('card')).toHaveClass('custom-class');
    });
  });

  describe('Accessibility', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <ScoreCard
          data={defaultData}
          showConfidence
          showModelInfo
          showImpactBars
          onFeedback={() => {}}
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper heading hierarchy', () => {
      render(<ScoreCard data={defaultData} title="Lead Score" />);
      expect(screen.getByRole('heading', { name: /lead score/i })).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty factors array', () => {
      render(<ScoreCard data={{ ...defaultData, factors: [] }} />);
      expect(screen.getByText('85')).toBeInTheDocument();
      expect(screen.getByText(/no factors/i)).toBeInTheDocument();
    });

    it('should handle score of 0', () => {
      render(<ScoreCard data={{ ...defaultData, score: 0 }} />);
      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('should handle score of 100', () => {
      render(<ScoreCard data={{ ...defaultData, score: 100 }} />);
      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('should handle low confidence', () => {
      render(<ScoreCard data={{ ...defaultData, confidence: 0.3 }} showConfidence />);
      expect(screen.getByText('30%')).toBeInTheDocument();
    });
  });
});
