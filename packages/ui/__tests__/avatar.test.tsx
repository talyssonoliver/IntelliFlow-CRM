// @vitest-environment jsdom
import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Avatar, AvatarImage, AvatarFallback } from '../src/components/avatar';

describe('Avatar', () => {
  describe('Rendering', () => {
    it('should render avatar container', () => {
      render(
        <Avatar data-testid="avatar">
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
      );
      expect(screen.getByTestId('avatar')).toBeInTheDocument();
    });

    it('should render fallback text', () => {
      render(
        <Avatar>
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
      );
      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('should render image when src is provided', () => {
      render(
        <Avatar>
          <AvatarImage src="https://example.com/avatar.jpg" alt="User avatar" />
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
      );
      expect(screen.getByRole('img')).toBeInTheDocument();
    });
  });

  describe('Image Loading', () => {
    it('should show fallback when image fails to load', async () => {
      render(
        <Avatar>
          <AvatarImage src="invalid-url" alt="User" />
          <AvatarFallback>FB</AvatarFallback>
        </Avatar>
      );

      // Fallback should be visible since image hasn't loaded
      await waitFor(() => {
        expect(screen.getByText('FB')).toBeInTheDocument();
      });
    });

    it('should have alt text on image', () => {
      render(
        <Avatar>
          <AvatarImage src="https://example.com/avatar.jpg" alt="User avatar" />
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
      );
      expect(screen.getByRole('img')).toHaveAttribute('alt', 'User avatar');
    });
  });

  describe('Styling', () => {
    it('should apply custom className to Avatar', () => {
      render(
        <Avatar className="custom-avatar">
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
      );
      const avatar = document.querySelector('.custom-avatar');
      expect(avatar).toBeInTheDocument();
    });

    it('should have base avatar styles', () => {
      render(
        <Avatar data-testid="avatar">
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
      );
      const avatar = screen.getByTestId('avatar');
      expect(avatar).toHaveClass('relative', 'flex', 'h-10', 'w-10', 'shrink-0', 'overflow-hidden', 'rounded-full');
    });

    it('should apply custom className to AvatarImage', () => {
      render(
        <Avatar>
          <AvatarImage src="https://example.com/avatar.jpg" alt="User" className="custom-image" />
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
      );
      expect(screen.getByRole('img')).toHaveClass('custom-image');
    });

    it('should apply custom className to AvatarFallback', () => {
      render(
        <Avatar>
          <AvatarFallback className="custom-fallback">JD</AvatarFallback>
        </Avatar>
      );
      expect(screen.getByText('JD')).toHaveClass('custom-fallback');
    });

    it('should have fallback centered styles', () => {
      render(
        <Avatar>
          <AvatarFallback data-testid="fallback">JD</AvatarFallback>
        </Avatar>
      );
      const fallback = screen.getByTestId('fallback');
      expect(fallback).toHaveClass('flex', 'h-full', 'w-full', 'items-center', 'justify-center');
    });
  });

  describe('Ref Forwarding', () => {
    it('should forward ref to Avatar', () => {
      const ref = React.createRef<HTMLSpanElement>();
      render(
        <Avatar ref={ref}>
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
      );
      expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    });

    it('should forward ref to AvatarImage', () => {
      const ref = React.createRef<HTMLImageElement>();
      render(
        <Avatar>
          <AvatarImage ref={ref} src="https://example.com/avatar.jpg" alt="User" />
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
      );
      expect(ref.current).toBeInstanceOf(HTMLImageElement);
    });
  });
});
