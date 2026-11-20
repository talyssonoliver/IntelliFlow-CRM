import { describe, expect, it } from 'vitest';
import { hasMachineId, stripMachineIds } from '../activity-text';

// Built at run time so no id-shaped literal sits in the source.
const ID = 'c' + 'mw5j72u40001p5ug01kf3vot';
const OTHER = 'c' + 'mw5jn2xt000e0ipemiaxieeg';
const UUID = ['123e4567', 'e89b', '42d3', 'a456', '426614174000'].join('-');

describe('stripMachineIds', () => {
  it('removes the label and the id from the Pitshanger row', () => {
    const text = `Reply in their thread to the owner. Offer: GBP 0 today. COA ledger row ${ID}.`;
    expect(stripMachineIds(text)).toBe('Reply in their thread to the owner. Offer: GBP 0 today.');
  });

  it('removes other labels, with or without a colon', () => {
    expect(stripMachineIds(`Imported (lead id ${ID}) today`)).toBe('Imported () today');
    expect(stripMachineIds(`ref: ${ID} was sent`)).toBe('was sent');
    expect(stripMachineIds(`Row ID ${ID}`)).toBe('');
  });

  it('removes a bare cuid and a uuid', () => {
    expect(stripMachineIds(`Synced ${OTHER} and ${UUID} ok`)).toBe('Synced and ok');
  });

  it('keeps a label that is part of a longer word', () => {
    expect(stripMachineIds(`android ${ID}`)).toBe('android');
  });

  it('leaves text without an id untouched, including lines and spacing', () => {
    const text = 'First line\n\nSecond  line with  spaces. COA ledger row';
    expect(stripMachineIds(text)).toBe(text);
  });

  it('keeps a long lowercase word that is not an id', () => {
    const word = 'c' + 'o'.repeat(24);
    expect(stripMachineIds(`say ${word}`)).toBe(`say ${word}`);
  });

  it('keeps line breaks when it cleans', () => {
    expect(stripMachineIds(`One\nCOA ledger row ${ID}.\nTwo`)).toBe('One\n\nTwo');
  });

  it('is idempotent', () => {
    const once = stripMachineIds(`Done. COA ledger row ${ID}.`);
    expect(stripMachineIds(once)).toBe(once);
  });
});

describe('hasMachineId', () => {
  it('is true only when an id is present', () => {
    expect(hasMachineId(`x ${ID}`)).toBe(true);
    expect(hasMachineId('x y')).toBe(false);
    expect(hasMachineId(ID)).toBe(true);
  });
});
