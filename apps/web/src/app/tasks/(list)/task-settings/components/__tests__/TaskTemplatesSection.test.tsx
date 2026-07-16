import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TaskTemplatesSection } from '../TaskTemplatesSection';
import type { TaskTemplateInput } from '@intelliflow/validators';

const oneTemplate: TaskTemplateInput[] = [
  { id: 't1', name: 'Follow up', defaultPriority: 'HIGH', defaultDueOffsetDays: 2 },
];

describe('TaskTemplatesSection (PG-191)', () => {
  it('renders an empty state when there are no templates', () => {
    render(<TaskTemplatesSection value={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/no task templates/i)).toBeInTheDocument();
  });

  it('renders a row per template with name-scoped Edit/Delete accessible names', () => {
    render(<TaskTemplatesSection value={oneTemplate} onChange={vi.fn()} />);
    expect(screen.getByText('Follow up')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit template follow up/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete template follow up/i })).toBeInTheDocument();
  });

  it('deletes a template via onChange with the filtered list', () => {
    const onChange = vi.fn();
    render(<TaskTemplatesSection value={oneTemplate} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /delete template follow up/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('adds a template through the dialog', () => {
    const onChange = vi.fn();
    render(<TaskTemplatesSection value={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /add template/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/name/i), { target: { value: 'Kickoff' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^add$/i }));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Kickoff', defaultPriority: 'MEDIUM' }),
    ]);
  });

  it('blocks a duplicate template name with an inline error and does not save', () => {
    const onChange = vi.fn();
    render(<TaskTemplatesSection value={oneTemplate} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /add template/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/name/i), { target: { value: 'follow up' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^add$/i }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/already exists/i);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders header + add icons as decorative (aria-hidden)', () => {
    const { container } = render(<TaskTemplatesSection value={[]} onChange={vi.fn()} />);
    container.querySelectorAll('.material-symbols-outlined').forEach((icon) => {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });
});
