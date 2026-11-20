import { describe, expect, it } from 'vitest';
import { cleanActivityText, hasMachineId, isRecordId, stripMachineIds } from '../activity-text';

// Built at run time so no id-shaped literal sits in the source.
const ID = 'c' + 'mw5j72u40001p5ug01kf3vot';
const UUID = ['123e4567', 'e89b', '42d3', 'a456', '426614174000'].join('-');

describe('stripMachineIds: only "COA ledger row <id>." is removed', () => {
  it('removes the label, the id and the full stop from the Pitshanger row', () => {
    const text = `Reply in their thread to the owner. Offer: GBP 0 today. COA ledger row ${ID}.`;
    expect(stripMachineIds(text)).toBe('Reply in their thread to the owner. Offer: GBP 0 today.');
  });

  it('still cleans a row whose earlier sentences hold a slash, a link or a path', () => {
    const text =
      `Offer: GBP 69.99/month, see https://shop.example.invalid/a and C:\\Exports\\My Files. ` +
      `COA ledger row ${ID}.`;
    expect(stripMachineIds(text)).toBe(
      'Offer: GBP 69.99/month, see https://shop.example.invalid/a and C:\\Exports\\My Files.'
    );
  });

  it('ignores case and spacing, and removes an id in the middle of the text', () => {
    expect(stripMachineIds(`Sent. coa LEDGER row   ${ID.toUpperCase()}. Thanks`)).toBe(
      'Sent. Thanks'
    );
    expect(stripMachineIds(`Sent COA ledger row ${ID} today`)).toBe('Sent today');
  });

  it('removes every occurrence', () => {
    expect(stripMachineIds(`A COA ledger row ${ID}. B COA ledger row ${ID}.`)).toBe('A B');
  });

  it('keeps line breaks and spacing elsewhere', () => {
    expect(stripMachineIds(`One\nCOA ledger row ${ID}.\nTwo`)).toBe('One\n\nTwo');
    expect(stripMachineIds(`Wait... uses .NET  here. COA ledger row ${ID}.`)).toBe(
      'Wait... uses .NET  here.'
    );
  });

  it('is idempotent', () => {
    const once = stripMachineIds(`Done. COA ledger row ${ID}.`);
    expect(stripMachineIds(once)).toBe(once);
  });

  it.each([
    ['an id with no label', `Synced ${ID} and ${UUID} ok`],
    ['another label', `Imported (lead id ${ID}) ref ${ID} row id ${UUID}`],
    ['a key=id assignment', `Price follow-up sent (lead_id=${ID})`],
    ['a link path', `See https://app.example.invalid/leads/${ID} now`],
    ['a path with the words in it', `Saved to C:\\Exports\\COA ledger row ${ID}`.replace(ID, 'x')],
    ['an email address', `Reply to ${ID}@example.invalid now`],
    ['a file name', `Open ${UUID}.pdf`],
    ['the label without an id', 'See the COA ledger row for details'],
    ['the label with a short number', 'COA ledger row 12345'],
    ['the label inside a longer word', `xCOA ledger row ${ID}`],
  ])('leaves %s exactly as written', (_name, text) => {
    expect(stripMachineIds(text)).toBe(text);
  });

  it('keeps a long lowercase word that is not an id', () => {
    const word = 'c' + 'o'.repeat(24);
    expect(stripMachineIds(`COA ledger row ${word}`)).toBe(`COA ledger row ${word}`);
  });

  it('keeps every index right when a character changes length in lower case', () => {
    expect(stripMachineIds(`İİİ note. COA ledger row ${ID}.`)).toBe('İİİ note.');
  });
});

describe('isRecordId and hasMachineId', () => {
  it('knows a whole record id', () => {
    expect(isRecordId(ID)).toBe(true);
    expect(isRecordId(UUID)).toBe(true);
    expect(isRecordId('c' + 'o'.repeat(24))).toBe(false);
    expect(isRecordId(`${ID} `)).toBe(false);
    expect(isRecordId('coa-qualified')).toBe(false);
  });

  it('is true for the ledger row form and for a whole id, false otherwise', () => {
    expect(hasMachineId(`Done. COA ledger row ${ID}.`)).toBe(true);
    expect(hasMachineId(ID)).toBe(true);
    expect(hasMachineId(`x ${ID}`)).toBe(false);
    expect(hasMachineId('x y')).toBe(false);
  });
});

describe('cleanActivityText', () => {
  it('cleans both fields and treats a missing description as empty', () => {
    expect(
      cleanActivityText({
        title: `Price follow-up sent COA ledger row ${ID}.`,
        description: `Note. COA ledger row ${ID}.`,
      })
    ).toEqual({ title: 'Price follow-up sent', description: 'Note.' });
    expect(cleanActivityText({ title: 'Call' })).toEqual({ title: 'Call', description: '' });
    expect(cleanActivityText({ title: 'Call', description: null })).toEqual({
      title: 'Call',
      description: '',
    });
  });

  it('gives a title that was only an id, or only the ledger row form, a neutral one', () => {
    expect(cleanActivityText({ title: ID }).title).toBe('Activity');
    expect(cleanActivityText({ title: `COA ledger row ${ID}.` }).title).toBe('Activity');
  });
});
