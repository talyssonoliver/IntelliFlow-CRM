import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VERTICAL_MODULE_MAP } from '@intelliflow/domain';

import {
  BusinessTypePicker,
  BUSINESS_TYPE_TOOLS,
  BUSINESS_TYPE_ICONS,
} from '../BusinessTypePicker';

describe('BusinessTypePicker', () => {
  it('lists every business type and reports the choice', () => {
    const onChange = vi.fn();
    render(<BusinessTypePicker value={null} onChange={onChange} />);

    expect(screen.getAllByRole('radio')).toHaveLength(5);
    fireEvent.click(screen.getByRole('radio', { name: /law firm/i }));
    expect(onChange).toHaveBeenCalledWith('LAW_FIRM');
  });

  it('marks the current value', () => {
    render(<BusinessTypePicker value="AGENCY" onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /agency/i })).toBeChecked();
  });

  it('preselects nothing when there is no value', () => {
    render(<BusinessTypePicker value={null} onChange={vi.fn()} />);
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked();
  });

  it('gives each card an icon and a line naming the tools it gets', () => {
    render(<BusinessTypePicker value={null} onChange={vi.fn()} />);
    expect(screen.getAllByText(/^Gets:/)).toHaveLength(5);
    for (const icon of Object.values(BUSINESS_TYPE_ICONS)) {
      expect(document.body.textContent).toContain(icon);
    }
  });

  it('names the vertical module each type adds, matching the module map', () => {
    expect(VERTICAL_MODULE_MAP.LAW_FIRM).toContain('LEGAL');
    expect(BUSINESS_TYPE_TOOLS.LAW_FIRM).toMatch(/Cases/);
    expect(VERTICAL_MODULE_MAP.AGENCY).toContain('SUPPORT');
    expect(BUSINESS_TYPE_TOOLS.AGENCY).toMatch(/Tickets/);
    expect(VERTICAL_MODULE_MAP.SHOP_ECOMMERCE).toContain('COMMERCE');
    expect(BUSINESS_TYPE_TOOLS.SHOP_ECOMMERCE).toMatch(/Commerce/);
    expect(BUSINESS_TYPE_TOOLS.TRADES_HOME_SERVICES).not.toMatch(/Cases|Tickets|Commerce/);
  });

  it('words the shared tools the same way on every card', () => {
    const core = 'CRM, AI assistant and reports';
    expect(BUSINESS_TYPE_TOOLS).toEqual({
      TRADES_HOME_SERVICES: core,
      AGENCY: `${core}, plus Tickets and Help Center`,
      LAW_FIRM: `${core}, plus Cases`,
      SHOP_ECOMMERCE: `${core}, plus Commerce`,
      OTHER: core,
    });
    render(<BusinessTypePicker value={null} onChange={vi.fn()} />);
    expect(document.body.textContent).not.toMatch(/AI and reports/);
    expect(screen.getAllByText(new RegExp(`^Gets:.*${core}`))).toHaveLength(5);
  });
});
