import { describe, expect, it } from 'vitest';
import { cleanActivityText, hasMachineId, stripMachineIds } from '../activity-text';

// Built at run time so no id-shaped literal sits in the source.
const ID = 'c' + 'mw5j72u40001p5ug01kf3vot';
const UUID = ['123e4567', 'e89b', '42d3', 'a456', '426614174000'].join('-');

describe('stripMachineIds: an id a label introduces goes with its label', () => {
  it('removes the label and the id from the Pitshanger row', () => {
    const text = `Reply in their thread to the owner. Offer: GBP 0 today. COA ledger row ${ID}.`;
    expect(stripMachineIds(text)).toBe('Reply in their thread to the owner. Offer: GBP 0 today.');
  });

  it('removes other labels, with or without a colon, and the empty bracket they leave', () => {
    expect(stripMachineIds(`Imported (lead id ${ID}) today`)).toBe('Imported today');
    expect(stripMachineIds(`ref: ${ID} was sent`)).toBe('was sent');
    expect(stripMachineIds(`Row ID ${ID}`)).toBe('');
    expect(stripMachineIds(`Sent (ref ${ID}).`)).toBe('Sent.');
    expect(stripMachineIds(`Replied, ref ${ID}, thanks`)).toBe('Replied, thanks');
  });

  it('removes a chain of labels and labels written with an underscore or hyphen', () => {
    expect(stripMachineIds(`Done. COA ledger row id ${ID}.`)).toBe('Done.');
    expect(stripMachineIds(`Done lead_id ${ID}`)).toBe('Done');
    expect(stripMachineIds(`Done lead-id: ${ID}`)).toBe('Done');
  });

  it('removes key=id and key:id references, but not a colon that is not a label', () => {
    expect(stripMachineIds(`Price follow-up sent (lead_id=${ID})`)).toBe('Price follow-up sent');
    expect(stripMachineIds(`Synced id=${ID} ok`)).toBe('Synced ok');
    expect(stripMachineIds(`ref:${UUID}`)).toBe('');
    expect(stripMachineIds(`Sent lead_id:${ID} today`)).toBe('Sent today');
    for (const text of [`See urn:uuid:${UUID} now`, `See C:${ID} now`]) {
      expect(stripMachineIds(text)).toBe(text);
    }
  });

  it('removes the label in front of a uuid, and an uppercase id', () => {
    expect(stripMachineIds(`Imported lead id ${UUID} ok`)).toBe('Imported ok');
    expect(stripMachineIds(`Synced ref ${ID.toUpperCase()} ok`)).toBe('Synced ok');
  });

  it('removes an id that is the whole text', () => {
    expect(stripMachineIds(ID)).toBe('');
    expect(stripMachineIds(`  ${UUID} `)).toBe('');
  });

  it('keeps a label that is part of a longer word, and a label inside a link', () => {
    expect(stripMachineIds(`android ${ID}`)).toBe(`android ${ID}`);
    const link = 'https://example.invalid/reference';
    expect(stripMachineIds(`See ${link} ref ${ID}.`)).toBe(`See ${link}.`);
    for (const word of [
      'https://example.invalid/search?q=(reference',
      'https://example.invalid/wiki/Category:Reference',
      'https://example.invalid/a;ref',
      'www.example.invalid/ref',
      'a@example.invalid/row',
    ]) {
      expect(stripMachineIds(`See ${word} ${ID}.`)).toBe(`See ${word} ${ID}.`);
    }
  });

  it('keeps a label and id inside a quoted path or link that has spaces in it', () => {
    for (const text of [
      `Open "C:\\Exports\\Customer ref ${ID}"`,
      `Open "https://example.invalid/my files/lead id ${UUID}"`,
      `Open 'C:\\Exports\\Customer ref ${ID}'`,
      `Open "Customer ref ${ID}"`,
      `Quote: "he said lead id ${ID}"`,
    ]) {
      expect(stripMachineIds(text)).toBe(text);
    }
    expect(stripMachineIds(`Said "hello" ref ${ID}.`)).toBe('Said "hello".');
    expect(stripMachineIds(`It's done ref ${ID}.`)).toBe("It's done.");
  });
  it('tracks quotes properly: apostrophes in words and closed quotes do not hide a labelled id', () => {
    expect(stripMachineIds(`It's in 'C:\\Exports\\Customer ref ${ID}'`)).toBe(
      `It's in 'C:\\Exports\\Customer ref ${ID}'`
    );
    expect(stripMachineIds(`Don't forget, we're done ref ${ID}.`)).toBe(
      "Don't forget, we're done."
    );
    expect(stripMachineIds(`He said "ok" and 'yes' then ref ${ID}.`)).toBe(
      `He said "ok" and 'yes' then.`
    );
  });
  it('removes a labelled id that follows a link in the same sentence', () => {
    expect(stripMachineIds(`See https://app.example.invalid/x then ref ${ID}.`)).toBe(
      'See https://app.example.invalid/x then.'
    );
  });
});

