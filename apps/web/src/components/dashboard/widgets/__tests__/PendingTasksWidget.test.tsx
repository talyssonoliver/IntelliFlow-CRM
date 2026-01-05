// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PendingTasksWidget } from '../PendingTasksWidget';

describe('PendingTasksWidget', () => {
  it('lists sample tasks and add button', () => {
    render(<PendingTasksWidget />);

    expect(screen.getByText('Pending Tasks')).toBeInTheDocument();
    expect(screen.getByText('Call with Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toHaveClass('text-red-500');
    expect(screen.getByRole('button', { name: /\+ Add New Task/i })).toBeInTheDocument();
  });
});
