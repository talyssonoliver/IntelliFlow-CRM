// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../src/components/alert-dialog';
import { Button } from '../src/components/button';

describe('AlertDialog', () => {
  it('opens when trigger is clicked and shows title/description', async () => {
    const user = userEvent.setup();
    render(
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button>Open Alert</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete item</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open Alert' }));

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Delete item')).toBeInTheDocument();
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
  });

  it('renders action and cancel buttons with expected styles', async () => {
    const user = userEvent.setup();
    render(
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button>Launch</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-btn">Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="action-btn">Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Launch' }));

    expect(screen.getByTestId('cancel-btn')).toHaveClass('mt-2', 'sm:mt-0');
    expect(screen.getByTestId('action-btn')).toHaveClass('bg-primary', 'text-primary-foreground');
  });

  it('renders overlay when dialog is open', async () => {
    const user = userEvent.setup();
    render(
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button>Show Dialog</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Title</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>
    );

    await user.click(screen.getByRole('button', { name: 'Show Dialog' }));

    const overlay = document.querySelector('.bg-black\\/80');
    expect(overlay).toBeInTheDocument();
  });
});