describe('stripMachineIds: an id with no label is left exactly as written', () => {
  it.each([
    ['a link path', `See https://app.example.invalid/leads/${ID} now`],
    ['a query value', `See https://app.example.invalid/leads?id=${ID} now`],
    ['a query value of a bare page', `See page?id=${ID} now`],
    ['a second query value', `See a=1&id=${ID} now`],
    ['a fragment', `See #${ID} now`],
    ['a www address', `See www.example.invalid?ref=${UUID} now`],
    ['a relative path', `See /leads/${ID} now`],
    ['an email address', `Reply to ${ID}@example.invalid now`],
    ['an email address, quoted', `Reply to "${ID}"@example.invalid`],
    ['a file name', `Open ${UUID}.pdf`],
    ['a bracketed file name', `See (${ID}).pdf`],
    ['a host name', `See ${ID}.example.invalid`],
    ['a file name with a suffix', `Exported ${ID}_final.csv`],
    ['a Windows path', `See C:\\Exports\\${UUID}.pdf now`],
    ['a UNC path', `See \\\\server\\share\\${ID}\\file.txt now`],
    ['a relative backslash path', `See exports\\${ID}.csv now`],
    ['a quoted Windows path with spaces', `Open "C:\\Exports\\Customer ${ID}"`],
    ['a bracketed id inside a link', `See https://example.invalid/leads/(${ID}) now`],
    ['a urn', `See urn:uuid:${UUID} now`],
    ['a bare id in a sentence', `Synced ${ID} and ${UUID} ok`],
  ])('%s', (_name, text) => {
    expect(stripMachineIds(text)).toBe(text);
    expect(hasMachineId(text)).toBe(false);
  });

  it('keeps a long lowercase word that is not an id', () => {
    const word = 'c' + 'o'.repeat(24);
    expect(stripMachineIds(`say ref ${word}`)).toBe(`say ref ${word}`);
  });
});

describe('stripMachineIds: tidying', () => {
  it('leaves text without an id untouched, including lines and spacing', () => {
    const text = 'First line\n\nSecond  line with  spaces. COA ledger row';
    expect(stripMachineIds(text)).toBe(text);
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
  it('is true only when a labelled or whole-text id is present', () => {
    expect(hasMachineId(`x ref ${ID}`)).toBe(true);
    expect(hasMachineId(ID)).toBe(true);
    expect(hasMachineId('x y')).toBe(false);
    expect(hasMachineId(`x ${ID}`)).toBe(false);
  });
});

describe('cleanActivityText', () => {
  it('cleans both fields and treats a missing description as empty', () => {
    expect(
      cleanActivityText({ title: `Sent (ref ${ID})`, description: `Note lead id ${ID}.` })
    ).toEqual({ title: 'Sent', description: 'Note.' });
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
