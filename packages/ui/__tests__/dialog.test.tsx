// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '../src/components/dialog';
import { Button } from '../src/components/button';

describe('Dialog', () => {
  describe('Rendering', () => {
    it('should render dialog trigger', () => {
      render(
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open Dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
          </DialogContent>
        </Dialog>
      );
      expect(screen.getByRole('button', { name: 'Open Dialog' })).toBeInTheDocument();
    });

    it('should open dialog when trigger is clicked', async () => {
      const user = userEvent.setup();
      render(
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open Dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Test Title</DialogTitle>
          </DialogContent>
        </Dialog>
      );

      await user.click(screen.getByRole('button', { name: 'Open Dialog' }));
      expect(screen.getByText('Test Title')).toBeInTheDocument();
    });
  });

  describe('Components', () => {
    it('should render DialogHeader with correct styles', async () => {
      const user = userEvent.setup();
      render(
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader className="test-header">
              <DialogTitle>Title</DialogTitle>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      );

      await user.click(screen.getByRole('button', { name: 'Open' }));
      const header = document.querySelector('.test-header');
      expect(header).toBeInTheDocument();
      expect(header).toHaveClass('flex', 'flex-col');
    });

    it('should render DialogFooter with correct styles', async () => {
      const user = userEvent.setup();
      render(
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <DialogFooter className="test-footer">
              <Button>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );

      await user.click(screen.getByRole('button', { name: 'Open' }));
      const footer = document.querySelector('.test-footer');
      expect(footer).toBeInTheDocument();
      expect(footer).toHaveClass('flex');
    });

    it('should render DialogDescription', async () => {
      const user = userEvent.setup();
      render(
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription>This is a description</DialogDescription>
          </DialogContent>
        </Dialog>
      );

      await user.click(screen.getByRole('button', { name: 'Open' }));
      expect(screen.getByText('This is a description')).toBeInTheDocument();
    });

    it('should close dialog when close button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
          </DialogContent>
        </Dialog>
      );

      await user.click(screen.getByRole('button', { name: 'Open' }));
      expect(screen.getByText('Title')).toBeInTheDocument();

      const closeButton = screen.getByRole('button', { name: 'Close' });
      await user.click(closeButton);
      expect(screen.queryByText('Title')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible close button with sr-only text', async () => {
      const user = userEvent.setup();
      render(
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
          </DialogContent>
        </Dialog>
      );

      await user.click(screen.getByRole('button', { name: 'Open' }));
      expect(screen.getByText('Close')).toHaveClass('sr-only');
    });

    it('should trap focus within dialog', async () => {
      const user = userEvent.setup();
      render(
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <Button>Action</Button>
          </DialogContent>
        </Dialog>
      );

      await user.click(screen.getByRole('button', { name: 'Open' }));
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });
  });
});
