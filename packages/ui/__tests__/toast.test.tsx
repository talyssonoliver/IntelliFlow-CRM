// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  Toast,
  ToastTitle,
  ToastDescription,
  ToastProvider,
  ToastViewport,
  ToastAction,
  ToastClose,
} from '../src/components/toast';

describe('Toast', () => {
  const ToastWrapper = ({ children }: { children: React.ReactNode }) => (
    <ToastProvider>
      {children}
      <ToastViewport />
    </ToastProvider>
  );

  describe('Rendering', () => {
    it('should render toast', () => {
      render(
        <ToastWrapper>
          <Toast open>
            <ToastTitle>Test Toast</ToastTitle>
          </Toast>
        </ToastWrapper>
      );
      expect(screen.getByText('Test Toast')).toBeInTheDocument();
    });

    it('should render toast with description', () => {
      render(
        <ToastWrapper>
          <Toast open>
            <ToastTitle>Title</ToastTitle>
            <ToastDescription>This is a description</ToastDescription>
          </Toast>
        </ToastWrapper>
      );
      expect(screen.getByText('This is a description')).toBeInTheDocument();
    });

    it('should render toast action', () => {
      render(
        <ToastWrapper>
          <Toast open>
            <ToastTitle>Title</ToastTitle>
            <ToastAction altText="Undo action">Undo</ToastAction>
          </Toast>
        </ToastWrapper>
      );
      expect(screen.getByText('Undo')).toBeInTheDocument();
    });

    it('should render close button', () => {
      render(
        <ToastWrapper>
          <Toast open>
            <ToastTitle>Title</ToastTitle>
            <ToastClose />
          </Toast>
        </ToastWrapper>
      );
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });
  });

  describe('Variants', () => {
    it('should render default variant', () => {
      render(
        <ToastWrapper>
          <Toast open variant="default" data-testid="toast">
            <ToastTitle>Default</ToastTitle>
          </Toast>
        </ToastWrapper>
      );
      const toast = screen.getByTestId('toast');
      expect(toast).toHaveClass('bg-background');
    });

    it('should render destructive variant', () => {
      render(
        <ToastWrapper>
          <Toast open variant="destructive" data-testid="toast">
            <ToastTitle>Error</ToastTitle>
          </Toast>
        </ToastWrapper>
      );
      const toast = screen.getByTestId('toast');
      expect(toast).toHaveClass('destructive');
    });

    it('should render success variant', () => {
      render(
        <ToastWrapper>
          <Toast open variant="success" data-testid="toast">
            <ToastTitle>Success</ToastTitle>
          </Toast>
        </ToastWrapper>
      );
      const toast = screen.getByTestId('toast');
      expect(toast).toHaveClass('border-green-500');
    });
  });

  describe('Styling', () => {
    it('should apply custom className', () => {
      render(
        <ToastWrapper>
          <Toast open className="custom-toast">
            <ToastTitle>Title</ToastTitle>
          </Toast>
        </ToastWrapper>
      );
      const toast = document.querySelector('.custom-toast');
      expect(toast).toBeInTheDocument();
    });

    it('should have base toast styles', () => {
      render(
        <ToastWrapper>
          <Toast open data-testid="toast">
            <ToastTitle>Title</ToastTitle>
          </Toast>
        </ToastWrapper>
      );
      const toast = screen.getByTestId('toast');
      expect(toast).toHaveClass('rounded-md', 'border', 'shadow-lg');
    });
  });

  describe('Accessibility', () => {
    it('should have sr-only close button text', () => {
      render(
        <ToastWrapper>
          <Toast open>
            <ToastTitle>Title</ToastTitle>
            <ToastClose />
          </Toast>
        </ToastWrapper>
      );
      expect(screen.getByText('Close')).toHaveClass('sr-only');
    });
  });

  describe('Toast Title', () => {
    it('should render with correct styles', () => {
      render(
        <ToastWrapper>
          <Toast open>
            <ToastTitle className="custom-title">Title</ToastTitle>
          </Toast>
        </ToastWrapper>
      );
      const title = screen.getByText('Title');
      expect(title).toHaveClass('text-sm', 'font-semibold');
    });
  });

  describe('Toast Description', () => {
    it('should render with correct styles', () => {
      render(
        <ToastWrapper>
          <Toast open>
            <ToastTitle>Title</ToastTitle>
            <ToastDescription className="custom-desc">Description</ToastDescription>
          </Toast>
        </ToastWrapper>
      );
      const desc = screen.getByText('Description');
      expect(desc).toHaveClass('text-sm', 'opacity-90');
    });
  });
});
