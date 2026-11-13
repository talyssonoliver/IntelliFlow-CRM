// @vitest-environment jsdom
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../EventTypeDialog', () => ({
  LOCATION_LABELS: {},
  EventTypeDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="event-type-dialog" /> : null,
}));

import { EventTypeList, type EventTypeListHandle } from '../EventTypeList';

function renderList(canEdit: boolean) {
  const ref = React.createRef<EventTypeListHandle>();
  render(
    <EventTypeList
      ref={ref}
      items={[]}
      canEdit={canEdit}
      isBusy={false}
      isSaving={false}
      bookingBaseUrl={null}
      defaultHost={null}
      onSave={vi.fn()}
      onDelete={vi.fn()}
    />
  );
  return ref;
}

describe('EventTypeList empty state and permissions', () => {
  it('offers Create event type to editors', () => {
    renderList(true);
    fireEvent.mouseEnter(screen.getByRole('region'));
    fireEvent.click(screen.getByRole('button', { name: /Create event type/ }));
    expect(screen.getByTestId('event-type-dialog')).toBeInTheDocument();
  });

  it('offers no create action to read-only users, from the empty state or the handle', () => {
    const ref = renderList(false);
    fireEvent.mouseEnter(screen.getByRole('region'));
    expect(screen.queryByRole('button', { name: /Create event type/ })).not.toBeInTheDocument();
    act(() => ref.current?.openCreate());
    expect(screen.queryByTestId('event-type-dialog')).not.toBeInTheDocument();
  });
});
