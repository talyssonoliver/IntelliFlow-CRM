import { describe, expect, it } from 'vitest';
import { cleanActivityText, hasMachineId, stripMachineIds } from '../activity-text';

// Built at run time so no id-shaped literal sits in the source.
const ID = 'c' + 'mw5j72u40001p5ug01kf3vot';
const OTHER = 'c' + 'mw5jn2xt000e0ipemiaxieeg';
const UUID = ['123e4567', 'e89b', '42d3', 'a456', '426614174000'].join('-');

describe('stripMachineIds', () => {
  it('removes the label and the id from the Pitshanger row', () => {
    const text = `Reply in their thread to the owner. Offer: GBP 0 today. COA ledger row ${ID}.`;
    expect(stripMachineIds(text)).toBe('Reply in their thread to the owner. Offer: GBP 0 today.');
  });

  it('removes other labels, with or without a colon, and an empty bracket they leave', () => {
    expect(stripMachineIds(`Imported (lead id ${ID}) today`)).toBe('Imported today');
    expect(stripMachineIds(`ref: ${ID} was sent`)).toBe('was sent');
    expect(stripMachineIds(`Row ID ${ID}`)).toBe('');
  });

  it('removes a chain of labels and labels written with an underscore or hyphen', () => {
    expect(stripMachineIds(`Done. COA ledger row id ${ID}.`)).toBe('Done.');
    expect(stripMachineIds(`Done lead_id ${ID}`)).toBe('Done');
    expect(stripMachineIds(`Done lead-id: ${ID}`)).toBe('Done');
  });

  it('removes the label in front of a uuid, and a bare cuid and uuid', () => {
    expect(stripMachineIds(`Imported lead id ${UUID} ok`)).toBe('Imported ok');
    expect(stripMachineIds(`Synced ${OTHER} and ${UUID} ok`)).toBe('Synced and ok');
  });

  it('removes an uppercase id', () => {
    expect(stripMachineIds(`Synced ${ID.toUpperCase()} ok`)).toBe('Synced ok');
  });

  it('keeps an id inside an address so the link still works', () => {
    const text = `See https://app.example.invalid/leads/${ID} now`;
    expect(stripMachineIds(text)).toBe(text);
  });

  it('keeps an id in a query value or a fragment, and a bare path', () => {
    for (const link of [
      `https://app.example.invalid/leads?id=${ID}`,
      `https://app.example.invalid/leads#${ID}`,
      `www.example.invalid?ref=${UUID}`,
      `/leads/${ID}`,
    ]) {
      expect(stripMachineIds(`See ${link} now`)).toBe(`See ${link} now`);
    }
  });

  it('keeps an id that starts or ends an email address or a relative path', () => {
    for (const word of [`${ID}@example.invalid`, `${ID}/report`, `a.${ID}@example.invalid`]) {
      expect(stripMachineIds(`Reply to ${word} now`)).toBe(`Reply to ${word} now`);
    }
    expect(stripMachineIds(`See page?id=${ID} now`)).toBe(`See page?id=${ID} now`);
  });

  it('still removes an id that follows a link in the same sentence', () => {
    expect(stripMachineIds(`See https://app.example.invalid/x then ref ${ID}.`)).toBe(
      'See https://app.example.invalid/x then.'
    );
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

  it('tidies only where the id was: ellipses, ".NET" and spacing elsewhere stay', () => {
    expect(stripMachineIds(`Wait... uses .NET  here. COA ledger row ${ID}.`)).toBe(
      'Wait... uses .NET  here.'
    );
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

describe('cleanActivityText', () => {
  it('cleans both fields and treats a missing description as empty', () => {
    expect(cleanActivityText({ title: `Sent (ref ${ID})`, description: `Note ${ID}` })).toEqual({
      title: 'Sent',
      description: 'Note',
    });
    expect(cleanActivityText({ title: 'Call' })).toEqual({ title: 'Call', description: '' });
    expect(cleanActivityText({ title: 'Call', description: null })).toEqual({
      title: 'Call',
      description: '',
    });
  });

  it('gives a title that was only an id a neutral one', () => {
    expect(cleanActivityText({ title: ID }).title).toBe('Activity');
  });
});
