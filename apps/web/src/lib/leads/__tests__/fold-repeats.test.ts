import { describe, it, expect } from 'vitest';
import { foldRepeats, repeatKey, threadSubject } from '../fold-repeats';

const a = (id: string, type: string, title: string, user = 'Talysson Oliveira') => ({
  id,
  type,
  title,
  user,
});

describe('foldRepeats (owner 21/11: same information, same lead)', () => {
  it('keeps the newest AI insight and folds the earlier ones of that type under it', () => {
    const list = [
      a('3', 'qualification', 'Northfield Plumbing is qualified and ready to move', 'AI Insights'),
      a('call', 'call', 'Call with Robert'),
      a(
        '2',
        'qualification',
        'Northfield Plumbing is a qualified lead close to hot',
        'AI Insights'
      ),
      a(
        '1',
        'qualification',
        'Northfield Plumbing is a qualified lead close to hot',
        'AI Insights'
      ),
    ];
    const folded = foldRepeats(list);
    expect(folded.map((g) => [g.head.id, g.previous.map((p) => p.id)])).toEqual([
      ['3', ['2', '1']],
      ['call', []],
    ]);
  });

  it('folds an email thread by subject, ignoring Re: and Fwd:', () => {
    const list = [
      a('e3', 'email', 'Re: Re: Helping Northfield Plumbing win more jobs'),
      a('e2', 'email', 'RE: Helping Northfield Plumbing win more jobs'),
      a('e1', 'email', 'Helping Northfield Plumbing win more jobs'),
      a('e0', 'email', 'Your launch brief'),
    ];
    expect(foldRepeats(list).map((g) => [g.head.id, g.previous.length])).toEqual([
      ['e3', 2],
      ['e0', 0],
    ]);
  });

  it('never folds people’s own notes, calls or meetings', () => {
    const list = [a('n2', 'note', 'Called back'), a('n1', 'note', 'Called back')];
    expect(foldRepeats(list)).toHaveLength(2);
    expect(repeatKey(list[0])).toBeNull();
  });

  it('normalises a thread subject', () => {
    expect(threadSubject('  Fwd:  RE:   Hello   There ')).toBe('hello there');
  });
});
