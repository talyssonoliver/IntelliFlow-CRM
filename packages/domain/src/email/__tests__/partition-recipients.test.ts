import { describe, expect, it } from 'vitest';
import { partitionRecipients } from '../partition-recipients';

describe('partitionRecipients', () => {
  it('returns empty lists for empty input', () => {
    expect(partitionRecipients({ to: [], cc: [], bcc: [] }, new Set())).toEqual({
      to: [],
      cc: [],
      bcc: [],
      skipped: [],
    });
  });

  it('keeps everything when nothing is suppressed, preserving order', () => {
    expect(
      partitionRecipients({ to: ['b@x.example', 'a@x.example'], cc: ['c@x.example'] }, new Set())
    ).toEqual({ to: ['b@x.example', 'a@x.example'], cc: ['c@x.example'], bcc: [], skipped: [] });
  });

  it('drops suppressed addresses case-insensitively from to, cc and bcc', () => {
    const result = partitionRecipients(
      { to: ['Gone@X.example', 'ok@x.example'], cc: ['gone2@x.example'], bcc: ['GONE3@x.example'] },
      new Set(['gone@x.example', 'gone2@x.example', 'gone3@x.example'])
    );
    expect(result).toEqual({
      to: ['ok@x.example'],
      cc: [],
      bcc: [],
      skipped: ['gone@x.example', 'gone2@x.example', 'gone3@x.example'],
    });
  });

  it('de-duplicates a recipient that appears in more than one list, keeping the first', () => {
    expect(
      partitionRecipients(
        {
          to: ['a@x.example', 'A@x.example'],
          cc: ['a@x.example', 'b@x.example'],
          bcc: ['b@x.example'],
        },
        new Set()
      )
    ).toEqual({ to: ['a@x.example'], cc: ['b@x.example'], bcc: [], skipped: [] });
  });

  it('reports a suppressed address once even when listed twice', () => {
    expect(
      partitionRecipients({ to: ['s@x.example'], bcc: ['S@x.example'] }, new Set(['s@x.example']))
        .skipped
    ).toEqual(['s@x.example']);
  });

  it('skips everyone when all recipients are suppressed', () => {
    const result = partitionRecipients({ to: ['a@x.example'] }, new Set(['a@x.example']));
    expect(result.to).toEqual([]);
    expect(result.skipped).toEqual(['a@x.example']);
  });
});
